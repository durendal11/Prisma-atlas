"""
PRISMA ATLAS — Edge Camera Worker

One instance per camera.  Runs in its own thread:
  1. Opens the RTSP stream (FFmpeg or OpenCV fallback)
  2. Grabs frames at the configured interval
  3. Runs YOLO / ONNX inference
  4. POSTs the JSON result to the cloud
  5. On network failure → writes to the SyncBuffer
"""

import os
import cv2
import time
import shutil
import subprocess
import threading
import logging
import numpy as np
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

EDGE_PUSH_CONNECT_TIMEOUT = float(os.getenv("EDGE_PUSH_CONNECT_TIMEOUT", "5"))
EDGE_PUSH_READ_TIMEOUT = float(os.getenv("EDGE_PUSH_READ_TIMEOUT", "20"))
EDGE_PUSH_WRITE_TIMEOUT = float(os.getenv("EDGE_PUSH_WRITE_TIMEOUT", "20"))
EDGE_PUSH_POOL_TIMEOUT = float(os.getenv("EDGE_PUSH_POOL_TIMEOUT", "5"))
EDGE_PUSH_RETRIES = int(os.getenv("EDGE_PUSH_RETRIES", "2"))

EDGE_PUSH_TIMEOUT = httpx.Timeout(
    connect=EDGE_PUSH_CONNECT_TIMEOUT,
    read=EDGE_PUSH_READ_TIMEOUT,
    write=EDGE_PUSH_WRITE_TIMEOUT,
    pool=EDGE_PUSH_POOL_TIMEOUT,
)

SYSTEM_FFMPEG = shutil.which("ffmpeg")

# ── FFmpeg-based RTSP capture (same as backend) ────────────────────────────


class FFmpegCapture:
    """Read frames from an RTSP camera using system ffmpeg."""

    def __init__(self, url: str, width: int = 1280, height: int = 720, fps: int = 15):
        self.url = url
        self.width = width
        self.height = height
        self.fps = fps
        self.process: Optional[subprocess.Popen] = None
        self.frame_size = width * height * 3
        self._opened = False

    def open(self) -> bool:
        try:
            cmd = [
                SYSTEM_FFMPEG,
                "-rtsp_transport", "tcp",
                "-timeout", "10000000",
                "-analyzeduration", "5000000",
                "-probesize", "5000000",
                "-i", self.url,
                "-f", "rawvideo",
                "-pix_fmt", "bgr24",
                "-s", f"{self.width}x{self.height}",
                "-r", str(self.fps),
                "-an",
                "-loglevel", "warning",
                "-",
            ]
            self.process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                bufsize=self.frame_size * 2,
            )
            raw = self.process.stdout.read(self.frame_size)
            if len(raw) == self.frame_size:
                self._opened = True
                return True
            self.release()
            return False
        except Exception as exc:
            logger.error("FFmpegCapture.open error: %s", exc)
            self.release()
            return False

    def is_opened(self) -> bool:
        return self._opened and self.process is not None and self.process.poll() is None

    def read(self):
        if not self.is_opened():
            return False, None
        try:
            raw = self.process.stdout.read(self.frame_size)
            if len(raw) != self.frame_size:
                return False, None
            frame = np.frombuffer(raw, dtype=np.uint8).reshape(
                (self.height, self.width, 3)
            )
            return True, frame
        except Exception:
            return False, None

    def release(self):
        self._opened = False
        if self.process:
            try:
                self.process.stdout.close()
                self.process.stderr.close()
                self.process.terminate()
                self.process.wait(timeout=3)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None


def _is_video_file(url: str) -> bool:
    """Return True when the URL looks like a local video file path."""
    if url.isdigit():
        return False   # camera device index (e.g. "0")
    if url.lower().startswith(("rtsp://", "rtmp://", "http://", "https://")):
        return False
    return Path(url).suffix.lower() in {".mp4", ".avi", ".mov", ".mkv", ".ts", ".m4v"}


def _open_capture(url: str, width: int, height: int, fps: int):
    """Open a camera or video source.

    Accepted URL formats:
      "0", "1", …    — webcam / capture-card device index (Mac built-in = "0")
      "rtsp://…"     — IP/RTSP camera via FFmpeg (falls back to OpenCV)
      "/path/to.mp4" — video file, looped by CameraWorker.run
    """
    # Webcam or capture-card: cv2.VideoCapture needs an int index on macOS
    if url.isdigit():
        cap = cv2.VideoCapture(int(url))
        logger.info("Opened camera device index %s", url)
        return cap

    # RTSP: try FFmpeg first for lower latency, fall back to OpenCV
    if SYSTEM_FFMPEG and url.lower().startswith("rtsp://"):
        cap = FFmpegCapture(url, width=width, height=height, fps=fps)
        if cap.open():
            return cap
        logger.warning("FFmpeg failed for %s, falling back to OpenCV", url)

    # Video file or HTTP stream
    cap = cv2.VideoCapture(url)
    return cap


def _capture_is_opened(cap) -> bool:
    """Support both custom FFmpegCapture and OpenCV VideoCapture interfaces."""
    method = getattr(cap, "is_opened", None)
    if callable(method):
        return method()
    method = getattr(cap, "isOpened", None)
    if callable(method):
        return method()
    return False


# ── Camera Worker Thread ────────────────────────────────────────────────────


class CameraWorker(threading.Thread):
    """Continuously captures, infers, and pushes detections for one camera."""

    def __init__(
        self,
        pen_id: str,
        camera_url: str,
        detector,           # YOLODetector instance (shared or per-thread)
        cloud_url: str,
        api_key: str,
        sync_buffer,        # SyncBuffer instance
        *,
        interval: float = 2.0,
        frame_w: int = 1280,
        frame_h: int = 720,
        frame_fps: int = 15,
        status_callback = None
    ):
        super().__init__(daemon=True, name=f"cam-{pen_id}")
        self.pen_id = pen_id
        self.camera_url = camera_url
        self.detector = detector
        self.cloud_url = cloud_url.rstrip("/")
        self.api_key = api_key
        self.sync_buffer = sync_buffer
        self.interval = interval
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.frame_fps = frame_fps
        self.status_callback = status_callback
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    # ── main loop ────────────────────────────────────────────────

    def run(self):
        logger.info("[%s] Starting camera worker: %s", self.pen_id, self.camera_url)
        cap = None
        backoff = 2

        while not self._stop_event.is_set():
            # (re)connect
            if cap is None or not _capture_is_opened(cap):
                if cap is not None:
                    cap.release() if hasattr(cap, "release") else None
                logger.info("[%s] Connecting to camera…", self.pen_id)
                cap = _open_capture(self.camera_url, self.frame_w, self.frame_h, self.frame_fps)
                opened = _capture_is_opened(cap)
                if not opened:
                    logger.warning("[%s] Camera open failed, retrying in %ds", self.pen_id, backoff)
                    self._stop_event.wait(backoff)
                    backoff = min(backoff * 2, 60)
                    cap = None
                    continue
                backoff = 2
                logger.info("[%s] Camera connected", self.pen_id)

            # grab frame
            ok, frame = cap.read()
            if not ok:
                # For video files, loop back to start instead of reconnecting
                if _is_video_file(self.camera_url) and isinstance(cap, cv2.VideoCapture):
                    logger.debug("[%s] End of video file — looping", self.pen_id)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                logger.warning("[%s] Frame read failed", self.pen_id)
                cap = None
                continue

            # run inference
            try:
                result = self.detector.process_frame(frame)
            except Exception as exc:
                logger.error("[%s] Inference error: %s", self.pen_id, exc)
                self._stop_event.wait(self.interval)
                continue

            # build payload
            payload = {
                "pen_id": self.pen_id,
                "piglet_count": result.piglet_count,
                "sow_posture": result.sow_posture,
                "crushing_risk": round(result.crushing_risk, 3),
                "processing_time_ms": round(result.processing_time_ms, 1),
                "bounding_boxes": [
                    {
                        "class_name": b.get("raw_label", b["label"]),
                        "confidence": round(b["confidence"], 3),
                        "bbox": [b["x"], b["y"], b["width"], b["height"]],
                    }
                    for b in result.bounding_boxes
                ],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # push to cloud (or buffer)
            self._push(payload)
            
            # notify agent of the latest status
            if self.status_callback:
                self.status_callback(self.pen_id, payload)

            # wait for next cycle
            self._stop_event.wait(self.interval)

        # cleanup
        if cap is not None:
            cap.release() if hasattr(cap, "release") else None
        logger.info("[%s] Camera worker stopped", self.pen_id)

    # ── push helpers ─────────────────────────────────────────────

    def _push(self, payload: dict):
        url = f"{self.cloud_url}/api/edge/detections"
        headers = {"X-Edge-Key": self.api_key, "Content-Type": "application/json"}
        last_exc = None
        for attempt in range(1, EDGE_PUSH_RETRIES + 1):
            try:
                resp = httpx.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=EDGE_PUSH_TIMEOUT,
                    follow_redirects=True,
                )
                resp.raise_for_status()
                logger.debug("[%s] Pushed detection → cloud", self.pen_id)
                return
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code is not None and status_code >= 500 and attempt < EDGE_PUSH_RETRIES:
                    time.sleep(min(1 * attempt, 3))
                    continue
                body_preview = ""
                if exc.response is not None:
                    body_preview = (exc.response.text or "")[:300]
                logger.warning(
                    "[%s] Cloud push HTTP error status=%s body=%s",
                    self.pen_id,
                    status_code,
                    body_preview,
                )
                break
            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
                last_exc = exc
                if attempt < EDGE_PUSH_RETRIES:
                    time.sleep(min(1 * attempt, 3))
            except Exception as exc:
                last_exc = exc
                break

        logger.warning("[%s] Cloud push failed (%s), buffering locally", self.pen_id, last_exc)
        self.sync_buffer.insert(payload)
