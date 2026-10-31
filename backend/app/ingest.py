"""Elexon ingestion and deterministic, resumable snapshot publishing."""
from __future__ import annotations
import argparse, gzip, hashlib, io, json, math, os, time, uuid
from datetime import date, timedelta
from pathlib import Path
import pandas as pd
import requests
from . import config

OUT = ["start_time", "actual_mw"]
FC = ["publish_time", "start_time", "forecast_mw"]

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()

def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with tmp.open("wb") as f:
        f.write(data); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def canonical_gzip(frame: pd.DataFrame, columns: list[str], keys: list[str]) -> bytes:
    if frame.empty: frame = pd.DataFrame(columns=columns)
    frame = frame[columns].sort_values(keys).reset_index(drop=True)
    raw = frame.to_csv(index=False, lineterminator="\n", float_format="%.3f").encode()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, filename="", compresslevel=9) as gz: gz.write(raw)
    return buf.getvalue()

def merge_rows(old: pd.DataFrame, new: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    if old.empty: return new.drop_duplicates(keys, keep="last") if not new.empty else old
    if new.empty: return old
    return pd.concat([old, new], ignore_index=True).drop_duplicates(keys, keep="last")

def acquire_lock(path: Path, stale_s: int = 1800) -> str | None:
    owner = f"{os.getpid()} {uuid.uuid4().hex}"
    for _ in range(3):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(fd, owner.encode()); os.fsync(fd); os.close(fd); return owner
        except FileExistsError:
            try:
                if time.time() - path.stat().st_mtime < stale_s: return None
                claimed = path.with_name(path.name + ".stale." + uuid.uuid4().hex)
                os.rename(path, claimed); claimed.unlink(missing_ok=True)
            except FileNotFoundError: pass
            except OSError: return None
    return None

def release_lock(path: Path, owner: str) -> None:
    try:
        if path.read_text(encoding="utf-8") == owner:
            path.unlink(missing_ok=True)
    except FileNotFoundError:
        pass

def publish(out: pd.DataFrame, fc: pd.DataFrame, directory: Path, source: str = "elexon", qa: dict | None = None, replace_existing: bool = False) -> str:
    directory.mkdir(parents=True, exist_ok=True); lock = directory / ".ingest.lock"
    owner = acquire_lock(lock)
    if not owner: return "skipped"
    try:
        for stale_tmp in directory.glob(".*.tmp"):
            stale_tmp.unlink(missing_ok=True)
        meta_path = directory / "meta.json"
        old = json.loads(meta_path.read_text()) if meta_path.exists() else None
        if old and old.get("source") != source and not replace_existing: raise ValueError("Refusing to mix real and synthetic snapshots; use --replace")
        if replace_existing: old = None
        if old:
            expected_files = {"fuelhh_wind.csv.gz", "windfor.csv.gz"}
            recorded = old.get("files", {})
            valid_files = set(recorded) == expected_files and all((directory / name).is_file() and sha((directory / name).read_bytes()) == recorded[name] for name in expected_files)
            valid_content = valid_files and old.get("content_hash") == sha((recorded["fuelhh_wind.csv.gz"] + recorded["windfor.csv.gz"] + str(old.get("schema_version")) + source).encode())
            if not valid_content: old = None
        def load_old(name, cols):
            p = directory / name
            return pd.read_csv(p, compression="gzip") if old and p.exists() else pd.DataFrame(columns=cols)
        if old:
            out = merge_rows(load_old("fuelhh_wind.csv.gz", OUT), out, ["start_time"])
            fc = merge_rows(load_old("windfor.csv.gz", FC), fc, ["publish_time", "start_time"])
        b_out = canonical_gzip(out, OUT, ["start_time"]); b_fc = canonical_gzip(fc, FC, ["publish_time", "start_time"])
        hashes = {"fuelhh_wind.csv.gz": sha(b_out), "windfor.csv.gz": sha(b_fc)}
        content_hash = sha((hashes["fuelhh_wind.csv.gz"] + hashes["windfor.csv.gz"] + str(config.SCHEMA_VERSION) + source).encode())
        # Trust a no-op only when the committed marker and bytes agree.
        if old and old.get("files") == hashes and old.get("content_hash") == content_hash:
            return "up to date"
        atomic_write(directory / "fuelhh_wind.csv.gz", b_out); atomic_write(directory / "windfor.csv.gz", b_fc)
        meta = {"schema_version": config.SCHEMA_VERSION, "source": source, "synthetic": source == "synthetic", "window": config.window_metadata(), "rows": {"outturn": int(len(out)), "forecast": int(len(fc))}, "files": hashes, "content_hash": content_hash, "qa": qa or {}, "ingested_at": pd.Timestamp.now(tz="UTC").isoformat()}
        atomic_write(meta_path, (json.dumps(meta, sort_keys=True, indent=2) + "\n").encode())
        return "written"
    finally: release_lock(lock, owner)

def _records(payload): return payload.get("data", []) if isinstance(payload, dict) else payload

def request_json(session, path, params, cache_dir: Path | None = None, refresh: bool = False):
    url = config.ELEXON_BASE_URL.rstrip("/") + path
    cache_path = None
    if cache_dir is not None:
        key = sha(json.dumps({"url": url, "params": params}, sort_keys=True, separators=(",", ":")).encode())
        cache_path = cache_dir / f"{key}.json"
        if cache_path.is_file() and not refresh:
            try: return _records(json.loads(cache_path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError): cache_path.unlink(missing_ok=True)
    for attempt in range(4):
        try:
            response = session.get(url, params=params, timeout=30)
            if response.status_code < 500 and response.status_code != 429:
                response.raise_for_status(); payload = response.json()
                if cache_path is not None: atomic_write(cache_path, json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())
                return _records(payload)
            response.raise_for_status()
        except requests.RequestException:
            if attempt == 3: raise
            time.sleep(0.25 * (2 ** attempt))

def fetch(session=requests, progress=None, cache_dir: Path | None = None, refresh: bool = False):
    cache_dir = cache_dir or Path(config.DATA_DIR) / ".chunks"
    actuals, forecasts = [], []
    actual_start = pd.Timestamp(config.DECISION_START)
    actual_end = pd.Timestamp(config.DELIVERY_END)
    for start in pd.date_range(actual_start, actual_end, freq="7D", inclusive="both"):
        end = min(start + pd.Timedelta("6D"), actual_end)
        params = {"settlementDateFrom": start.date().isoformat(), "settlementDateTo": end.date().isoformat(), "fuelType": "WIND"}
        try: rows = request_json(session, "/datasets/FUELHH/stream", params, cache_dir, refresh)
        except requests.HTTPError as e:
            if getattr(e.response, "status_code", None) != 400: raise
            rows = request_json(session, "/datasets/FUELHH/stream", {"publishDateTimeFrom": f"{start.date()}T00:00Z", "publishDateTimeTo": f"{(end + pd.Timedelta(days=1)).date()}T00:00Z"}, cache_dir, refresh)
        actuals.extend(rows)
        if progress: progress("FUELHH", params)
    forecast_start = pd.Timestamp(config.DECISION_START - timedelta(days=config.FORECAST_LOOKBACK_DAYS))
    forecast_end = pd.Timestamp(config.DECISION_END + timedelta(days=1))
    for day in pd.date_range(forecast_start, forecast_end, freq="D", inclusive="left"):
        next_day = (day + pd.Timedelta("1D")).date()
        params = {"publishDateTimeFrom": f"{day.date()}T00:00Z", "publishDateTimeTo": f"{next_day}T00:00Z"}
        forecasts.extend(request_json(session, "/datasets/WINDFOR/stream", params, cache_dir, refresh))
        if progress: progress("WINDFOR", params)
    return actuals, forecasts

def normalise(out_rows, fc_rows):
    qa = {"wrong_fuel": 0, "invalid_time": 0, "invalid_value": 0, "duplicates": 0}
    def clean(rows, actual):
        result = []
        for r in rows:
            if actual and r.get("fuelType") != "WIND": qa["wrong_fuel"] += 1; continue
            t = r.get("startTime") or r.get("start_time"); v = r.get("generation") if actual else r.get("generation")
            if v is None: v = r.get("actual_mw" if actual else "forecast_mw")
            pub = r.get("publishTime") or r.get("publish_time")
            try: t = pd.Timestamp(t)
            except Exception: qa["invalid_time"] += 1; continue
            if pd.isna(t): qa["invalid_time"] += 1; continue
            t = t.tz_localize("UTC") if t.tz is None else t.tz_convert("UTC")
            try: v = float(v)
            except (ValueError, TypeError): qa["invalid_value"] += 1; continue
            if not math.isfinite(v) or v < 0: qa["invalid_value"] += 1; continue
            row = {"start_time": t.isoformat().replace("+00:00", "Z"), ("actual_mw" if actual else "forecast_mw"): v}
            if actual and pub: row["_publish_time"] = pub
            if not actual:
                try: p = pd.Timestamp(pub)
                except Exception: qa["invalid_time"] += 1; continue
                if pd.isna(p): qa["invalid_time"] += 1; continue
                p = p.tz_localize("UTC") if p.tz is None else p.tz_convert("UTC")
                row["publish_time"] = p.isoformat().replace("+00:00", "Z")
            result.append(row)
        df = pd.DataFrame(result)
        keys = ["start_time"] if actual else ["publish_time", "start_time"]
        if not df.empty:
            qa["duplicates"] += int(df.duplicated(keys).sum())
            if actual and "_publish_time" in df:
                df["_publish_time"] = pd.to_datetime(df["_publish_time"], utc=True, errors="coerce")
                df = df.sort_values("_publish_time", na_position="first").drop_duplicates(keys, keep="last").drop(columns="_publish_time")
            else: df = df.drop_duplicates(keys, keep="last")
        return df
    return clean(out_rows, True), clean(fc_rows, False), qa

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--if-missing", action="store_true"); parser.add_argument("--synthetic", action="store_true"); parser.add_argument("--replace", action="store_true"); parser.add_argument("--fresh", action="store_true"); parser.add_argument("--offline-verify", action="store_true"); args = parser.parse_args()
    directory = config.resolve_path(config.DATA_DIR)
    if args.offline_verify:
        from .data import load_snapshot
        load_snapshot(directory, force=True); print("snapshot verified"); return
    if args.if_missing and not (args.fresh or args.replace) and (directory / "meta.json").exists():
        from .data import load_snapshot
        try: load_snapshot(directory, force=True); print("up to date"); return
        except Exception: pass
    if args.synthetic:
        from .synthetic import make_data
        out, fc = make_data(); print(publish(out, fc, directory, "synthetic", replace_existing=args.replace)); return
    out_rows, fc_rows = fetch(progress=lambda name, p: print(f"{name} {p}", flush=True), cache_dir=directory / ".chunks", refresh=args.fresh); out, fc, qa = normalise(out_rows, fc)
    print(publish(out, fc, directory, "elexon", qa, replace_existing=args.replace))

if __name__ == "__main__": main()
