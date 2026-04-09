import os
import cv2
import time
import subprocess
import threading
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Dict
from storage_helper import detect_storage
import httpx

logger = logging.getLogger(__name__)

DETECTION_RISK_THRESHOLD = float(os.getenv("DETECTION_RECORD_RISK_THRESHOLD", "0.0"))
RECORDING_STORAGE_CAP_GB = float(os.getenv("RECORDING_STORAGE_CAP_GB", "5"))
RECORDING_STORAGE_CAP_BYTES = int(max(0.0, RECORDING_STORAGE_CAP_GB) * (1024 ** 3))

# Multiple recording workers can run in parallel; serialize global prune operations.
_CAP_ENFORCE_LOCK = threading.Lock()

class RecordingWorker:
    def __init__(
        self,
        pen_id: str,
        stream_url: str,
        schedules: list,
        cloud_url: str,
        api_key: str,
        chunk_duration_sec: int = 300,
        get_risk_score = None,
    ):
        self.get_risk_score = get_risk_score
        self.pen_id = pen_id
        if self.pen_id.startswith("pen_"):
            try:
                self.pen_id_int = int(self.pen_id.replace("pen_", ""))
            except ValueError:
                self.pen_id_int = 1
        else:
            try:
                self.pen_id_int = int(self.pen_id)
            except ValueError:
                self.pen_id_int = 1
                
        self.stream_url = stream_url
        self.schedules = schedules
        self.cloud_url = cloud_url
        self.api_key = api_key
        
        self.chunk_duration_sec = chunk_duration_sec
        self.thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.ffmpeg_proc: Optional[subprocess.Popen] = None
        self.storage_path, _, _ = detect_storage()
        
    def update_schedules(self, new_schedules: list):
        self.schedules = new_schedules

    def update_stream_url(self, new_stream_url: str):
        if new_stream_url and new_stream_url != self.stream_url:
            logger.info("Updating stream URL for %s", self.pen_id)
            self.stream_url = new_stream_url

    def get_current_mode(self) -> str:
        # Determine continuous, detection, or none based on current time
        now = datetime.now()
        # Frontend schedule grid is Sunday-first: [Sun, Mon, Tue, Wed, Thu, Fri, Sat].
        day = (now.weekday() + 1) % 7  # Convert Python weekday (Mon=0) -> Sun=0
        hour = now.hour
        
        # Check if the schedule is the new flat list format (168 items)
        if self.schedules and len(self.schedules) == 168 and isinstance(self.schedules[0], str):
            idx = day * 24 + hour
            if idx < len(self.schedules):
                return self.schedules[idx].lower()
                
        # Fallback to old dict format
        for slot in self.schedules:
            if isinstance(slot, dict) and slot.get("day") == day and slot.get("hour") == hour:
                return slot.get("mode", "none").lower()
                
        return "none"

    def report_clip(self, file_path: str, start_time: datetime, end_time: datetime, mode: str, size_bytes: int):
        try:
            payload = {
                "pen_id": self.pen_id_int,
                "file_path": str(file_path),
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "mode": mode,
                "file_size_bytes": size_bytes,
                "storage_path": str(self.storage_path)
            }
            
            # API endpoint according to router: POST /api/edge/recordings or POST /api/edge/recording-clip
            # We'll try recording-clip first as requested, fallback to recordings
            url = f"{self.cloud_url}/api/edge/recording-clip"
            headers = {"X-Edge-Key": self.api_key}
            
            resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 404:
                url = f"{self.cloud_url}/api/edge/recordings"
                resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            
            resp.raise_for_status()
            logger.info("Reported clip %s to cloud", file_path)
            
        except Exception as e:
            logger.error("Failed to report clip to cloud: %s", e)

    def _report_pruned_clips(self, file_paths: List[str]):
        if not file_paths:
            return

        try:
            payload = {
                "file_paths": file_paths,
            }
            url = f"{self.cloud_url}/api/edge/recordings/prune"
            headers = {"X-Edge-Key": self.api_key}
            resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            resp.raise_for_status()
            logger.info("Reported %d pruned clip metadata row(s)", len(file_paths))
        except Exception as exc:
            logger.warning("Failed to report pruned clips to cloud: %s", exc)

    def _collect_recording_files(self) -> List[tuple[Path, float, int]]:
        root = Path(self.storage_path)
        if not root.exists():
            return []

        files: List[tuple[Path, float, int]] = []
        for p in root.rglob("*.mp4"):
            try:
                st = p.stat()
                files.append((p, st.st_mtime, int(st.st_size)))
            except OSError:
                continue

        files.sort(key=lambda x: x[1])
        return files

    def _enforce_storage_cap(self):
        """Loop-recording retention: keep newest clips, delete stale clips past storage cap."""
        if RECORDING_STORAGE_CAP_BYTES <= 0:
            return

        with _CAP_ENFORCE_LOCK:
            files = self._collect_recording_files()
            total_size = sum(size for _, _, size in files)

            if total_size <= RECORDING_STORAGE_CAP_BYTES:
                return

            deleted_paths: List[str] = []

            # Always preserve at least the freshest clip.
            while total_size > RECORDING_STORAGE_CAP_BYTES and len(files) > 1:
                old_path, _mtime, old_size = files.pop(0)
                try:
                    old_path.unlink(missing_ok=True)
                    total_size -= old_size
                    deleted_paths.append(str(old_path))
                    logger.info(
                        "Loop recording: pruned stale clip %s (size=%d bytes)",
                        old_path,
                        old_size,
                    )
                except OSError as exc:
                    logger.warning("Failed to prune stale clip %s: %s", old_path, exc)

            if total_size > RECORDING_STORAGE_CAP_BYTES:
                logger.warning(
                    "Storage cap still exceeded after prune (used=%d cap=%d).",
                    total_size,
                    RECORDING_STORAGE_CAP_BYTES,
                )

            if deleted_paths:
                self._report_pruned_clips(deleted_paths)

    def _run_recording_loop(self):
        logger.info("Starting RecordingWorker for %s (URL=%s)", self.pen_id, self.stream_url)
        
        while not self._stop_event.is_set():
            mode = self.get_current_mode()
            
            if mode not in ["continuous", "detection"]:
                time.sleep(60)
                continue
                
            if mode == "detection":
                risk_score = self.get_risk_score() if self.get_risk_score else 0.0
                if risk_score < DETECTION_RISK_THRESHOLD:
                    # No significant crushing risk spike found, idle for a bit
                    time.sleep(5)
                    continue
                else:
                    logger.info("Crushing spike detected! (Risk: %.2f) Activating recording chunk for %s", risk_score, self.pen_id)

            # Free old clips first if the recording area has exceeded the configured cap.
            self._enforce_storage_cap()
            
            start_t = datetime.now()
            end_t = start_t + timedelta(seconds=self.chunk_duration_sec)
            
            folder = Path(self.storage_path) / self.pen_id / start_t.strftime("%Y-%m-%d")
            folder.mkdir(parents=True, exist_ok=True)
            
            filename = f"{self.pen_id}_{start_t.strftime('%H%M%S')}_{mode}.mp4"
            filepath = folder / filename
            
            # Use FFmpeg to dump the RTSP stream directly to MP4 chunk
            # -t duration, -c copy avoids re-encoding
            cmd = [
                "ffmpeg", "-y",
                "-rtsp_transport", "tcp",
                "-i", self.stream_url,
                "-t", str(self.chunk_duration_sec),
                "-c", "copy",
                "-an",
                str(filepath)
            ]
            
            logger.info("Recording chunk for %s (%s mode) to %s", self.pen_id, mode, filepath)
            
            try:
                self.ffmpeg_proc = subprocess.Popen(
                    cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                
                # Wait for the recording chunk to finish
                while self.ffmpeg_proc.poll() is None:
                    if self._stop_event.is_set():
                        self.ffmpeg_proc.terminate()
                        break
                    time.sleep(1)
                    
                if filepath.exists() and filepath.stat().st_size > 1024:
                    finish_t = datetime.now()
                    size_bytes = filepath.stat().st_size
                    self.report_clip(str(filepath), start_t, finish_t, mode, size_bytes)
                    # Enforce retention after adding a new clip as well.
                    self._enforce_storage_cap()
                else:
                    logger.warning("Recording file %s empty or missing", filepath)
                    
            except Exception as e:
                logger.error("Error running FFmpeg for %s: %s", self.pen_id, e)
                time.sleep(5)
                
            finally:
                if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
                    self.ffmpeg_proc.kill()

    def start(self):
        if not self.thread or not self.thread.is_alive():
            self._stop_event.clear()
            self.thread = threading.Thread(target=self._run_recording_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self._stop_event.set()
        if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
            self.ffmpeg_proc.terminate()
            try:
                self.ffmpeg_proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.ffmpeg_proc.kill()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3)
        logger.info("Stopped RecordingWorker for %s", self.pen_id)
