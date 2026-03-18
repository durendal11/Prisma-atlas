#!/usr/bin/env python3
"""
PRISMA ATLAS — Edge Mock Agent

Simulates a Raspberry Pi sending detection events to the cloud backend.
Use this to test the full pipeline LOCALLY without cameras or a Pi.

Usage:
    cd pig-ai-watch/edge
    python mock_push.py

It will POST a fake detection every INTERVAL seconds and print the response.
Open http://localhost:3000 to see events arrive in the dashboard live.
"""

import os
import sys
import time
import random
import signal
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

# ── Bootstrap ─────────────────────────────────────────────────────────────────

EDGE_DIR = Path(__file__).resolve().parent
load_dotenv(EDGE_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("mock-agent")

# ── Config (from .env) ────────────────────────────────────────────────────────

CLOUD_URL = os.getenv("CLOUD_API_URL", "http://localhost:8000").rstrip("/")
API_KEY   = os.getenv("EDGE_API_KEY", "test-key-local")
INTERVAL  = float(os.getenv("INFERENCE_INTERVAL_SEC", "2"))

PENS = [p.strip() for p in os.getenv("MOCK_PENS", "pen-1,pen-2,pen-3").split(",") if p.strip()]

# ── Signal handling ───────────────────────────────────────────────────────────

_running = True

def _stop(sig, frame):
    global _running
    logger.info("Stopping mock agent…")
    _running = False

signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)

# ── Fake detection generator ──────────────────────────────────────────────────

POSTURES = ["lying", "standing", "sitting", "nursing"]

def _fake_detection(pen_id: str) -> dict:
    piglet_count = random.randint(8, 14)
    sow_posture  = random.choice(POSTURES)
    # Occasionally trigger a high-risk crushing event for alert testing
    crushing_risk = round(random.choices(
        [random.uniform(0.0, 0.3), random.uniform(0.6, 0.95)],
        weights=[85, 15],
    )[0], 3)

    boxes = []
    # Add a fake sow bounding box
    boxes.append({
        "class_name": "sow",
        "confidence": round(random.uniform(0.80, 0.99), 3),
        "bbox": [
            random.randint(100, 400),
            random.randint(100, 300),
            random.randint(300, 500),
            random.randint(200, 400),
        ],
    })
    # Add fake piglet boxes
    for _ in range(piglet_count):
        boxes.append({
            "class_name": "piglet",
            "confidence": round(random.uniform(0.55, 0.95), 3),
            "bbox": [
                random.randint(50, 700),
                random.randint(50, 500),
                random.randint(40, 100),
                random.randint(40, 100),
            ],
        })

    return {
        "pen_id": pen_id,
        "piglet_count": piglet_count,
        "sow_posture": sow_posture,
        "crushing_risk": crushing_risk,
        "processing_time_ms": round(random.uniform(40, 180), 1),
        "bounding_boxes": boxes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    logger.info("Mock agent started → %s", CLOUD_URL)
    logger.info("Pens: %s  |  Interval: %.1fs", PENS, INTERVAL)
    logger.info("Press Ctrl-C to stop\n")

    headers = {
        "X-Edge-Key": API_KEY,
        "Content-Type": "application/json",
    }

    cycle = 0
    with httpx.Client(timeout=10) as client:
        while _running:
            cycle += 1
            pen = PENS[cycle % len(PENS)]
            payload = _fake_detection(pen)

            try:
                resp = client.post(
                    f"{CLOUD_URL}/api/edge/detections",
                    json=payload,
                    headers=headers,
                )
                risk_label = (
                    "⚠️  HIGH RISK" if payload["crushing_risk"] >= 0.6 else ""
                )
                logger.info(
                    "[%s] cycle=%d  piglets=%d  posture=%-10s  risk=%.2f  HTTP %d  %s",
                    pen,
                    cycle,
                    payload["piglet_count"],
                    payload["sow_posture"],
                    payload["crushing_risk"],
                    resp.status_code,
                    risk_label,
                )
                if resp.status_code not in (200, 201):
                    logger.warning("Unexpected response: %s", resp.text[:200])
            except httpx.ConnectError:
                logger.error(
                    "Cannot connect to %s — is the backend running?  "
                    "(docker compose up backend db)",
                    CLOUD_URL,
                )
            except Exception as exc:
                logger.error("Push error: %s", exc)

            time.sleep(INTERVAL)

    logger.info("Mock agent stopped.")


if __name__ == "__main__":
    # Quick dependency check
    try:
        import httpx  # noqa: F401
    except ImportError:
        sys.exit("httpx not installed.  Run: pip install httpx python-dotenv")
    main()
