import React from 'react';
import type { Meta } from '../types';
import { KpiCard } from '../components/KpiCard';
import { DataTable } from '../components/DataTable';
import { fmt, dateLabel, clockLabel, levelLabel } from '../utils/format';

interface DataViewProps {
  meta: Meta;
}

export function DataView({ meta }: DataViewProps) {
  const dateRangeText = `${dateLabel(meta.window.decision_from)} to ${dateLabel(meta.window.decision_to)}`;

  return (
    <div className="view-content">
      <div className="view-header">
        <div className="view-header__text">
          <span className="view-header__eyebrow">SOURCE / METHOD / COVERAGE</span>
          <h2 className="view-header__title">Know what's behind the numbers.</h2>
          <p className="view-header__desc">Measured values and coverage come from this snapshot.</p>
        </div>
      </div>

      {/* Coverage KPIs */}
      <div className="kpi-grid">
        <KpiCard
          label="Outturn rows stored"
          value={fmt(meta.rows.outturn)}
          detail={`expected ${fmt(meta.coverage.expected_outturn_stored)} · ${fmt(meta.coverage.actual_stored_rows)} stored`}
        />
        <KpiCard label="Forecast rows" value={fmt(meta.rows.forecast)} unit="measured coverage" />
        <KpiCard
          label="Forecast step"
          value={meta.forecast_step_min == null ? '—' : `${fmt(meta.forecast_step_min)} min`}
        />
        <KpiCard label="Source" value={meta.source || '—'} unit="Elexon BMRS or labeled fixture" />
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Runs per day"
          value={fmt(meta.cadence_per_day['50%'], 1)}
          unit="median observed"
        />
        <KpiCard
          label="Forward horizon"
          value={
            meta.horizon_hours
              ? `${fmt(meta.horizon_hours.min, 1)}–${fmt(meta.horizon_hours.max, 1)} h`
              : '—'
          }
        />
        <KpiCard
          label="Delivery outturn coverage"
          value={fmt(meta.coverage.actual_delivery_rows)}
          detail={`of ${fmt(meta.coverage.expected_delivery_actuals)} expected periods`}
        />
        <KpiCard
          label="Forecast vintages"
          value={fmt(meta.coverage.forecast_vintages)}
          unit="distinct publish times"
        />
      </div>

      <div className="kpi-grid kpi-grid--compact">
        <KpiCard label="Missing delivery outturn" value={fmt(meta.coverage.missing_delivery_rows)} unit="periods" />
        <KpiCard label="Forward forecast rows" value={fmt(meta.coverage.forecast_delivery_rows)} unit="forecast periods" />
        <KpiCard label="Decision window" value={fmt(meta.coverage.decision_days)} unit="days" detail={dateRangeText} />
        <KpiCard label="Publication lag" value={fmt(meta.publication_lag_min)} unit="default minutes" />
      </div>

      {/* QA */}
      <div className="panel">
        <h3 className="panel__title">Ingestion quality</h3>
        <DataTable
          rows={Object.entries(meta.qa || {}).map(([reason, count]) => ({
            reason,
            dropped_rows: count,
          }))}
        />
      </div>

      {/* Level calibration */}
      <div className="panel">
        <h3 className="panel__title">Forecast-level calibration ranges</h3>
        <p className="panel__subtitle">
          Boundaries are calculated from this snapshot's forward forecasts; each band uses historical errors within the matching level.
        </p>
        <DataTable
          rows={Array.from(
            { length: meta.forecast_level_boundaries_mw.length + 1 },
            (_, index) => ({
              forecast_level: levelLabel(index, meta.forecast_level_boundaries_mw),
              lower_boundary_mw: index ? meta.forecast_level_boundaries_mw[index - 1] : null,
              upper_boundary_mw:
                index < meta.forecast_level_boundaries_mw.length
                  ? meta.forecast_level_boundaries_mw[index]
                  : null,
            })
          )}
        />
      </div>

      {/* Methodology prose */}
      <div className="panel panel--prose">
        <h3 className="panel__title">Data and method</h3>
        <p>
          The snapshot uses national wind generation from Elexon BMRS FUELHH (WIND) and published WINDFOR
          forecast vintages. Timestamps are stored in UTC and shown in UK local time. The measured decision
          window is {dateRangeText}; delivery dates follow each decision date.
        </p>
        <p>
          For each delivery period, WindDesk selects the latest forecast published by the cutoff, after the
          additional publication-lag sensitivity. Periods with no forecast remain gaps. No interpolation is
          performed. Forecast-level calibration ranges are calculated from this snapshot's forward forecasts;
          backfilled values published after a delivery period starts are excluded from calibration.
        </p>
        <p>
          {meta.definitions.error}. Weighted MAPE is {meta.definitions.wmape}. Persistence only uses outturn
          periods completed at least {fmt(meta.definitions.persistence_lag_min)} minutes before the cutoff.
          Forecast-age bins need at least {fmt(meta.definitions.min_horizon_bin_rows)} observations.{' '}
          {meta.definitions.rolling_band}.
        </p>
        <p>
          The empirical uncertainty band summarizes historical errors and is not a probabilistic forecast.
          This snapshot does not contain demand, price, solar, weather, or capacity data.
        </p>
        <p>
          Snapshot hash: <code>{meta.content_hash}</code>
        </p>
        <p>Ingested at: {clockLabel(meta.ingested_at)}</p>
      </div>
    </div>
  );
}
