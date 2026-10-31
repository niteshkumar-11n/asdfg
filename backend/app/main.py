"""Read-only Flask API and optional static SPA host."""
from datetime import date, timedelta
import hashlib
import json
import math
import os
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask.json.provider import DefaultJSONProvider
from . import analytics, config
from .data import SnapshotUnavailable, load_snapshot


class StrictJSONProvider(DefaultJSONProvider):
    def dumps(self, obj, **kwargs):
        kwargs["allow_nan"] = False
        return super().dumps(obj, **kwargs)


def _finite(value):
    if isinstance(value, dict):
        return {key: _finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if hasattr(value, "item"):
        return _finite(value.item())
    return value


def _scope(meta):
    window = meta.get("window") or config.window_metadata()
    return (
        date.fromisoformat(window.get("decision_from", config.DECISION_START.isoformat())),
        date.fromisoformat(window.get("decision_to", config.DECISION_END.isoformat())),
    )


def _dates(meta):
    window = meta.get("window") or config.window_metadata()
    actual_from = date.fromisoformat(window.get("actual_from", config.DECISION_START.isoformat()))
    actual_to = date.fromisoformat(window.get("actual_to", config.DELIVERY_END.isoformat()))
    decision_from, decision_to = _scope(meta)
    return window, actual_from, actual_to, decision_from, decision_to


def _expected_rows(start, end_inclusive):
    return config.half_hour_count(start, end_inclusive)


def create_app(data_dir=None, static_dir=None):
    app = Flask(__name__)
    app.json = StrictJSONProvider(app)
    root = str(config.resolve_path(data_dir or config.DATA_DIR))
    static = str(config.resolve_path(static_dir or config.STATIC_DIR))

    def snapshot():
        return load_snapshot(root)

    def _apply_cors(response):
        allowed = os.getenv("CORS_ORIGINS", "*")
        origin = request.headers.get("Origin")
        if allowed == "*":
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif origin:
            origins = [o.strip() for o in allowed.split(",") if o.strip()]
            if origin in origins or "*" in origins:
                response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS, HEAD"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept, Authorization, If-None-Match"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response

    @app.before_request
    def preflight():
        if request.method == "OPTIONS":
            response = app.make_default_options_response()
            return _apply_cors(response)

    @app.errorhandler(FileNotFoundError)
    def missing_snapshot(error):
        return jsonify({"error": f"{error}. Run python -m backend.app.ingest from the project root.", "code": "no_data"}), 503

    @app.errorhandler(SnapshotUnavailable)
    def updating_snapshot(error):
        return jsonify({"error": str(error), "code": error.code}), 503

    @app.errorhandler(ValueError)
    def bad_request(error):
        return jsonify({"error": str(error), "code": "invalid_request"}), 400

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify({"error": "This read-only API accepts GET requests only.", "code": "method_not_allowed"}), 405

    @app.get("/api/health")
    def health():
        try:
            data = snapshot()
            return jsonify({"status": "ok", "data_loaded": True, "source": data["meta"].get("source"), "synthetic": data["meta"].get("synthetic", False)})
        except FileNotFoundError as error:
            return jsonify({"status": "unavailable", "data_loaded": False, "error": str(error), "code": "no_data"}), 503
        except Exception as error:
            return jsonify({"status": "unavailable", "data_loaded": False, "error": str(error), "code": "updating"}), 503

    @app.get("/api/meta")
    def meta():
        data = snapshot()
        metadata, out, forecasts = data["meta"], data["out"], data["fc"]
        window, actual_from, actual_to, decision_from, decision_to = _dates(metadata)
        cadence = {}
        if not forecasts.empty:
            local_publish = forecasts.publish_time.dt.tz_convert(config.UK)
            cadence = local_publish.groupby(local_publish.dt.date).nunique().describe().to_dict()
        steps = (
            forecasts.sort_values(["publish_time", "start_time"])
            .groupby("publish_time").start_time.diff().dropna().dt.total_seconds() / 60
            if not forecasts.empty else pd.Series(dtype=float)
        )
        forward = forecasts[forecasts.start_time >= forecasts.publish_time] if not forecasts.empty else forecasts
        actual_delivery_rows = 0
        if not out.empty:
            dates = out.start_time.dt.tz_convert(config.UK).dt.date
            actual_delivery_rows = int(dates.between(decision_from + timedelta(days=1), decision_to + timedelta(days=1)).sum())
        decision_count = (decision_to - decision_from).days + 1
        expected_actual = _expected_rows(actual_from, actual_to)
        expected_delivery = _expected_rows(decision_from + timedelta(days=1), decision_to + timedelta(days=1))
        delivery_start = pd.Timestamp(decision_from + timedelta(days=1), tz=config.UK).tz_convert(config.UTC)
        delivery_end = pd.Timestamp(decision_to + timedelta(days=2), tz=config.UK).tz_convert(config.UTC)
        delivery_forecasts = forecasts[(forecasts.start_time >= delivery_start) & (forecasts.start_time < delivery_end) & (forecasts.start_time >= forecasts.publish_time)] if not forecasts.empty else forecasts
        return jsonify(_finite({
            **metadata,
            "window": window,
            "cadence_per_day": {key: float(value) for key, value in cadence.items()},
            "forecast_step_min": int(steps.mode().iloc[0]) if len(steps) else None,
            "forecast_level_boundaries_mw": analytics.forecast_level_edges(forecasts)[1:-1],
            "horizon_hours": {
                "min": float(((forward.start_time - forward.publish_time).dt.total_seconds() / 3600).min()),
                "max": float(((forward.start_time - forward.publish_time).dt.total_seconds() / 3600).max()),
            } if not forward.empty else None,
            "cutoff_presets": list(config.CUTOFF_PRESETS),
            "publication_lag_min": config.PUBLICATION_LAG_MIN,
            "definitions": {
                "error": "actual - forecast; negative means wind under-delivered",
                "wmape": "sum(abs(error)) / sum(actual)",
                "band": "forecast plus P10 to P90 historical forward-horizon errors by snapshot-derived forecast quantile; floored at zero",
                "rolling_band": f"uses earlier delivery days; falls back to pooled calibration when fewer than {config.ROLLING_MIN_HISTORY_DAYS} days are available",
                "persistence_lag_min": config.OUTTURN_LAG_MIN,
                "min_horizon_bin_rows": config.MIN_HORIZON_BIN_ROWS,
                "horizon_bin_hours": config.HORIZON_BIN_HOURS,
            },
            "coverage": {
                "decision_days": decision_count,
                "expected_outturn_stored": expected_actual,
                "expected_delivery_actuals": expected_delivery,
                "actual_stored_rows": int(len(out)),
                "actual_delivery_rows": actual_delivery_rows,
                "missing_delivery_rows": max(0, expected_delivery - actual_delivery_rows),
                "forecast_delivery_rows": int(len(delivery_forecasts)),
                "forecast_vintages": int(forecasts.publish_time.nunique()) if not forecasts.empty else 0,
            },
        }))

    def parameters(meta):
        start, end = _scope(meta)
        raw_cutoff = request.args.get("cutoff", config.CUTOFF_PRESETS[0])
        config.cutoff_instant(start, raw_cutoff)
        try:
            publication_lag = int(request.args.get("publication_lag_min", str(config.PUBLICATION_LAG_MIN)))
        except ValueError:
            raise ValueError("publication_lag_min must be a whole number from 0 to 720") from None
        if not 0 <= publication_lag <= 720:
            raise ValueError("publication_lag_min must be from 0 to 720")
        day = date.fromisoformat(request.args.get("decision_date", start.isoformat()))
        if not start <= day <= end:
            raise ValueError(f"decision_date must be between {start.isoformat()} and {end.isoformat()}")
        return raw_cutoff, publication_lag, day, start, end

    @app.get("/api/decision")
    def decision():
        data = snapshot()
        cutoff, publication_lag, day, _, _ = parameters(data["meta"])
        band_mode = request.args.get("band", "pooled")
        if band_mode not in ("pooled", "rolling"):
            raise ValueError("band must be pooled or rolling")
        return jsonify(_finite({
            **analytics.decision(data["out"], data["fc"], day, cutoff, band_mode, publication_lag),
            "source": data["meta"].get("source"),
            "synthetic": data["meta"].get("synthetic", False),
        }))

    @app.get("/api/accuracy")
    def accuracy():
        data = snapshot()
        cutoff, publication_lag, _, start, end = parameters(data["meta"])
        return jsonify(_finite(analytics.full_accuracy(data["out"], data["fc"], cutoff, start, end, publication_lag)))

    @app.get("/api/horizon")
    def horizon():
        data = snapshot()
        cutoff, publication_lag, _, start, end = parameters(data["meta"])
        return jsonify(_finite(analytics.horizon(data["out"], data["fc"], cutoff, start, end, publication_lag, config.CUTOFF_PRESETS)))

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        if path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        if os.path.isfile(os.path.join(static, path)):
            return send_from_directory(static, path)
        if os.path.isfile(os.path.join(static, "index.html")):
            return send_from_directory(static, "index.html")
        if path == "":
            return jsonify({
                "status": "ok",
                "service": "WindDesk Backend API",
                "message": "Backend service is running. Connect your frontend or use the API endpoints.",
                "endpoints": {
                    "health": "/api/health",
                    "meta": "/api/meta",
                    "decision": "/api/decision",
                    "accuracy": "/api/accuracy",
                    "horizon": "/api/horizon",
                },
            }), 200
        return jsonify({"error": "Frontend is not built. Run npm run build from the project root."}), 404

    @app.after_request
    def postprocess_response(response):
        _apply_cors(response)
        if request.path.startswith("/api/") and response.status_code == 200:
            body = response.get_data()
            etag = hashlib.sha256(body).hexdigest()
            response.set_etag(etag)
            response.headers["Cache-Control"] = "max-age=300"
            if request.if_none_match.contains(etag):
                response.status_code = 304
                response.set_data(b"")
        return response

    return app


app = create_app()
