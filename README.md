# WindDesk

WindDesk shows the national wind forecast a GB day-ahead buyer could have seen at a market cutoff, then compares it with outturn. Its default decision window follows the project configuration and the loaded snapshot metadata. The committed example snapshot covers January 2026. It uses only Elexon BMRS FUELHH (WIND) and WINDFOR data. Times are stored in UTC and presented in UK local time. Negative error means wind under-delivered.

The app has a decision desk, historical accuracy, forecast-age comparison, and data/method views. Forecast vintages are selected separately for each delivery half-hour using only rows published at or before the chosen cutoff. Missing forecast half-hours remain gaps. It does not include demand, price, solar, weather, or capacity data and should not be read as a trading recommendation.

## Run locally

Requirements: Python 3.12+, Node.js 22+, and npm.

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm ci
```

The real Elexon snapshot is included under `backend/data`, so no ingest is needed for the first run. For an offline synthetic fixture, use `python -m backend.app.ingest --synthetic --replace`; it will be labeled in the UI. To refresh with actual Elexon data, use `python -m backend.app.ingest --replace` on a machine with internet access. Check the reported FUELHH row counts, WINDFOR cadence and forecast step on the Data page before relying on the result. Downloaded response chunks are cached under `backend/data/.chunks` so an interrupted ingest can resume; pass `--fresh` to request every chunk again. A later cached rerun should print `up to date` and leave snapshot files untouched. `--if-missing` only ingests when the snapshot is absent or invalid; `--offline-verify` checks its hashes.

Start the API and front end in separate terminals:

```powershell
# In both terminals, start from the project root (the folder containing package.json):
.\backend\.venv\Scripts\Activate.ps1

# API terminal:
python -m flask --app backend.app.main run --host 127.0.0.1 --port 8000

# Front-end terminal:
npm.cmd run dev
```

Open http://localhost:8000/api/health first; it should return `"status":"ok"` and `"data_loaded":true`. Then open http://localhost:5173. The front end proxies `/api` to Flask, so both processes must stay running. If health says `data_loaded:false`, run `python -m backend.app.ingest` from the project root; if health cannot be reached, start the API terminal command above. `npm.cmd` avoids PowerShell's script execution policy blocking `npm.ps1`.

The Flask root route serves the dashboard when `frontend/dist` has been built. To serve it through Flask instead, run `npm run build` from the project root first, then open http://localhost:8000. The API remains available at `/api/health` either way.

## Docker

```sh
docker compose up --build
```

The container builds the SPA, serves it with Gunicorn, and runs the idempotent ingest command only when no snapshot exists. Mount `backend/data` to retain snapshots between container rebuilds. Docker is the run-anywhere and Heroku container path. Vercel builds the same source as a serverless function and static site; it does not run the Docker image.

## Data and architecture

`backend/app/ingest.py` is the only writer. It normalizes Elexon rows, merges natural keys, writes canonical gzip bytes and publishes `meta.json` last as the snapshot commit marker. `data.py` checks SHA-256 hashes before a read. The analyzer is pure pandas; Flask is read-only. Elexon’s BMRS data is credited as the source. API routes are GET-only and use ETags.

Outturn and forecast row counts, coverage, forecast cadence, step size, horizon range, and ingestion QA are measured from the loaded snapshot and shown on the Data page. Forecast-level calibration ranges are derived from the snapshot rather than fixed MW thresholds. No interpolation is performed. Persistence uses the last outturn whose settlement period ended at least the configured lag before the cutoff. Empirical bands are descriptive, not probabilistic.

## Project map

```text
backend/app/       configuration, ingestion, snapshot, analytics and API
backend/tests/     analytics and idempotent ingest checks
frontend/src/      React application and shared chart/table components
api/index.py       Vercel Flask entry point
Dockerfile         multi-stage run-anywhere image
compose.yaml       local Docker setup
.github/workflows  backend, frontend and container CI
docs/              demo script and submission checklist
```

## Deployment

Commit `backend/data/{fuelhh_wind.csv.gz,windfor.csv.gz,meta.json}` after an actual ingest and review of the Data page. Vercel uses `vercel.json`, `api/index.py`, and the committed snapshot. Set `WIND_DATA_DIR` or `ELEXON_BASE_URL` only when the deployment needs a non-default path or mirror. Heroku can run the same Dockerfile. Add the live links here after deployment.

## Configuration

The decision dates, cutoff presets, forecast look-back, persistence lag, default publication lag, forecast-level bin count, and horizon-bin settings are read from environment variables in `backend/app/config.py`. The browser reads the active date window, cutoff presets, counts, and measured statistics from the API snapshot. Current options include `DECISION_START`, `DECISION_END`, `CUTOFF_PRESETS`, `FORECAST_LOOKBACK_DAYS`, `OUTTURN_LAG_MIN`, `PUBLICATION_LAG_MIN`, `FORECAST_LEVEL_BINS`, `HORIZON_BIN_HOURS`, `MIN_HORIZON_BIN_ROWS`, `ROLLING_MIN_HISTORY_DAYS`, and `ERROR_HISTOGRAM_BINS`.

## AI use disclosure

AI assistance was used to draft and implement project code and documentation. The dataset, API behavior, metrics, deployment, and real-data results require independent verification before use.
