FROM node:22-slim AS frontend
WORKDIR /build
COPY package*.json tsconfig.json build.mjs ./
COPY frontend ./frontend
RUN npm ci && npm run typecheck && npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 WIND_STATIC_DIR=/app/frontend/dist WIND_DATA_DIR=/app/backend/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY --from=frontend /build/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./
RUN useradd --create-home --uid 10001 winddesk && mkdir -p /app/backend/data && chown -R winddesk:winddesk /app
USER winddesk
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
