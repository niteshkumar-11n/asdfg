import React, { useState, useMemo } from 'react';
import type { Decision as DecisionType, Meta, Accuracy as AccuracyType, Metrics } from '../types';
import { KpiCard } from '../components/KpiCard';
import { DecisionChart } from '../components/DecisionChart';
import { DataTable } from '../components/DataTable';
import { LoadingState, ErrorState } from '../components/States';
import { fmt, dateLabel, clockLabel, addDays, rangeDays, parseDate } from '../utils/format';

interface DecisionViewProps {
  meta: Meta;
  decision: DecisionType | null;
  decisionLoading: boolean;
  decisionError: string;
  day: string;
  cutoffValue: string;
  lagValue: number;
  band: string;
  accuracy: AccuracyType | null;
  onDayChange: (day: string) => void;
  onRetry: () => void;
}

export function DecisionView({
  meta,
  decision,
  decisionLoading,
  decisionError,
  day,
  cutoffValue,
  lagValue,
  band,
  accuracy,
  onDayChange,
  onRetry,
}: DecisionViewProps) {
  const [showPrevious, setShowPrevious] = useState(false);
  const scopeWindow = meta.window;
  const dateRangeText = `${dateLabel(scopeWindow.decision_from)} to ${dateLabel(scopeWindow.decision_to)}`;

  const days = useMemo(
    () => rangeDays(scopeWindow.decision_from, scopeWindow.decision_to),
    [scopeWindow.decision_from, scopeWindow.decision_to]
  );
  const dailyByDate = useMemo(
    () => new Map((accuracy?.daily || []).map((entry) => [entry.date, entry.metrics])),
    [accuracy?.daily]
  );
  const maxDailyMae = Math.max(
    0,
    ...Array.from(dailyByDate.values()).map((metrics) => metrics.mae_mw || 0)
  );
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const firstOffset = (parseDate(scopeWindow.decision_from).getUTCDay() + 6) % 7;

  if (decisionLoading && !decision) return <LoadingState message="Loading decision data…" />;

  return (
    <div className={`view-content${decisionLoading ? ' view-content--loading' : ''}`}>
      {/* Page header */}
      <div className="view-header">
        <div className="view-header__text">
          <span className="view-header__eyebrow">
            DELIVERY {decision?.delivery_date ? dateLabel(decision.delivery_date) : day ? dateLabel(addDays(day, 1)) : ''}
          </span>
          <h2 className="view-header__title">Tomorrow's wind, in view.</h2>
          <p className="view-header__desc">
            Latest eligible forecast by {cutoffValue} UK on {day ? dateLabel(day) : dateRangeText}.
            {lagValue ? ` ${fmt(lagValue)} minutes of additional publication lag applied.` : ' No additional publication lag applied.'}
          </p>
        </div>
        {decision && (
          <span className="badge">
            {decision.band_mode_used === 'pooled_fallback' ? 'Pooled fallback' : `${band} band`}
          </span>
        )}
      </div>

      {decisionError && <ErrorState message={decisionError} onRetry={onRetry} />}

      {decision && (
        <>
          {/* Primary KPIs */}
          <div className="kpi-grid">
            <KpiCard label="Day-ahead average" value={fmt(decision.summary.mean_mw)} detail={`MW · ${fmt(decision.summary.n)} forecast periods`} accent />
            <KpiCard label="Peak forecast" value={fmt(decision.summary.peak_mw)} />
            <KpiCard label="Low forecast" value={fmt(decision.summary.low_mw)} />
            <KpiCard label="Vintage age" value={decision.vintage ? fmt(decision.vintage.age_at_cutoff_h, 1) : '—'} unit="hours" detail={decision.vintage ? clockLabel(decision.vintage.publish_time) : 'No forecast vintage'} />
          </div>

          {/* Secondary KPIs */}
          <div className="kpi-grid kpi-grid--compact">
            <KpiCard label="Available forecasts" value={fmt(decision.summary.n)} unit="delivery periods" />
            <KpiCard label="Forecast gaps" value={fmt(decision.summary.gaps)} unit="left unfilled" />
            <KpiCard label="Matched outturn" value={fmt(decision.metrics.n)} unit="forecast/outturn pairs" />
            <KpiCard label="MAE for this day" value={fmt(decision.metrics.mae_mw)} unit="MW" />
          </div>

          {/* Chart panel */}
          <div className="panel">
            <div className="panel__header">
              <div>
                <h3 className="panel__title">Forecast against outturn</h3>
                <p className="panel__subtitle">
                  Delivery periods in UK time · bands are based on historical forward errors · gaps stay visible
                </p>
              </div>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showPrevious}
                  onChange={(event) => setShowPrevious(event.target.checked)}
                />
                Plot previous vintage
              </label>
            </div>
            <DecisionChart rows={decision.rows} comparePrevious={showPrevious} />
            <DataTable
              rows={decision.rows.map((row) => ({
                delivery_time: row.start_time,
                forecast_mw: row.forecast_mw,
                previous_forecast_mw: row.previous_forecast_mw,
                p10_mw: row.p10_mw,
                p90_mw: row.p90_mw,
                band_sample_n: row.n_band,
                actual_mw: row.actual_mw,
                error_mw: row.error_mw,
                horizon_h: row.horizon_h,
                publish_time: row.publish_time,
              }))}
            />
          </div>

          {/* Calendar panel */}
          <div className="panel">
            <div className="panel__header">
              <div>
                <h3 className="panel__title">Decision calendar</h3>
                <p className="panel__subtitle">
                  Shade shows daily mean absolute error at the selected cutoff. Select a date to inspect it.
                </p>
              </div>
              <span className="badge">{dateRangeText}</span>
            </div>
            <div className="calendar-grid">
              {weekdays.map((weekday) => (
                <span className="weekday" key={weekday}>{weekday}</span>
              ))}
              {Array.from({ length: firstOffset }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {days.map((date) => {
                const metrics = dailyByDate.get(date);
                const normalized = maxDailyMae ? Math.min(1, (metrics?.mae_mw || 0) / maxDailyMae) : 0;
                const backgroundColor = metrics?.mae_mw == null ? undefined : `rgba(13, 148, 136, ${0.08 + 0.40 * normalized})`;
                const title = metrics
                  ? `${dateLabel(date)} · MAE ${fmt(metrics.mae_mw)} MW · ${fmt(metrics.n)} periods`
                  : `${dateLabel(date)} · no matched observations`;
                return (
                  <button
                    key={date}
                    className={date === day ? 'selected' : ''}
                    style={{ backgroundColor }}
                    onClick={() => onDayChange(date)}
                    aria-label={title}
                    title={title}
                  >
                    {parseDate(date).getUTCDate()}
                  </button>
                );
              })}
            </div>
            <DataTable
              title="Daily calendar values"
              rows={days.map((date) => ({
                date,
                ...((dailyByDate.get(date) || {}) as Metrics),
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
