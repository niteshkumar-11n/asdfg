# WindDesk demo script

Use the real Elexon snapshot included in `backend/data`. Choose a decision date from the active Data page window. Keep the recording under ten minutes and do not describe the app as a trading recommendation. Read cadence, forecast step, coverage, and missing periods from the loaded snapshot during the recording; do not rely on figures copied into this script.

## Customer pitch five minutes

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:45 | Decision desk for a decision day in the displayed data window | “WindDesk reconstructs the national wind forecast available at a GB day-ahead cutoff and compares it with measured outturn.” |
| 0:45–1:40 | Latest vintage, run age and day summary | “For each delivery period, the app selects the newest run published by the cutoff. Here the feed provides hourly forecasts, so the missing half-hours remain visible rather than being interpolated.” |
| 1:40–2:35 | Forecast chart, uncertainty band and table | “The blue line is the forecast, orange is outturn, and the band summarizes historical forward-horizon errors. The table exposes each half-hour and its gap or error.” |
| 2:35–3:35 | Accuracy view | “MAE, RMSE, bias, weighted MAPE, absolute-error quantiles, and skill versus persistence summarize the displayed data window. The sample count is visible, and the results describe this period only.” |
| 3:35–4:25 | Forecast age and cutoff comparison | “The Data page reports this snapshot’s measured runs per day and forecast step. Moving the cutoff shows how later information changes the selected run.” |
| 4:25–5:00 | Data view | “The analysis uses only Elexon FUELHH wind outturn and WINDFOR forecasts. It has no demand or price data, so it cannot calculate the residual purchase or its cost.” |

## Technical review five minutes

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:45 | Repository tree and architecture | “Ingestion is the only write path. The Flask API and React app read a small versioned snapshot.” |
| 0:45–1:40 | `backend/app/ingest.py` and snapshot files | “Requests are chunked and cached by their parameters. Ingest normalizes rows, upserts natural keys, writes deterministic gzip, checks hashes, and commits `meta.json` last under a single-writer lock.” |
| 1:40–2:30 | `backend/app/analytics.py` | “Every selected vintage is at or before the cutoff. Evaluation preserves all 48 half-hour outturn rows so forecast gaps remain explicit. Error is actual minus forecast.” |
| 2:30–3:20 | Test suite and API | “Tests cover cutoff selection, gap preservation, metrics, chunk caching, snapshot repair, source replacement, read-only routes, ETags, and missing data.” |
| 3:20–4:10 | React components and views | “The SPA shares one cutoff filter, cancels superseded requests, uses SVG charts and data tables, and shows a synthetic-data banner for offline fixtures.” |
| 4:10–5:00 | Docker, Vercel files and CI | “Docker runs the image; Vercel builds the same code as a serverless function and static site. This workspace has not been published or deployed yet.” |

Before recording, recompute one delivery day from the displayed table and note its MAE and bias. Record those values from the actual running app; do not read estimated or synthetic figures as real results.
