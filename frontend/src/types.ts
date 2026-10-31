export type Metrics = {
  n: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  wmape: number | null;
  p10_error_mw: number | null;
  p90_error_mw: number | null;
  p50_abs_mw: number | null;
  p90_abs_mw: number | null;
  p95_abs_mw: number | null;
  skill_persistence: number | null;
};

export type Row = {
  start_time: string;
  publish_time: string | null;
  forecast_mw: number | null;
  previous_forecast_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  p10_mw: number | null;
  p90_mw: number | null;
  n_band: number | null;
  horizon_h: number | null;
};

export type Decision = {
  decision_date: string;
  delivery_date: string;
  cutoff_uk: string;
  publication_lag_min: number;
  band_mode: string;
  band_mode_used: string;
  synthetic: boolean;
  source: string;
  summary: {
    n: number;
    actual_n: number;
    gaps: number;
    mean_mw: number | null;
    peak_mw: number | null;
    low_mw: number | null;
  };
  metrics: Metrics;
  vintage: { publish_time: string; age_at_cutoff_h: number } | null;
  rows: Row[];
};

export type Meta = {
  source: string;
  synthetic: boolean;
  content_hash: string;
  ingested_at: string;
  rows: { outturn: number; forecast: number };
  qa: Record<string, number>;
  window: {
    actual_from: string;
    actual_to: string;
    decision_from: string;
    decision_to: string;
  };
  cadence_per_day: Record<string, number>;
  forecast_step_min: number | null;
  forecast_level_boundaries_mw: number[];
  horizon_hours: { min: number; max: number } | null;
  cutoff_presets: string[];
  publication_lag_min: number;
  definitions: {
    error: string;
    wmape: string;
    band: string;
    rolling_band: string;
    persistence_lag_min: number;
    min_horizon_bin_rows: number;
  };
  coverage: {
    decision_days: number;
    expected_outturn_stored: number;
    expected_delivery_actuals: number;
    actual_stored_rows: number;
    actual_delivery_rows: number;
    missing_delivery_rows: number;
    forecast_delivery_rows: number;
    forecast_vintages: number;
  };
};

export type Accuracy = {
  cutoff: string;
  overall: Metrics;
  daily: { date: string; metrics: Metrics }[];
  by_hour: (Metrics & { hour: number })[];
  by_level: (Metrics & { level_bin: number })[];
  points: { forecast_mw: number; actual_mw: number }[];
  error_histogram: { from_mw: number; to_mw: number; count: number }[];
};

export type Horizon = {
  bins: (Metrics & { from_h: number; to_h: number })[];
  cutoffs: {
    cutoff: string;
    metrics: Metrics;
    same_run_days_vs_selected: number;
    same_run_day_count: number;
  }[];
};
