FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY server/requirements.txt /app/server/requirements.txt
COPY server/requirements-deploy.lock /app/server/requirements-deploy.lock
RUN python -m pip install -r server/requirements.txt -c server/requirements-deploy.lock
COPY server/app /app/server/app
COPY server/models /app/server/models
RUN useradd --uid 10001 --create-home xiaoan \
    && mkdir -p /app/server/data /app/server/.secrets /app/server/security-data \
    && chown -R xiaoan:xiaoan /app/server/data /app/server/.secrets /app/server/security-data
USER xiaoan
EXPOSE 8010
# The device manager owns local processes and must run in a single API worker.
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "8010", "--workers", "1"]
