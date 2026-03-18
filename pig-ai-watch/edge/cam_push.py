#!/usr/bin/env python3
"""
PRISMA ATLAS — Camera Push (Mac / local testing)

Captures frames from a real camera (built-in FaceTime, USB webcam, or any
local video file) and POSTs detection events to the backend — no Raspberry Pi,
no YOLO install required.

"Inference" is simulated with plausible random values so you can verify the
full camera → edge-API → dashboard → WebSocket pipeline before deploying
on a Pi with a real YOLO model.

Usage:
    cd pig-ai-watch/edge
    source .venv/bin/activate
    python cam_push.py              # uses CAMERA_PEN_1 from .env (default: 0)
    python cam_push.py --device 0   # built-in camera
    python cam_push.py --device 1   # second USB camera
    python cam_push.py --device /path/to/video.mp4
    python cam_push.py --pen barn-1 --interval 3

The script prints a preview of every frame it captures (resolution + motion
level) so you can confirm the camera is actually open.
"""

import os
import sys
import time
import random
import signal
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import httpx
from dotenv import load_dotenv

# ── Bootstrap ─────────────────────────────────────────────────────────────────

EDGE_DIR = Path(__file__).resolve().parent
load_dotenv(EDGE_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("cam-push")

# ── CLI args ────────────────────────────────────────────────────────────────--

parser = argparse.ArgumentParser(description="Camera → edge API test agent")
parser.add_argument(
    "--device",
    default=os.getenv("CAMERA_PEN_1", "0"),
    help="Camera index (0 = built-in), video file path, or RTSP URL (default: CAMERA_PEN_1 from .env)",
)
parser.add_argument("--pen", default="pen-1", help="Pen ID to report detections under")
parser.add_argument(
    "--interval",
    type=float,
    default=float(os.getenv("INFERENCE_INTERVAL_SEC", "2")),
    help="Seconds between detections",
)
parser.add_argument("--cloud", default=os.getenv("CLOUD_API_URL", "http://localhost:8000").rstrip("/"))
parser.add_argument("--key", default=os.getenv("EDGE_API_KEY", "test-key-local"))
args = parser.parse_args()

# ── Signal handling ───────────────────────────────────────────────────────────

_running = True

def _stop(sig, frame):
    global _running
    logger.info("Stopping…")
    _running = False

signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)

# ── Camera open ───────────────────────────────────────────────────────────────

def _open_cam(device: str):
    """Return an opened cv2.VideoCapture, accepting int index or file/URL."""
    src = int(device) if device.isdigit() else device
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        logger.error("Could not open camera/device: %s", device)
        logger.error("Try a different index (0, 1, 2) or a video file path.")
        sys.exit(1)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    logger.info("Camera opened: %s  (%dx%d)", device, w, h)
    return cap

# ── Simulated inference ───────────────────────────────────────────────────────

POSTURES = ["lying", "standing", "sitting", "nursing"]

def _simulated_detection(frame, pen_id: str) -> dict:
    """
    Generates plausible (but random) detection data.
    The frame IS captured from the real camera — resolution and brightness
    checks confirm the camera is live.
    """
    h, w = frame.shape[:2]
    brightness = float(frame.mean())

    piglet_count = random.randint(8, 14)
    sow_posture  = random.choice(POSTURES)
    crushing_risk = round(random.choices(
        [random.uniform(0.0, 0.3), random.uniform(0.6, 0.95)],
        weights=[85, 15],
    )[0], 3)

    boxes = [
        {
            "class_name": "sow",
            "confidence": round(random.uniform(0.80, 0.99), 3),
            "bbox": [int(w * 0.2), int(h * 0.2), int(w * 0.5), int(h * 0.5)],
        }
    ]
    for _ in range(piglet_count):
        boxes.append({
            "class_name": "piglet",
            "confidence": round(random.uniform(0.55, 0.95), 3),
            "bbox": [
                random.randint(0, w - 80), random.randint(0, h - 80),
                random.randint(40, 100), random.randint(40, 100),
            ],
        })

    return {
        "pen_id": pen_id,
        "piglet_count": piglet_count,
        "sow_posture": sow_posture,
        "crushing_risk": crushing_risk,
        "processing_time_ms": round(random.uniform(40, 160), 1),
        "bounding_boxes": boxes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        # Extra debug fields (not stored, just logged)
        "_frame_brightness": round(brightness, 1),
        "_frame_resolution": f"{w}x{h}",
    }

# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    logger.info("╔══════════════════════════════════════════════╗")
    logger.info("║  PRISMA ATLAS — Camera Push (local test)     ║")
    logger.info("╚══════════════════════════════════════════════╝")
    logger.info("Camera device : %s", args.device)
    logger.info("Pen ID        : %s", args.pen)
    logger.info("Cloud URL     : %s", args.cloud)
    logger.info("Interval      : %.1fs", args.interval)
    logger.info("─────────────────────────────────────────────  ")
    logger.info("Inference is SIMULATED — deploy on Pi for real YOLO inference")
    logger.info("Press Ctrl-C to stop\n")

    cap = _open_cam(args.device)
    is_video = not str(args.device).isdigit() and Path(str(args.device)).suffix.lower() in {
        ".mp4", ".avi", ".mov", ".mkv", ".ts"
    }

    headers = {"X-Edge-Key": args.key, "Content-Type": "application/json"}
    prev_gray: Optional[cv2.Mat] = None
    cycle = 0

    with httpx.Client(timeout=10) as client:
        while _running:
            ok, frame = cap.read()

            if not ok:
                if is_video:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                logger.warning("Frame read failed — reconnecting…")
                cap.release()
                cap = _open_cam(args.device)
                continue

            # Motion detection (just for info — shows camera is live)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                motion = float(diff.mean())
            else:
                motion = 0.0
            prev_gray = gray

            payload = _simulated_detection(frame, args.pen)
            cycle += 1

            # Strip debug-only keys before sending
            send_payload = {k: v for k, v in payload.items() if not k.startswith("_")}

            try:
                resp = client.post(
                    f"{args.cloud}/api/edge/detections",
                    json=send_payload,
                    headers=headers,
                )
                risk_label = "⚠️  HIGH RISK" if payload["crushing_risk"] >= 0.6 else ""
                logger.info(
                    "cycle=%d  cam=%s  %dx%d  bright=%.0f  motion=%.2f  "
                    "piglets=%d  posture=%-10s  risk=%.2f  HTTP %d  %s",
                    cycle,
                    args.device,
                    frame.shape[1], frame.shape[0],
                    payload["_frame_brightness"],
                    motion,
                    payload["piglet_count"],
                    payload["sow_posture"],
                    payload["crushing_risk"],
                    resp.status_code,
                    risk_label,
                )
                if resp.status_code not in (200, 201):
                    logger.warning("Response: %s", resp.text[:300])
            except httpx.ConnectError:
                logger.error(
                    "Cannot connect to %s — is the backend running?  "
                    "(docker compose up db backend)",
                    args.cloud,
                )
            except Exception as exc:
                logger.error("Push error: %s", exc)

            time.sleep(args.interval)

    cap.release()
    logger.info("Camera released.")


if __name__ == "__main__":
    try:
        import cv2   # noqa: F401
        import httpx # noqa: F401
    except ImportError as e:
        sys.exit(f"Missing dependency: {e}\nRun: pip install opencv-python httpx python-dotenv")
    main()
