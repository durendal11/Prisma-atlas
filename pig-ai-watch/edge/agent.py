#!/usr/bin/env python3
"""
PRISMA ATLAS — Edge Agent

Runs 24/7 on Raspberry Pi.  Performs:
  1. Pull pen/camera config from the cloud
  2. Check for model updates (download if new version)
  3. Spawn one CameraWorker thread per configured camera
  4. Run a sync-buffer flush loop (drains SQLite → cloud when online)
"""

import os
import sys
import time
import json
import hashlib
import signal
import logging
from pathlib import Path
from typing import Dict, List

import httpx
from dotenv import load_dotenv

# Allow importing YOLO detector from the backend package
EDGE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = EDGE_DIR.parent / "backend"
if BACKEND_DIR.exists():
    sys.path.insert(0, str(BACKEND_DIR))

from camera_worker import CameraWorker
from recording_worker import RecordingWorker
from sync_buffer import SyncBuffer
from storage_helper import detect_storage

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-18s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("edge-agent")

# ── Environment ──────────────────────────────────────────────────────────────

load_dotenv(EDGE_DIR / ".env")

CLOUD_URL       = os.getenv("CLOUD_API_URL", "http://localhost:8000").rstrip("/")
API_KEY         = os.getenv("EDGE_API_KEY", "")
MODEL_PATH      = Path(os.getenv("MODEL_PATH", str(EDGE_DIR / "models" / "pig_detection.onnx")))
INTERVAL        = float(os.getenv("INFERENCE_INTERVAL_SEC", "2"))
SYNC_INTERVAL   = float(os.getenv("SYNC_INTERVAL_SEC", "30"))
PURGE_DAYS      = int(os.getenv("BUFFER_PURGE_DAYS", "7"))
FRAME_W         = int(os.getenv("FRAME_WIDTH", "1280"))
FRAME_H         = int(os.getenv("FRAME_HEIGHT", "720"))
FRAME_FPS       = int(os.getenv("FRAME_FPS", "15"))
CONF_THRESH     = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))

# Cloud HTTP tuning (override in edge/.env when needed)
HTTP_CONNECT_TIMEOUT = float(os.getenv("EDGE_HTTP_CONNECT_TIMEOUT", "5"))
HTTP_READ_TIMEOUT = float(os.getenv("EDGE_HTTP_READ_TIMEOUT", "25"))
HTTP_WRITE_TIMEOUT = float(os.getenv("EDGE_HTTP_WRITE_TIMEOUT", "25"))
HTTP_POOL_TIMEOUT = float(os.getenv("EDGE_HTTP_POOL_TIMEOUT", "5"))
HTTP_RETRIES = int(os.getenv("EDGE_HTTP_RETRIES", "2"))
FALLBACK_TO_ENV_ON_EMPTY_CLOUD = os.getenv("EDGE_FALLBACK_TO_ENV_ON_EMPTY_CLOUD", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

HTTP_TIMEOUT = httpx.Timeout(
    connect=HTTP_CONNECT_TIMEOUT,
    read=HTTP_READ_TIMEOUT,
    write=HTTP_WRITE_TIMEOUT,
    pool=HTTP_POOL_TIMEOUT,
)
HTTP_CLIENT = httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True)

# Shared latest risk values keyed by pen_id, used by recording workers.
EDGE_PEN_RISKS: Dict[str, float] = {}

# ── Helpers ──────────────────────────────────────────────────────────────────

_headers = {"X-Edge-Key": API_KEY}


def _cloud_get(path: str, **kwargs) -> httpx.Response:
    last_exc = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            return HTTP_CLIENT.get(f"{CLOUD_URL}{path}", headers=_headers, **kwargs)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt < HTTP_RETRIES:
                time.sleep(min(2 * attempt, 5))
    raise last_exc


def _cloud_post(path: str, **kwargs) -> httpx.Response:
    last_exc = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            return HTTP_CLIENT.post(f"{CLOUD_URL}{path}", headers=_headers, **kwargs)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt < HTTP_RETRIES:
                time.sleep(min(2 * attempt, 5))
    raise last_exc


# ── 1. Pull Config ──────────────────────────────────────────────────────────

def fetch_camera_config() -> Dict[str, str]:
    """GET /api/edge/config → {pen_id: camera_url, …}"""
    # Local edge camera sources (LAN/file/index) used as fallback only.
    local_cameras = {}
    for i in range(1, 11):
        url = os.getenv(f"CAMERA_PEN_{i}")
        if url:
            local_cameras[f"pen_{i}"] = url

    # Try cloud first
    try:
        resp = _cloud_get("/api/edge/config")
        resp.raise_for_status()
        data = resp.json()
        cameras = {}
        for p in data.get("cameras", []):
            pen_id = p.get("pen_id")
            camera_url = (p.get("camera_url") or "").strip()
            if not pen_id or not camera_url:
                continue

            cameras[pen_id] = camera_url

        if cameras:
            logger.info("Loaded %d camera(s) from cloud config", len(cameras))
            return cameras

        logger.warning("Cloud config returned 0 usable camera URL(s)")
        if FALLBACK_TO_ENV_ON_EMPTY_CLOUD:
            logger.info("EDGE_FALLBACK_TO_ENV_ON_EMPTY_CLOUD=true, using local .env fallback")
            logger.info("Loaded %d camera(s) from local .env", len(local_cameras))
            return local_cameras

        # Cloud responded successfully, so treat it as source-of-truth.
        # This prevents stale local camera URLs from persisting after cloud updates.
        return {}
    except Exception as exc:
        logger.warning("Cloud config unavailable (%s), falling back to .env", exc)

    # Fallback: read CAMERA_PEN_* from environment
    logger.info("Loaded %d camera(s) from local .env", len(local_cameras))
    return local_cameras


# ── 2. Model Update ─────────────────────────────────────────────────────────

def _file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

VERSION_FILE = MODEL_PATH.with_name("model_version.json")

def get_current_model_version() -> str:
    if VERSION_FILE.exists():
        try:
            return json.loads(VERSION_FILE.read_text()).get("version", "pig-ai-watch-alpha")
        except:
            pass
    # Save the base version on first run
    save_model_version("pig-ai-watch-alpha")
    return "pig-ai-watch-alpha"

def save_model_version(version_name: str):
    try:
        VERSION_FILE.write_text(json.dumps({"version": version_name}))
    except Exception as exc:
        logger.warning("Could not save model version: %s", exc)

def check_and_update_model():
    """Compare local model hash with cloud; download if different."""
    local_version = get_current_model_version()
    try:
        resp = _cloud_get("/api/edge/model/version")
        resp.raise_for_status()
        remote = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            logger.info("Cloud model endpoint unavailable (404), keeping current model (version: %s)", local_version)
            return
        logger.warning("Model version check failed (%s), keeping current model (version: %s)", exc, local_version)
        return
    except Exception as exc:
        logger.warning("Model version check failed (%s), keeping current model (version: %s)", exc, local_version)
        return

    remote_md5 = remote.get("md5")
    if not remote_md5:
        return

    if MODEL_PATH.exists():
        local_md5 = _file_md5(MODEL_PATH)
        if local_md5 == remote_md5:
            logger.info("Model is up-to-date (md5=%s, version=%s)", local_md5[:12], local_version)
            return

    logger.info("Downloading updated model from cloud…")
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with httpx.stream("GET", f"{CLOUD_URL}/api/edge/model/download", headers=_headers, timeout=300) as r:
            r.raise_for_status()
            with open(MODEL_PATH, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=1 << 20):
                    f.write(chunk)
        
        # When update finishes, either extract version from remote filename or fallback
        new_filename = remote.get("filename", "pig-ai-watch-updated")
        new_version = Path(new_filename).stem if "." in new_filename else new_filename
        save_model_version(new_version)
        
        logger.info("Model updated successfully to version %s (md5=%s)", new_version, _file_md5(MODEL_PATH)[:12])
    except Exception as exc:
        logger.error("Model download failed: %s", exc)


# ── 3. Sync Buffer Flush ────────────────────────────────────────────────────

def flush_buffer(buf: SyncBuffer):
    """Push buffered detections to the cloud in batches."""
    buf.purge_old(PURGE_DAYS)
    rows = buf.peek(limit=100)
    if not rows:
        return

    ids = [r[0] for r in rows]
    payloads = [r[1] for r in rows]

    try:
        resp = _cloud_post("/api/edge/detections/batch", json={"detections": payloads})
        resp.raise_for_status()
        data = resp.json() if resp.content else {}
        stored = int(data.get("stored", 0)) if isinstance(data, dict) else 0
        if stored > 0:
            buf.delete_ids(ids[:stored])
        if stored < len(ids):
            logger.warning(
                "Partial buffer flush: stored=%d total=%d (kept %d for retry)",
                stored,
                len(ids),
                len(ids) - stored,
            )
        else:
            logger.info("Flushed %d buffered detections to cloud", len(ids))
    except Exception as exc:
        logger.warning("Buffer flush failed (%s), will retry", exc)


# ── 4. Main ─────────────────────────────────────────────────────────────────

def main():
    logger.info("════════════════════════════════════════════════")
    logger.info("  PRISMA ATLAS — Edge Agent  (Raspberry Pi)")
    logger.info("════════════════════════════════════════════════")
    logger.info("Cloud: %s", CLOUD_URL)
    logger.info("Model Path: %s", MODEL_PATH)

    # ── model
    check_and_update_model()
    current_version = get_current_model_version()
    logger.info("Current Model Version Loaded: %s", current_version)

    # Late-import detector so model path is settled
    from ultralytics import YOLO

    class SimpleDetector:
        """Lightweight wrapper matching backend YOLODetector.process_frame() interface."""
        def __init__(self, weights: str, conf: float):
            self.model = YOLO(weights)
            self.conf = conf
            self._posture_map = {
                "sow_standing": "standing", "sow_lying_lateral": "lying_lateral",
                "sow_lying_sternal": "lying_sternal", "sow_sitting": "sitting",
                "sow_nursing": "lactating", "sow_sleep": "sleeping",
                "sow_sleep_lactating": "sleeping_lactating",
                "sow_stand_feed": "standing_feeding",
                "sow_stand_lactating": "standing_lactating",
            }

        def process_frame(self, frame):
            import cv2
            from datetime import datetime, timezone
            from dataclasses import dataclass
            from typing import Any

            @dataclass
            class Result:
                piglet_count: int
                sow_posture: str
                crushing_risk: float
                bounding_boxes: list
                confidence_scores: list
                processing_time_ms: float
                timestamp: object

            start = cv2.getTickCount()
            results = self.model(frame, conf=self.conf, verbose=False)
            piglet_count = 0
            sow_posture = "unknown"
            bboxes = []
            confs = []
            sow_conf_best = 0.0

            for res in results:
                names = getattr(res, "names", {})
                if res.boxes is None:
                    continue
                for box in res.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].cpu().numpy()
                    raw_label = names.get(cls_id, f"class_{cls_id}")
                    label = raw_label.lower().replace(" ", "_").replace("-", "_")

                    bboxes.append({
                        "x": float(xyxy[0]), "y": float(xyxy[1]),
                        "width": float(xyxy[2] - xyxy[0]), "height": float(xyxy[3] - xyxy[1]),
                        "label": label, "raw_label": raw_label, "confidence": conf,
                    })
                    confs.append(conf)

                    if "piglet" in label or label == "pig":
                        piglet_count += 1
                    if "sow" in label and conf > sow_conf_best:
                        sow_posture = self._posture_map.get(label, label)
                        sow_conf_best = conf

            end = cv2.getTickCount()
            ms = (end - start) / cv2.getTickFrequency() * 1000
            return Result(
                piglet_count=piglet_count, sow_posture=sow_posture,
                crushing_risk=0.0, bounding_boxes=bboxes,
                confidence_scores=confs, processing_time_ms=ms,
                timestamp=datetime.now(timezone.utc),
            )

    detector = SimpleDetector(str(MODEL_PATH), CONF_THRESH)
    logger.info("YOLO model loaded")

    # ── cameras
    cameras = fetch_camera_config()

    buf = SyncBuffer()
    
    # Store latest crushing risk for the RecordingWorker to consume globally
    def on_status_update(pen_id: str, payload: dict):
        EDGE_PEN_RISKS[pen_id] = payload.get("crushing_risk", 0.0)

    workers: Dict[str, CameraWorker] = {}

    def _start_worker(pen_id: str, url: str):
        w = CameraWorker(
            pen_id=pen_id,
            camera_url=url,
            detector=detector,
            cloud_url=CLOUD_URL,
            api_key=API_KEY,
            sync_buffer=buf,
            interval=INTERVAL,
            frame_w=FRAME_W,
            frame_h=FRAME_H,
            frame_fps=FRAME_FPS,
            status_callback=on_status_update,
        )
        w.start()
        workers[pen_id] = w
        logger.info("Started camera worker for %s", pen_id)

    def _stop_worker(pen_id: str):
        w = workers.get(pen_id)
        if not w:
            return
        w.stop()
        w.join(timeout=5)
        workers.pop(pen_id, None)
        EDGE_PEN_RISKS.pop(pen_id, None)
        logger.info("Stopped camera worker for %s", pen_id)

    CONFIG_REFRESH_INTERVAL = max(10.0, float(os.getenv("EDGE_CONFIG_REFRESH_SEC", "30")))

    for pen_id, url in cameras.items():
        _start_worker(pen_id, url)
    logger.info("Started %d camera worker(s)", len(workers))
    if not workers:
        logger.warning(
            "No camera URLs configured at startup; agent will stay online and retry every %.0fs",
            CONFIG_REFRESH_INTERVAL,
        )

    current_camera_map = dict(cameras)
    last_config_refresh = 0.0

    def _sync_workers_from_cloud():
        nonlocal current_camera_map
        latest = fetch_camera_config()

        # Remove workers for pens deleted/disabled in cloud.
        for pen_id in list(workers.keys()):
            if pen_id not in latest or not latest.get(pen_id):
                _stop_worker(pen_id)

        # Add new workers or restart workers with changed camera URLs.
        for pen_id, url in latest.items():
            if not url:
                continue
            if pen_id not in workers:
                _start_worker(pen_id, url)
                continue
            if current_camera_map.get(pen_id) != url:
                logger.info("Camera URL changed for %s; restarting worker", pen_id)
                _stop_worker(pen_id)
                _start_worker(pen_id, url)

        if not latest and not workers:
            logger.info("Still waiting for camera URLs from cloud config")

        current_camera_map = dict(latest)

    # ── graceful shutdown
    stop = False

    def _sig(signo, _frame):
        nonlocal stop
        logger.info("Signal %s received — shutting down", signo)
        stop = True

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    # ── sync loop
    last_model_check = time.time()
    MODEL_CHECK_INTERVAL = 3600  # re-check model hourly

    while not stop:
        try:
            flush_buffer(buf)
        except Exception as exc:
            logger.error("Flush error: %s", exc)

        if time.time() - last_config_refresh > CONFIG_REFRESH_INTERVAL:
            try:
                _sync_workers_from_cloud()
                last_config_refresh = time.time()
            except Exception as exc:
                logger.warning("Camera config refresh failed: %s", exc)

        # Periodic model update check
        if time.time() - last_model_check > MODEL_CHECK_INTERVAL:
            check_and_update_model()
            last_model_check = time.time()

        # Sleep in small increments so we can catch signals
        for _ in range(int(SYNC_INTERVAL)):
            if stop:
                break
            time.sleep(1)

    # ── teardown
    for pen_id in list(workers.keys()):
        _stop_worker(pen_id)
    logger.info("Edge agent stopped")


if __name__ == "__main__":
    import threading
    
    # Track recording workers separate from camera workers
    recording_workers = {}
    recording_stream_map: Dict[str, str] = {}
    
    def fetch_recording_schedules() -> Dict[str, dict]:
        """GET /api/edge/recording-schedule -> {pen_id: schedule_list}"""
        try:
            resp = _cloud_get("/api/edge/recording-schedule")
            resp.raise_for_status()
            schedules = resp.json()
            return {str(s.get("pen_id")): s.get("schedule", []) for s in schedules}
        except Exception as exc:
            logger.warning("Recording schedule fetch failed: %s", exc)
            return {}

    def report_storage_status():
        """POST /api/edge/storage-status -> current free space"""
        try:
            path, total, free = detect_storage()
            payload = {
                "storage_path": str(path),
                "total_bytes": total,
                "free_bytes": free
            }
            _cloud_post("/api/edge/storage-status", json=payload)
        except Exception as exc:
            logger.warning("Storage status report failed: %s", exc)

    def schedule_loop():
        # Routinely poll GET /api/edge/recording-schedule and POST /api/edge/storage-status
        while True:
            # Report storage capacity periodically
            report_storage_status()
            
            # Fetch updated config and schedules
            cameras = fetch_camera_config()
            schedules = fetch_recording_schedules()
            
            # Manage RecordingWorker instances alongside CameraWorker
            # Since CameraWorkers are managed in main loop directly in this basic script,
            # we'll sync them here.
            for pen_id, url in cameras.items():
                pen_id_clean = pen_id.replace("pen_", "")
                # schedules dict usually comes in with numeric keys if from API:
                sched = schedules.get(pen_id_clean, schedules.get(pen_id, []))
                
                if pen_id not in recording_workers:
                    rw = RecordingWorker(
                        pen_id=pen_id, 
                        stream_url=url, 
                        schedules=sched,
                        cloud_url=CLOUD_URL, 
                        api_key=API_KEY,
                        get_risk_score=lambda pid=pen_id: EDGE_PEN_RISKS.get(pid, 0.0)
                    )
                    rw.start()
                    recording_workers[pen_id] = rw
                    recording_stream_map[pen_id] = url
                else:
                    if recording_stream_map.get(pen_id) != url:
                        recording_workers[pen_id].update_stream_url(url)
                        recording_stream_map[pen_id] = url
                    recording_workers[pen_id].update_schedules(sched)

            # Stop recording workers whose pens were removed/disabled in cloud config.
            for pen_id in list(recording_workers.keys()):
                if pen_id not in cameras or not cameras.get(pen_id):
                    try:
                        recording_workers[pen_id].stop()
                    finally:
                        recording_workers.pop(pen_id, None)
                        recording_stream_map.pop(pen_id, None)
                    
            time.sleep(15 * 60)  # Sleep 15 mins
            
    # Start schedule loop in background
    threading.Thread(target=schedule_loop, daemon=True).start()
    
    main()
