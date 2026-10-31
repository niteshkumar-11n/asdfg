"""Pure analytics for leakage-aware wind forecast evaluation."""
from datetime import date, timedelta
import numpy as np
import pandas as pd
from . import config


def _cutoff(day: date, cutoff: str, publication_lag_min: int = 0) -> pd.Timestamp:
    return pd.Timestamp(config.cutoff_instant(day, cutoff)) - pd.Timedelta(publication_lag_min, unit="min")


def select_latest(fc: pd.DataFrame, decision_day: date, cutoff: str, publication_lag_min: int = 0) -> pd.DataFrame:
    """Select the latest eligible forecast separately for each delivery period."""
    instant = _cutoff(decision_day, cutoff, publication_lag_min)
    delivery = decision_day + timedelta(days=1)
    start = pd.Timestamp(delivery, tz=config.UK).tz_convert(config.UTC)
    end = pd.Timestamp(delivery + timedelta(days=1), tz=config.UK).tz_convert(config.UTC)
    frame = fc[(fc.publish_time <= instant) & (fc.start_time >= start) & (fc.start_time < end)]
    if frame.empty:
        return frame.copy()
    return frame.sort_values(["start_time", "publish_time"]).drop_duplicates("start_time", keep="last").copy()


def select_previous(fc: pd.DataFrame, decision_day: date, cutoff: str, publication_lag_min: int = 0) -> pd.DataFrame:
    """Return the vintage immediately before the latest available vintage per period."""
    instant = _cutoff(decision_day, cutoff, publication_lag_min)
    delivery = decision_day + timedelta(days=1)
    start = pd.Timestamp(delivery, tz=config.UK).tz_convert(config.UTC)
    end = pd.Timestamp(delivery + timedelta(days=1), tz=config.UK).tz_convert(config.UTC)
    frame = fc[(fc.publish_time <= instant) & (fc.start_time >= start) & (fc.start_time < end)]
    if frame.empty:
        return frame.copy()
    frame = frame.sort_values(["start_time", "publish_time"]).copy()
    grouped = frame.groupby("start_time", sort=False)
    frame["_vintage_rank"] = grouped.cumcount()
    frame["_vintage_count"] = grouped.start_time.transform("size")
    frame = frame[frame._vintage_rank == frame._vintage_count - 2]
    return frame.drop(columns=["_vintage_rank", "_vintage_count"]).copy()


def persistence(out: pd.DataFrame, instant: pd.Timestamp) -> float | None:
    period_end = out.start_time + pd.Timedelta(30, unit="min")
    known = out[period_end + pd.Timedelta(config.OUTTURN_LAG_MIN, unit="min") <= instant]
    return float(known.sort_values("start_time").iloc[-1].actual_mw) if not known.empty else None


def _actual_for_day(out: pd.DataFrame, day: date) -> pd.DataFrame:
    delivery = day + timedelta(days=1)
    begin = pd.Timestamp(delivery, tz=config.UK).tz_convert(config.UTC)
    finish = pd.Timestamp(delivery + timedelta(days=1), tz=config.UK).tz_convert(config.UTC)
    return out[(out.start_time >= begin) & (out.start_time < finish)]


def evaluation(out: pd.DataFrame, fc: pd.DataFrame, cutoff=config.CUTOFF_PRESETS[0], day=None, publication_lag_min: int = 0):
    day = config.DECISION_START if day is None else day
    if not isinstance(day, date):
        day = date.fromisoformat(str(day))
    actual = _actual_for_day(out, day)
    latest = select_latest(fc, day, cutoff, publication_lag_min)
    previous = select_previous(fc, day, cutoff, publication_lag_min)
    previous = previous[["start_time", "forecast_mw"]].rename(columns={"forecast_mw": "previous_forecast_mw"})
    joined = actual.merge(latest, on="start_time", how="left")
    joined = joined.merge(previous, on="start_time", how="left").sort_values("start_time")
    joined["error_mw"] = joined.actual_mw - joined.forecast_mw
    joined["persistence_mw"] = persistence(out, _cutoff(day, cutoff))
    return joined


def metrics(frame: pd.DataFrame) -> dict:
    frame = frame.dropna(subset=["actual_mw", "forecast_mw"])
    if frame.empty:
        return {"n": 0, **{key: None for key in ("mae_mw", "rmse_mw", "bias_mw", "wmape", "p10_error_mw", "p90_error_mw", "p50_abs_mw", "p90_abs_mw", "p95_abs_mw", "skill_persistence")}}
    error = frame.actual_mw - frame.forecast_mw
    mae = float(error.abs().mean())
    persistence_error = (frame.actual_mw - frame.persistence_mw).abs().mean() if "persistence_mw" in frame and frame.persistence_mw.notna().any() else np.nan
    return {
        "n": int(len(frame)),
        "mae_mw": mae,
        "rmse_mw": float(np.sqrt((error ** 2).mean())),
        "bias_mw": float(error.mean()),
        "wmape": float(error.abs().sum() / frame.actual_mw.sum()) if frame.actual_mw.sum() else 0.0,
        "p10_error_mw": float(error.quantile(.1)),
        "p90_error_mw": float(error.quantile(.9)),
        "p50_abs_mw": float(error.abs().quantile(.5)),
        "p90_abs_mw": float(error.abs().quantile(.9)),
        "p95_abs_mw": float(error.abs().quantile(.95)),
        "skill_persistence": float(1 - mae / persistence_error) if persistence_error and not np.isnan(persistence_error) else None,
    }


def forecast_level_edges(fc: pd.DataFrame) -> list[float]:
    """Use snapshot forecast quantiles for reproducible, data-derived level bins."""
    forward = fc.loc[fc.start_time >= fc.publish_time, "forecast_mw"].dropna()
    if forward.empty:
        return []
    quantiles = np.linspace(0, 1, config.FORECAST_LEVEL_BINS + 1)[1:-1]
    inner = np.unique(forward.quantile(quantiles).to_numpy(dtype=float)).tolist()
    return [-float("inf"), *inner, float("inf")]


def _level_bin(values: pd.Series, edges: list[float]) -> pd.Series:
    if not edges:
        return pd.Series(np.nan, index=values.index)
    return pd.cut(values, edges, labels=False, include_lowest=True)


def band(fc: pd.DataFrame, out: pd.DataFrame, mode="pooled", day=None, edges: list[float] | None = None) -> pd.DataFrame:
    joined = fc.merge(out, on="start_time", how="inner")
    joined = joined[joined.start_time >= joined.publish_time].copy()
    joined["error_mw"] = joined.actual_mw - joined.forecast_mw
    mode_used = mode
    if mode == "rolling" and day is not None:
        target_day = pd.Timestamp(day, tz=config.UK).date()
        prior = joined[joined.start_time.dt.tz_convert(config.UK).dt.date < target_day]
        if prior.start_time.dt.tz_convert(config.UK).dt.date.nunique() >= config.ROLLING_MIN_HISTORY_DAYS:
            joined = prior
        else:
            mode_used = "pooled_fallback"
    if joined.empty:
        result = pd.DataFrame(columns=["level_bin", "p10_error_mw", "p90_error_mw", "n_band"])
        result.attrs["mode_used"] = mode_used
        return result
    edges = edges if edges is not None else forecast_level_edges(fc)
    joined["level_bin"] = _level_bin(joined.forecast_mw, edges)
    grouped = joined.dropna(subset=["level_bin"]).groupby("level_bin", observed=True).error_mw
    result = grouped.agg(
        p10_error_mw=lambda values: values.quantile(.1),
        p90_error_mw=lambda values: values.quantile(.9),
        n_band="size",
    ).reset_index()
    result.attrs["mode_used"] = mode_used
    return result


def _json_records(frame: pd.DataFrame) -> list[dict]:
    records = frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records")
    for row in records:
        for key, value in row.items():
            if hasattr(value, "isoformat"):
                row[key] = value.isoformat()
            elif isinstance(value, np.generic):
                row[key] = value.item()
    return records


def decision(out, fc, day, cutoff=config.CUTOFF_PRESETS[0], band_mode="pooled", publication_lag_min: int = 0):
    day = date.fromisoformat(day) if isinstance(day, str) else day
    rows = evaluation(out, fc, cutoff, day, publication_lag_min)
    edges = forecast_level_edges(fc)
    rows["level_bin"] = _level_bin(rows.forecast_mw, edges)
    bands = band(fc, out, band_mode, day, edges)
    rows = rows.merge(bands, on="level_bin", how="left")
    rows["p10_mw"] = (rows.forecast_mw + rows.p10_error_mw).clip(lower=0)
    rows["p90_mw"] = (rows.forecast_mw + rows.p90_error_mw).clip(lower=0)
    rows["horizon_h"] = (rows.start_time - rows.publish_time).dt.total_seconds() / 3600
    valid_forecast = rows.forecast_mw.dropna()
    instant = _cutoff(day, cutoff)
    availability_instant = _cutoff(day, cutoff, publication_lag_min)
    pubs = rows.publish_time.dropna()
    latest_pub = pubs.max() if not pubs.empty else None
    summary = {
        "n": int(rows.forecast_mw.notna().sum()),
        "actual_n": int(rows.actual_mw.notna().sum()),
        "gaps": int(rows.forecast_mw.isna().sum()),
        "mean_mw": float(valid_forecast.mean()) if not valid_forecast.empty else None,
        "peak_mw": float(valid_forecast.max()) if not valid_forecast.empty else None,
        "low_mw": float(valid_forecast.min()) if not valid_forecast.empty else None,
    }
    vintage = None if latest_pub is None else {
        "publish_time": latest_pub.isoformat(),
        "age_at_cutoff_h": float((instant - latest_pub).total_seconds() / 3600),
    }
    return {
        "decision_date": day.isoformat(),
        "delivery_date": (day + timedelta(days=1)).isoformat(),
        "cutoff_uk": cutoff,
        "cutoff_utc": instant.isoformat(),
        "available_until_utc": availability_instant.isoformat(),
        "publication_lag_min": publication_lag_min,
        "band_mode": band_mode,
        "band_mode_used": bands.attrs.get("mode_used", band_mode),
        "vintage": vintage,
        "summary": summary,
        "metrics": metrics(rows),
        "rows": _json_records(rows),
    }


def full_accuracy(out, fc, cutoff, start=config.DECISION_START, end=config.DECISION_END, publication_lag_min: int = 0):
    daily_frames = []
    for day in config.decision_days(start, end):
        frame = evaluation(out, fc, cutoff, day, publication_lag_min)
        frame["decision_date"] = day.isoformat()
        daily_frames.append(frame)
    all_rows = pd.concat(daily_frames, ignore_index=True) if daily_frames else pd.DataFrame()
    levels = []
    if not all_rows.empty:
        edges = forecast_level_edges(fc)
        all_rows["level_bin"] = _level_bin(all_rows.forecast_mw, edges)
        for level, group in all_rows.groupby("level_bin", dropna=True, observed=True):
            levels.append({"level_bin": int(level), **metrics(group)})
    by_hour = []
    if not all_rows.empty:
        for hour, group in all_rows.assign(hour=all_rows.start_time.dt.tz_convert(config.UK).dt.hour).groupby("hour"):
            by_hour.append({"hour": int(hour), **metrics(group)})
    errors = all_rows.error_mw.dropna().to_numpy(dtype=float) if not all_rows.empty else np.array([])
    if len(errors):
        counts, edges = np.histogram(errors, bins=config.ERROR_HISTOGRAM_BINS)
        histogram = [{"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))]
    else:
        histogram = []
    return {
        "cutoff": cutoff,
        "publication_lag_min": publication_lag_min,
        "overall": metrics(all_rows),
        "daily": [{"date": key, "metrics": metrics(group)} for key, group in all_rows.groupby("decision_date")],
        "by_hour": by_hour,
        "by_level": levels,
        "distribution": all_rows.error_mw.dropna().tolist() if not all_rows.empty else [],
        "error_histogram": histogram,
        "points": all_rows[["forecast_mw", "actual_mw"]].dropna().to_dict("records") if not all_rows.empty else [],
    }


def horizon(out, fc, cutoff, start=config.DECISION_START, end=config.DECISION_END, publication_lag_min: int = 0, cutoffs=None):
    days = config.decision_days(start, end)
    signatures = {}
    comparison_frames = {}
    horizon_frames = []
    compare_cutoffs = list(dict.fromkeys([*(cutoffs or config.CUTOFF_PRESETS), cutoff]))
    for candidate in compare_cutoffs:
        signature = []
        candidate_frames = []
        for day in days:
            selected = select_latest(fc, day, candidate, publication_lag_min)
            signature.append(tuple(zip(selected.start_time.astype(str), selected.publish_time.astype(str))))
            rows = _actual_for_day(out, day).merge(selected, on="start_time", how="left")
            rows["error_mw"] = rows.actual_mw - rows.forecast_mw
            rows["persistence_mw"] = persistence(out, _cutoff(day, candidate))
            candidate_frames.append(rows)
            if candidate == cutoff:
                selected_rows = rows.dropna(subset=["publish_time"]).copy()
                if not selected_rows.empty:
                    selected_rows["age_h"] = (selected_rows.start_time - selected_rows.publish_time).dt.total_seconds() / 3600
                    width = config.HORIZON_BIN_HOURS
                    selected_rows["bin"] = (selected_rows.age_h // width * width).astype(int)
                    horizon_frames.append(selected_rows)
        signatures[candidate] = signature
        comparison_frames[candidate] = pd.concat(candidate_frames, ignore_index=True) if candidate_frames else pd.DataFrame()
    reference = signatures[cutoff]
    all_rows = pd.concat(horizon_frames, ignore_index=True) if horizon_frames else pd.DataFrame()
    bins = []
    if not all_rows.empty:
        for age, group in all_rows.groupby("bin"):
            if len(group) >= config.MIN_HORIZON_BIN_ROWS:
                bins.append({"from_h": int(age), "to_h": int(age + config.HORIZON_BIN_HOURS), **metrics(group)})
    comparisons = []
    for candidate in compare_cutoffs:
        same_days = sum(bool(a) and a == b for a, b in zip(reference, signatures[candidate]))
        comparison_rows = comparison_frames[candidate]
        comparisons.append({"cutoff": candidate, "metrics": metrics(comparison_rows), "same_run_days_vs_selected": same_days, "same_run_day_count": len(days)})
    return {"cutoff": cutoff, "publication_lag_min": publication_lag_min, "bins": bins, "cutoffs": comparisons}
