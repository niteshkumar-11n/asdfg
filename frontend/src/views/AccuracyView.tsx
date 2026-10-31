import React from 'react';
import type { Accuracy, Meta } from '../types';
import { KpiCard } from '../components/KpiCard';
import { Bars } from '../components/Bars';
import { Scatter } from '../components/ScatterChart';
import { DataTable } from '../components/DataTable';
import { LoadingState, ErrorState } from '../components/States';
import { fmt, dateLabel, levelLabel } from '../utils/format';

interface AccuracyViewProps {
  meta: Meta;
  accuracy: Accuracy | null;
  accuracyLoading: boolean;
  accuracyError: string;
  onRetry: () => void;
}

export function AccuracyView({ meta, accuracy, accuracyLoading, accuracyError, onRetry }: AccuracyViewProps) {
  const dateRangeText = `${dateLabel(meta.window.decision_from)} to ${dateLabel(meta.window.decision_to)}`;

  if (accuracyLoading && !accuracy) return <LoadingState message="Calculating accuracy metrics…" />;

  return (
    <div className={`view-content${accuracyLoading ? ' view-content--loading' : ''}`}>
      <div className="view-header">
        <div className="view-header__text">
          <span className="view-header__eyebrow">HISTORICAL PERFORMANCE / {dateRangeText}</span>
          <h2 className="view-header__title">How wrong is the forecast?</h2>
          <p className="view-header__desc">
            {fmt(accuracy?.overall?.n)} matched forecast/outturn pairs. Each period uses the latest forecast available by the selected cutoff and publication lag.
          </p>
        </div>
      </div>

      {accuracyError && <ErrorState message={accuracyError} onRetry={onRetry} />}

      {accuracy && (
        <>
          {/* Primary accuracy KPIs */}
          <div className="kpi-grid">
            <KpiCard label="Mean absolute error" value={fmt(accuracy.overall.mae_mw)} accent />
            <KpiCard label="Root mean square error" value={fmt(accuracy.overall.rmse_mw)} />
            <KpiCard label="Bias" value={fmt(accuracy.overall.bias_mw)} />
            <KpiCard
              label="Weighted MAPE"
              value={accuracy.overall.wmape == null ? '—' : `${fmt(accuracy.overall.wmape * 100, 1)}%`}
            />
          </div>

          {/* Secondary accuracy KPIs */}
          <div className="kpi-grid kpi-grid--compact">
            <KpiCard label="P50 absolute error" value={fmt(accuracy.overall.p50_abs_mw)} />
            <KpiCard label="P90 planning buffer" value={fmt(accuracy.overall.p90_abs_mw)} />
            <KpiCard label="P95 absolute error" value={fmt(accuracy.overall.p95_abs_mw)} />
            <KpiCard
              label="Skill vs persistence"
              value={accuracy.overall.skill_persistence == null ? '—' : `${fmt(accuracy.overall.skill_persistence * 100, 1)}%`}
              unit="positive means better"
            />
          </div>

          {/* Daily MAE */}
          <div className="panel">
            <h3 className="panel__title">Daily mean absolute error</h3>
            <p className="panel__subtitle">{fmt(accuracy.overall.n)} matched forecast/outturn pairs</p>
            <Bars
              label="Daily mean absolute error"
              values={accuracy.daily.map((entry) => ({
                label: dateLabel(entry.date, { day: '2-digit' }),
                value: entry.metrics.mae_mw,
              }))}
            />
            <DataTable rows={accuracy.daily.map((entry) => ({ date: entry.date, ...entry.metrics }))} />
          </div>

          {/* Error distribution */}
          <div className="panel">
            <h3 className="panel__title">Error distribution</h3>
            <p className="panel__subtitle">
              Error is outturn minus forecast. Negative values indicate under-delivery.
              Signed P10/P90 errors are {fmt(accuracy.overall.p10_error_mw)} / {fmt(accuracy.overall.p90_error_mw)} MW;
              absolute P90 error is {fmt(accuracy.overall.p90_abs_mw)} MW.
            </p>
            <Bars
              label="Forecast error histogram"
              values={accuracy.error_histogram.map((bin) => ({
                label: `${fmt(bin.from_mw)} to ${fmt(bin.to_mw)}`,
                value: bin.count,
              }))}
            />
            <DataTable title="Error distribution bins" rows={accuracy.error_histogram} />
          </div>

          {/* Scatter */}
          <div className="panel">
            <h3 className="panel__title">Forecast against outturn</h3>
            <Scatter points={accuracy.points} />
          </div>

          {/* By level */}
          <div className="panel">
            <h3 className="panel__title">Error by forecast level</h3>
            <Bars
              label="Mean absolute error by forecast level"
              values={accuracy.by_level.map((entry) => ({
                label: levelLabel(entry.level_bin, meta.forecast_level_boundaries_mw),
                value: entry.mae_mw,
              }))}
            />
            <DataTable
              rows={accuracy.by_level.map((entry) => ({
                forecast_level: levelLabel(entry.level_bin, meta.forecast_level_boundaries_mw),
                ...entry,
              }))}
            />
          </div>

          {/* By hour */}
          <div className="panel">
            <h3 className="panel__title">Error by delivery hour</h3>
            <Bars
              label="Mean absolute error by delivery hour"
              values={accuracy.by_hour.map((entry) => ({
                label: `${String(entry.hour).padStart(2, '0')}:00`,
                value: entry.mae_mw,
              }))}
            />
            <DataTable rows={accuracy.by_hour} />
          </div>
        </>
      )}
    </div>
  );
}
