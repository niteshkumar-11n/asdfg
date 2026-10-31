#!/bin/sh
set -eu
if [ ! -f "${WIND_DATA_DIR}/meta.json" ]; then
  python -m backend.app.ingest --if-missing
fi
exec gunicorn --bind "0.0.0.0:${PORT:-8000}" --workers 2 --timeout 120 backend.app.main:app
