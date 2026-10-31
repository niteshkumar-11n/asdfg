"""Verified snapshot loader with mtime-based cache invalidation."""
import gzip, hashlib, io, json
from pathlib import Path
import pandas as pd

_CACHE = {}

class SnapshotUnavailable(RuntimeError):
    def __init__(self, message, code="updating"):
        super().__init__(message)
        self.code = code

def load_snapshot(directory: str | Path, force: bool = False):
    root = Path(directory); meta_path = root / "meta.json"
    paths = [root / "fuelhh_wind.csv.gz", root / "windfor.csv.gz"]
    if not meta_path.exists() and not any(p.exists() for p in paths):
        raise FileNotFoundError("No committed data snapshot")
    if not meta_path.exists() or not all(p.exists() for p in paths):
        raise SnapshotUnavailable("Snapshot files are incomplete; retry after ingestion finishes")
    stamp = tuple(p.stat().st_mtime_ns for p in [meta_path, *paths])
    if not force and root in _CACHE and _CACHE[root][0] == stamp: return _CACHE[root][1]
    for attempt in range(4):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")); blobs = {p.name: p.read_bytes() for p in paths}
            actual_hashes = {name: hashlib.sha256(value).hexdigest() for name, value in blobs.items()}
            if actual_hashes != meta.get("files"): raise SnapshotUnavailable("Snapshot hash mismatch while ingest is updating")
            content = hashlib.sha256((actual_hashes["fuelhh_wind.csv.gz"] + actual_hashes["windfor.csv.gz"] + str(meta.get("schema_version")) + meta.get("source", "")).encode()).hexdigest()
            if content != meta.get("content_hash"): raise SnapshotUnavailable("Snapshot content hash mismatch")
            out = pd.read_csv(io.BytesIO(gzip.decompress(blobs["fuelhh_wind.csv.gz"]))); fc = pd.read_csv(io.BytesIO(gzip.decompress(blobs["windfor.csv.gz"])))
            for frame, cols in [(out, ["start_time"]), (fc, ["publish_time", "start_time"])]:
                for col in cols:
                    if col in frame: frame[col] = pd.to_datetime(frame[col], utc=True)
            snapshot = {"out": out, "fc": fc, "meta": meta}; _CACHE[root] = (stamp, snapshot); return snapshot
        except (ValueError, OSError, json.JSONDecodeError, SnapshotUnavailable) as error:
            if attempt == 3:
                if isinstance(error, SnapshotUnavailable): raise
                raise SnapshotUnavailable(f"Could not read a complete snapshot: {error}") from error
            import time; time.sleep(0.25)
