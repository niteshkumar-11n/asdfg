# WindDesk implementation audit

This audit compares the application in this workspace with the version 2 implementation plan. Displayed dates, row counts, forecast cadence, cutoff choices, forecast-level thresholds, and coverage are loaded from API configuration or the committed snapshot. The January 2026 period is the supplied project default; it is not duplicated as a frontend-only data fixture.

## Implemented

| Plan area | Implementation |
| --- | --- |
| Ingestion and snapshot | Chunked Elexon requests with retry and response caching; WIND-only FUELHH normalization; measured QA counters; natural-key upserts; deterministic gzip; source-switch guard; content hash; atomic snapshot writes; safe stale-lock takeover and owner-checked release; `--if-missing`, `--synthetic`, `--replace`, `--fresh`, and `--offline-verify` CLI modes. |
| Data and domain configuration | Decision window, forecast look-back, cutoffs, persistence delay, forecast-level bin count, horizon-bin width, and minimum sample size are centralized in `backend/app/config.py` and can be set with environment variables. Snapshot metadata records the active window. |
| Snapshot reads and API | Hash-verified, mtime-cached loader; actionable `no_data` and `updating` 503 responses; validated custom cutoff and publication-lag inputs; GET-only routes; strict JSON without NaN; ETags and 304 responses; snapshot-derived cadence, step, horizons, quantile boundaries, coverage, and QA metadata. |
| Analytics | Latest vintage per delivery period at or before the lag-adjusted cutoff; prior-vintage values; gap-preserving evaluation; actual-minus-forecast errors; delayed persistence; MAE, RMSE, bias, weighted MAPE, signed and absolute error quantiles, persistence skill, pooled and rolling bands, forecast-age bins, and per-cutoff same-run comparisons. |
| Decision desk | Snapshot-derived date selector and calendar; daily error shading; custom market cutoff and publication-lag controls; latest/previous-vintage plot toggle; P10–P90 band; data table; keyboard and hover inspection; peak/low labels; missing forecast periods remain gaps. |
| Other views | Accuracy metrics, error histogram with signed P10/P90 values, scatter plot, daily/hour/forecast-level breakdowns with matching tables; forecast-age analysis and same-run labels; Data page with measured counts, coverage, source, definitions, QA, and hash. |
| App behavior and accessibility | Four hash-routed views, shared filters, cached and cancellable requests, stale render dimming while a new request loads, system-following light/dark theme with a manual override, visible keyboard focus, reduced-motion support, and responsive layouts. |
| Packaging | Local Flask API, React/TypeScript SPA, Docker/Compose, Vercel function and rewrites, GitHub Actions CI, README, demo script, and submission checklist. |

## Verification completed

- Backend suite: 25 tests pass, including cutoff leakage, custom cutoff and lag validation, rolling-band scope, backfill exclusion, source isolation, idempotent no-op, upsert, commit order, snapshot repair, and lock ownership.
- Frontend TypeScript check and production build pass.
- The committed Elexon snapshot passes offline hash verification.
- API health, metadata, decision, accuracy, and forecast-age routes return HTTP 200 against the real snapshot. Decision, accuracy, and forecast-age responses contain no JSON `NaN` values.
- Independent calculation for decision day 15 January 2026 / delivery 16 January at 09:20 matched the API: 48 outturn periods, 24 forecast pairs, MAE 810 MW, and bias −348.833 MW.
- On the committed snapshot, warm API requests measured approximately 35 ms for a decision, 0.72 s for accuracy, and 0.95 s for forecast-age comparisons.

## Release items that need external accounts or a recording

- Publishing a public anonymous GitHub repository and checking its author metadata.
- Deploying to Vercel or a container host and checking the URL in a clean browser session.
- Recording and uploading the unlisted two-part video, then completing the submission form.

The workspace has no Git repository or connected GitHub/Vercel account. These release actions are not application code and are not represented as complete. The plan’s Idempotency-Key protocol remains a future-write-endpoint specification; the current API intentionally has no write endpoints.
