"""Deterministic offline fixtures; synthetic rows are always source-labelled."""
import math
from datetime import timedelta
import pandas as pd
from . import config


def _actual_value(index: int) -> float:
    return max(0.0, 6900 + 2800 * math.sin(index / 17) + 900 * math.sin(index / 5.7))


def make_data():
    actual_start_local = pd.Timestamp(config.DECISION_START, tz=config.UK)
    actual_end_local = pd.Timestamp(config.DELIVERY_END + timedelta(days=1), tz=config.UK)
    periods = pd.date_range(actual_start_local, actual_end_local, freq="30min", inclusive="left").tz_convert(config.UTC)
    out = pd.DataFrame({
        "start_time": periods,
        "actual_mw": [_actual_value(i) for i in range(len(periods))],
    })

    rows = []
    forecast_start = config.DECISION_START - timedelta(days=config.FORECAST_LOOKBACK_DAYS)
    first_delivery = pd.Timestamp(config.DELIVERY_START, tz=config.UK).tz_convert(config.UTC)
    last_delivery_end = pd.Timestamp(config.DELIVERY_END + timedelta(days=1), tz=config.UK).tz_convert(config.UTC)
    for day in pd.date_range(forecast_start, config.DECISION_END, freq="D", inclusive="both"):
        local_midnight = pd.Timestamp(day.date(), tz=config.UK)
        for hour in (4, 10, 16, 22):
            publish = local_midnight + pd.Timedelta(hour * 60 + 30, unit="min")
            for offset in range(49):
                target = local_midnight + pd.Timedelta(21 + offset, unit="h")
                target_utc = target.tz_convert(config.UTC)
                if not first_delivery <= target_utc < last_delivery_end:
                    continue
                index = int((target_utc - periods[0]).total_seconds() // 1800)
                actual = _actual_value(index)
                forecast = max(0.0, actual + 220 * math.sin(index / 3.1) + ((hour - 10) * 13))
                rows.append((publish.tz_convert(config.UTC), target_utc, forecast))
    fc = pd.DataFrame(rows, columns=["publish_time", "start_time", "forecast_mw"])
    return out, fc
