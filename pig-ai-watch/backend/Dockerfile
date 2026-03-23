# ── Backend Dockerfile ──────────────────────────────────────────
# Multi-stage build for Pig AI Watch FastAPI backend
# Works on macOS, Windows (Docker Desktop), and Linux

# ── Stage 1: Build dependencies ────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system-level build deps for opencv, psycopg2, numpy, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.docker.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.docker.txt

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Runtime system libs (OpenCV, Postgres client, video codecs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create a non-root user for security
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose the API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start with uvicorn — run migrations first via entrypoint
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
