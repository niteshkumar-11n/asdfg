"""Central domain and runtime configuration."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
import os

UK = ZoneInfo("Europe/London")
UTC = ZoneInfo("UTC")
DECISION_START = date.fromisoformat(os.getenv("DECISION_START", "2026-01-01"))
DECISION_END = date.fromisoformat(os.getenv("DECISION_END", "2026-01-31"))
DELIVERY_START = DECISION_START + timedelta(days=1)
DELIVERY_END = DECISION_END + timedelta(days=1)
CUTOFF_PRESETS = tuple(value.strip() for value in os.getenv("CUTOFF_PRESETS", "09:20,09:50,15:30").split(",") if value.strip()) or ("09:20",)
OUTTURN_LAG_MIN = int(os.getenv("OUTTURN_LAG_MIN", "30"))
PUBLICATION_LAG_MIN = int(os.getenv("PUBLICATION_LAG_MIN", "0"))
FORECAST_LOOKBACK_DAYS = int(os.getenv("FORECAST_LOOKBACK_DAYS", "4"))
FORECAST_LEVEL_BINS = int(os.getenv("FORECAST_LEVEL_BINS", "4"))
MIN_HORIZON_BIN_ROWS = int(os.getenv("MIN_HORIZON_BIN_ROWS", "24"))
HORIZON_BIN_HOURS = int(os.getenv("HORIZON_BIN_HOURS", "6"))
ERROR_HISTOGRAM_BINS = int(os.getenv("ERROR_HISTOGRAM_BINS", "20"))
ROLLING_MIN_HISTORY_DAYS = int(os.getenv("ROLLING_MIN_HISTORY_DAYS", "2"))
DATA_DIR = os.getenv("WIND_DATA_DIR", "backend/data")
STATIC_DIR = os.getenv("WIND_STATIC_DIR", "frontend/dist")
ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
SCHEMA_VERSION = 1
PROJECT_ROOT = Path(__file__).resolve().parents[2]

def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()

def cutoff_instant(day: date, hhmm: str) -> datetime:
    try:
        hour, minute = map(int, hhmm.split(":"))
        if len(hhmm) != 5 or not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise ValueError
    except (ValueError, AttributeError):
        raise ValueError("cutoff must be a valid HH:MM time") from None
    return datetime.combine(day, time(hour, minute), UK).astimezone(UTC)

def window_metadata() -> dict[str, str]:
    return {
        "actual_from": DECISION_START.isoformat(),
        "actual_to": DELIVERY_END.isoformat(),
        "decision_from": DECISION_START.isoformat(),
        "decision_to": DECISION_END.isoformat(),
    }

def decision_days(start: date = DECISION_START, end: date = DECISION_END) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]

def half_hour_count(start: date, end_inclusive: date) -> int:
    start_local = datetime.combine(start, time.min, UK)
    end_local = datetime.combine(end_inclusive + timedelta(days=1), time.min, UK)
    return int((end_local.astimezone(UTC) - start_local.astimezone(UTC)).total_seconds() // 1800)
