import React from 'react';
import type { Horizon, Meta } from '../types';
import { Bars } from '../components/Bars';
import { DataTable } from '../components/DataTable';
import { LoadingState, ErrorState } from '../components/States';
import { fmt } from '../utils/format';

interface HorizonViewProps {
  meta: Meta;
  horizon: Horizon | null;
  horizonLoading: boolean;
  horizonError: string;
  cutoffValue: string;
  onRetry: () => void;
}

export function HorizonView({ meta, horizon, horizonLoading, horizonError, cutoffValue, onRetry }: HorizonViewProps) {
  if (horizonLoading && !horizon) return <LoadingState message="Analysing forecast vintage data…" />;

  return (
    <div className={`view-content${horizonLoading ? ' view-content--loading' : ''}`}>
      <div className="view-header">
        <div className="view-header__text">
          <span className="view-header__eyebrow">VINTAGE ANALYSIS / {cutoffValue} UK</span>
          <h2 className="view-header__title">Does waiting help?</h2>
          <p className="view-header__desc">
            Forecast error by age at delivery. Sparse bins below {fmt(meta.definitions.min_horizon_bin_rows)} periods are omitted.
          </p>
        </div>
      </div>

      {horizonError && <ErrorState message={horizonError} onRetry={onRetry} />}

      {horizon && (
        <>
          <div className="panel">
            <h3 className="panel__title">Absolute error by forecast age</h3>
            <Bars
              label="Mean absolute error by forecast age"
              values={horizon.bins.map((entry) => ({
                label: `${entry.from_h}–${entry.to_h}h`,
                value: entry.mae_mw,
              }))}
            />
            <DataTable rows={horizon.bins} />
          </div>

          <div className="panel">
            <h3 className="panel__title">Market cutoff comparison</h3>
            <p className="panel__subtitle">
              "Same run" counts decision days where the selected per-period vintages exactly match the current cutoff.
            </p>
            <DataTable
              rows={horizon.cutoffs.map((entry) => ({
                selected_cutoff: cutoffValue,
                comparison_cutoff: entry.cutoff,
                ...entry.metrics,
                same_run_days: entry.same_run_days_vs_selected,
                decision_days: entry.same_run_day_count,
                same_run: entry.same_run_days_vs_selected === entry.same_run_day_count,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
