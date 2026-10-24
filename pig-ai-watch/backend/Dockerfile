# ── Backend Dockerfile ──────────────────────────────────────────
# Production Dockerfile for Pig AI Watch FastAPI backend
# Works on macOS, Windows (Docker Desktop), and Linux

FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV, Postgres client, video codecs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libpq5 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.docker.txt .
RUN pip install --no-cache-dir -r requirements.docker.txt

# Copy application code
COPY . .

# Create a non-root user for security and model caching
RUN adduser --disabled-password --gecos "" appuser \
    && mkdir -p /home/appuser/.cache /home/appuser/.config \
    && chown -R appuser:appuser /home/appuser /app
USER appuser

# Expose the API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start API directly. Migrations are handled by the seed/deploy workflow.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
