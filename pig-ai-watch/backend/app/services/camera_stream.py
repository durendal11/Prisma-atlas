import os
import cv2
import asyncio
import numpy as np
import subprocess
import shutil
import threading
import time as _time
from typing import Dict, Optional, AsyncGenerator
from datetime import datetime
import logging
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.yolo_detector import get_detector, DetectionResult

# Force RTSP over TCP - critical for TP-Link Tapo and many IP cameras
# Note: OpenCV's bundled FFMPEG may ignore this env var on some builds,
# so we also use system ffmpeg via subprocess as a fallback.
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|timeout;10000000|analyzeduration;5000000|probesize;5000000"

logger = logging.getLogger(__name__)

# Check if system ffmpeg is available (works like VLC, unlike OpenCV's bundled one)
SYSTEM_FFMPEG = shutil.which("ffmpeg")
if SYSTEM_FFMPEG:
    logger.info(f"System ffmpeg found: {SYSTEM_FFMPEG} (will use for RTSP)")
else:
    logger.warning("System ffmpeg NOT found — falling back to OpenCV's bundled FFMPEG (may not work with some cameras)")


class FFmpegCapture:
    """Read frames from an RTSP camera using system ffmpeg (same engine as VLC).
    
    OpenCV's bundled FFMPEG often ignores RTSP-over-TCP settings, causing
    'No route to host' errors even when VLC/ffplay work fine.
    This class uses the system ffmpeg binary via subprocess to pipe raw frames.
    """
    
    def __init__(self, url: str, width: int = 1280, height: int = 720, fps: int = 30):
        self.url = url
        self.width = width
        self.height = height
        self.fps = fps
        self.process: Optional[subprocess.Popen] = None
        self.frame_size = width * height * 3  # BGR24
        self._opened = False
    
    def open(self) -> bool:
        """Start ffmpeg subprocess to read RTSP stream."""
        try:
            # Detect ffmpeg version to use correct timeout option name
            # ffmpeg 8.0+ renamed -stimeout to -timeout
            version_check = subprocess.run(
                [SYSTEM_FFMPEG, "-version"],
                capture_output=True, text=True, timeout=5
            )
            version_str = version_check.stdout.split("\n")[0] if version_check.stdout else ""
            # Use -timeout for ffmpeg 7+ (safe for both old and new)
            timeout_flag = "-timeout"
            
            cmd = [
                SYSTEM_FFMPEG,
                "-rtsp_transport", "tcp",
                "-fflags", "nobuffer",
                "-flags", "low_delay",
                "-max_delay", "500000",
                timeout_flag, "10000000",        # 10s socket timeout (microseconds)
                "-analyzeduration", "5000000",
                "-probesize", "5000000",
                "-i", self.url,
                "-f", "rawvideo",
                "-pix_fmt", "bgr24",            # OpenCV uses BGR
                "-s", f"{self.width}x{self.height}",
                "-r", str(self.fps),
                "-an",                           # No audio
                "-loglevel", "warning",
                "-"
            ]
            
            logger.info(f"   FFmpeg cmd: {' '.join(cmd[:8])}... (version: {version_str[:30]})")
            
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=self.frame_size * 2
            )
            
            # Try reading one frame to verify connection works
            raw = self.process.stdout.read(self.frame_size)
            if len(raw) == self.frame_size:
                self._opened = True
                return True
            else:
                # Read stderr for error details
                try:
                    err = self.process.stderr.read(2048).decode(errors="replace")
                    if err:
                        logger.warning(f"   FFmpeg stderr: {err.strip()[:200]}")
                except Exception:
                    pass
                self.release()
                return False
                
        except Exception as e:
            logger.error(f"FFmpegCapture.open() error: {e}")
            self.release()
            return False
    
    def isOpened(self) -> bool:
        return self._opened and self.process is not None and self.process.poll() is None
    
    def read(self):
        """Read one frame. Returns (success, frame) like cv2.VideoCapture."""
        if not self.isOpened():
            return False, None
        try:
            raw = self.process.stdout.read(self.frame_size)
            if len(raw) != self.frame_size:
                return False, None
            frame = np.frombuffer(raw, dtype=np.uint8).reshape((self.height, self.width, 3))
            return True, frame
        except Exception:
            return False, None
    
    def grab(self) -> bool:
        """Grab (discard) one frame — used to flush buffer."""
        if not self.isOpened():
            return False
        try:
            raw = self.process.stdout.read(self.frame_size)
            return len(raw) == self.frame_size
        except Exception:
            return False
    
    def get(self, prop_id: int):
        """Mimic cv2.VideoCapture.get() for common properties."""
        if prop_id == cv2.CAP_PROP_FRAME_WIDTH:
            return float(self.width)
        elif prop_id == cv2.CAP_PROP_FRAME_HEIGHT:
            return float(self.height)
        elif prop_id == cv2.CAP_PROP_FPS:
            return float(self.fps)
        elif prop_id == cv2.CAP_PROP_FOURCC:
            return 0.0
        return 0.0
    
    def set(self, prop_id: int, value) -> bool:
        """No-op for compatibility with cv2.VideoCapture.set()."""
        return False
    
    def release(self):
        """Kill the ffmpeg process."""
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


def _open_rtsp_capture(url: str):
    if SYSTEM_FFMPEG:
        cap = FFmpegCapture(url, width=1280, height=720, fps=30)
        if cap.open():
            return cap
    
    # Fallback to OpenCV FFMPEG with TCP
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "rtsp_transport;tcp|timeout;10000000|analyzeduration;5000000|probesize;5000000"
    )
    return cv2.VideoCapture(url, cv2.CAP_FFMPEG)


class CameraStream:
    """Manages video capture from RTSP/USB/IP cameras with auto-reconnection."""
    
    def __init__(self, pen_id: str, source: str | int | None):
        self.pen_id = pen_id
        self.source = source
        self.capture: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.frame_count = 0
        self.last_frame: Optional[np.ndarray] = None
        self.last_detection: Optional[DetectionResult] = None
        self.failed_read_count = 0
        self.max_failed_reads = 15  # Reconnect after 15 failed reads (faster recovery)
        self.is_network_camera = isinstance(source, str) and source is not None
        self.detection_frame_skip = settings.DETECTION_FRAME_SKIP
        self._reconnect_attempts = 0
        self._max_reconnect_backoff = 30  # Max 30s between reconnect attempts
        self._last_reconnect_time = 0.0
        self._read_thread: Optional[threading.Thread] = None
        self._thread_should_run = False
        # ROI polygon for this pen: [[x,y],...] normalized 0.0–1.0 or None
        self.roi_points: Optional[list] = None
        
    def start(self) -> bool:
        """Start capturing from the video source."""
        # Handle demo mode (no source configured)
        if self.source is None:
            logger.info(f"No camera source for pen {self.pen_id} - using demo mode")
            self.is_running = True
            if self._read_thread is None or not self._read_thread.is_alive():
                self._thread_should_run = True
                self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
                self._read_thread.start()
            return True
            
        for attempt in range(settings.CAMERA_RECONNECT_ATTEMPTS):
            try:
                if self.is_network_camera:
                    logger.info(f"🔌 Connecting to RTSP camera {self.pen_id}...")
                    logger.info(f"   URL: {self.source}")
                    logger.info(f"   Attempt: {attempt + 1}/{settings.CAMERA_RECONNECT_ATTEMPTS}")
                else:
                    logger.info(f"Connecting to camera {self.pen_id} (attempt {attempt + 1}/{settings.CAMERA_RECONNECT_ATTEMPTS})")
                
                # For network cameras, use system ffmpeg (works like VLC)
                if self.is_network_camera:
                    self.capture = _open_rtsp_capture(self.source)
                else:
                    self.capture = cv2.VideoCapture(self.source)
                
                if not self.capture.isOpened():
                    logger.warning(f"Failed to open camera source: {self.source}")
                    if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
                        import time
                        time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
                        continue
                    return False
                
                # Optimize for IP cameras - MINIMIZE LATENCY
                if self.is_network_camera:
                    # Minimize buffer to reduce latency (CRITICAL for low latency)
                    self.capture.set(cv2.CAP_PROP_BUFFERSIZE, settings.CAMERA_BUFFER_SIZE)
                    
                    # Set timeouts
                    self.capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, settings.CAMERA_OPEN_TIMEOUT_MS)
                    self.capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, settings.CAMERA_READ_TIMEOUT_MS)
                    
                    # Try to set quality settings
                    self.capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'H264'))
                    
                    # Disable internal buffering for minimal latency
                    self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
                # Set preferred resolution and FPS
                self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                self.capture.set(cv2.CAP_PROP_FPS, 30)
                
                # Verify camera is actually working
                ret, test_frame = self.capture.read()
                if not ret:
                    logger.warning(f"Camera opened but cannot read frames: {self.source}")
                    self.capture.release()
                    if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
                        import time
                        time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
                        continue
                    return False
                
                self.last_frame = test_frame
                self.is_running = True
                self.failed_read_count = 0
                
                # Log detailed connection info (especially for RTSP)
                if self.is_network_camera:
                    width = self.capture.get(cv2.CAP_PROP_FRAME_WIDTH)
                    height = self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
                    fps = self.capture.get(cv2.CAP_PROP_FPS)
                    fourcc = int(self.capture.get(cv2.CAP_PROP_FOURCC))
                    codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
                    
                    logger.info(f"✅ RTSP CAMERA CONNECTED SUCCESSFULLY")
                    logger.info(f"   Pen ID: {self.pen_id}")
                    logger.info(f"   Source: {self.source}")
                    logger.info(f"   Resolution: {int(width)}x{int(height)}")
                    logger.info(f"   FPS: {fps}")
                    logger.info(f"   Codec: {codec}")
                    logger.info(f"   Test frame shape: {test_frame.shape}")
                else:
                    logger.info(f"✅ Successfully started camera stream for pen {self.pen_id}")
                
                # Start background thread
                if self._read_thread is None or not self._read_thread.is_alive():
                    self._thread_should_run = True
                    self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
                    self._read_thread.start()
                return True
                
            except Exception as e:
                logger.error(f"Error starting camera stream (attempt {attempt + 1}): {e}")
                if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
                    import time
                    time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
                    continue
                    
        return False
    
    def reconnect(self) -> bool:
        """Attempt to reconnect to the camera source with exponential backoff."""
        import time as _time
        
        now = _time.time()
        
        # Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
        backoff = min(2 ** (self._reconnect_attempts + 1), self._max_reconnect_backoff)
        time_since_last = now - self._last_reconnect_time
        
        if time_since_last < backoff:
            # Too soon — skip this reconnect attempt
            logger.debug(f"Skipping reconnect for pen {self.pen_id} (backoff: {backoff}s, waited: {time_since_last:.0f}s)")
            return False
        
        self._reconnect_attempts += 1
        self._last_reconnect_time = now
        logger.info(f"🔄 Reconnecting camera pen {self.pen_id} (attempt #{self._reconnect_attempts}, backoff={backoff}s)")
        
        self.stop()
        success = self.start()
        
        if success:
            self._reconnect_attempts = 0  # Reset on success
            logger.info(f"✅ Camera pen {self.pen_id} reconnected successfully")
        else:
            logger.warning(f"❌ Camera pen {self.pen_id} reconnect failed (next retry in ~{min(2 ** (self._reconnect_attempts + 1), self._max_reconnect_backoff)}s)")
        
        return success
    
    def _read_loop(self):
        import time
        logger.info(f"Background reader thread started for pen {self.pen_id}")
        while self._thread_should_run:
            if not self.is_running:
                time.sleep(0.5)
                continue
            try:
                # For RTSP cameras always flush stale buffered frames to keep latency low.
                self.read_frame(flush_buffer=self.is_network_camera)
                time.sleep(0.01) # Small sleep to prevent CPU hogging
            except Exception as e:
                logger.error(f"Error in background reader loop for {self.pen_id}: {e}")
                time.sleep(1.0)
        logger.info(f"Background reader thread stopped for pen {self.pen_id}")
    
    def stop(self):
        """Stop the camera capture."""
        self.is_running = False
        if self.capture:
            self.capture.release()
            self.capture = None
        logger.info(f"Stopped camera stream for pen {self.pen_id}")
    
    def read_frame(self, flush_buffer: bool = True) -> Optional[np.ndarray]:
        """Read a single frame from the camera with auto-reconnection.
        
        Args:
            flush_buffer: If True, flush old frames to get the latest frame (reduces latency)
        """
        # Demo mode - return demo frame
        if self.source is None and self.is_running:
            return get_demo_frame(self.pen_id)
            
        if not self.capture or not self.is_running:
            return None
        
        # For network cameras, flush buffer to get latest frame (minimize latency)
        # Only flush 2 frames max — flushing 5 was too aggressive and slowed frame delivery
        if flush_buffer and self.is_network_camera:
            for _ in range(2):
                ret = self.capture.grab()
                if not ret:
                    break
        
        ret, frame = self.capture.read()
        if ret:
            self.last_frame = frame
            self.frame_count += 1
            self.failed_read_count = 0
            return frame
        else:
            # Handle failed read
            self.failed_read_count += 1
            logger.warning(f"Failed to read frame from pen {self.pen_id} ({self.failed_read_count}/{self.max_failed_reads})")
            
            # Attempt reconnection if too many failures
            if self.failed_read_count >= self.max_failed_reads and self.is_network_camera:
                logger.warning(f"Too many failed reads, attempting reconnection for pen {self.pen_id}")
                if self.reconnect():
                    # Try reading again after reconnection
                    ret, frame = self.capture.read()
                    if ret:
                        self.last_frame = frame
                        self.frame_count += 1
                        return frame
            
            # Return last good frame if available
            if self.last_frame is not None:
                return self.last_frame
                
        return None
    
    def get_frame_with_detection(self) -> tuple[Optional[np.ndarray], Optional[DetectionResult]]:
        """Read frame and process with YOLO detection (with frame skipping for performance)."""
        frame = self.read_frame(flush_buffer=True)  # Always flush buffer for low latency
        if frame is None:
            return None, None
        
        # Process detection only every N frames to reduce latency
        should_process = (self.frame_count % self.detection_frame_skip) == 0
        
        if should_process:
            detector = get_detector()
            detection = detector.process_frame(frame, roi_points=self.roi_points)
            self.last_detection = detection
        
        # Draw detections on frame (use last detection if we skipped processing)
        if self.last_detection:
            detector = get_detector()
            annotated_frame = detector.draw_detections(frame, self.last_detection)
        else:
            annotated_frame = frame
        
        return annotated_frame, self.last_detection

    def get_frame_fast(self) -> Optional[np.ndarray]:
        """Read frame fast — return the latest frame polled by background thread."""
        if self.last_frame is None:
            if self.source is None and self.is_running:
                return get_demo_frame(self.pen_id)
            return None
        
        # Clone to prevent tearing during drawing
        frame = self.last_frame.copy()
        
        # Overlay last detection result (non-blocking)
        if self.last_detection:
            try:
                from app.api.detect import get_detector
                detector = get_detector()
                frame = detector.draw_detections(frame, self.last_detection)
            except Exception:
                pass  # Don't let detection drawing crash the stream
        
        return frame

    def run_detection_once(self):
        """Run YOLO detection on the current frame (called from background thread)."""
        if self.last_frame is None:
            return
        try:
            detector = get_detector()
            detection = detector.process_frame(self.last_frame, roi_points=self.roi_points)
            self.last_detection = detection
        except Exception as e:
            logger.debug(f"Detection error for pen {self.pen_id}: {e}")



class StreamManager:
    """Manages multiple camera streams."""
    
    def __init__(self):
        self.streams: Dict[str, CameraStream] = {}
        self._lock = asyncio.Lock()
    
    def _normalize_pen_id(self, pen_id: str) -> str:
        """Normalize pen_id to 'pen_X' format."""
        # If pen_id is just a number (e.g., "1", "2"), convert to "pen_1", "pen_2"
        if pen_id.isdigit():
            return f"pen_{pen_id}"
        # If already in "pen_X" format, return as-is
        return pen_id

    def _extract_pen_number(self, pen_id: str) -> Optional[int]:
        """Extract numeric pen ID from normalized or raw pen_id."""
        if pen_id.isdigit():
            return int(pen_id)
        if pen_id.startswith("pen_"):
            try:
                return int(pen_id.split("_")[1])
            except (ValueError, IndexError):
                return None
        return None

    async def _get_camera_source_from_db(self, pen_id: str) -> Optional[str]:
        """Look up camera_source from the pens table in the database."""
        pen_number = self._extract_pen_number(pen_id)
        if pen_number is None:
            logger.warning(f"Could not extract pen number from '{pen_id}'")
            return None
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.pig import Pen
            from sqlalchemy import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Pen.camera_source).where(Pen.id == pen_number)
                )
                row = result.scalar_one_or_none()
                if row:
                    logger.info(f"📷 Found DB camera_source for pen {pen_number}: {row}")
                    return row
                logger.info(f"📷 DB query returned None for pen {pen_number} (no camera_source set)")
                return None
        except Exception as e:
            logger.error(f"Error querying DB for camera_source (pen {pen_number}): {e}", exc_info=True)
            return None
        
    async def get_stream(self, pen_id: str) -> Optional[CameraStream]:
        """Get or create a stream for a pen.
        
        Flow:
        1. Check DB/env for camera assignment
        2. If MediaMTX enabled and camera assigned → route through MediaMTX proxy
        3. If MediaMTX disabled and camera assigned → direct connection
        4. If no camera assigned → return None (no stream)
        """
        # Normalize pen_id to match CAMERA_SOURCES keys
        normalized_pen_id = self._normalize_pen_id(pen_id)
        logger.info(f"get_stream called: pen_id='{pen_id}' → normalized='{normalized_pen_id}'")
        
        async with self._lock:
            if normalized_pen_id not in self.streams:
                # ── Step 1: Check if pen has a camera assigned ───────────
                # Try env var first
                camera_url = settings.CAMERA_SOURCES.get(normalized_pen_id)
                logger.info(f"  Env var lookup for '{normalized_pen_id}': {camera_url}")
                
                # Fall back to DB
                if camera_url is None:
                    logger.info(f"  Falling back to DB lookup for pen_id='{pen_id}'")
                    camera_url = await self._get_camera_source_from_db(pen_id)
                    logger.info(f"  DB lookup result: {camera_url}")
                
                # No camera assigned? No stream.
                if camera_url is None:
                    logger.warning(f"No camera assigned to {normalized_pen_id}")
                    return None
                
                # ── Step 2: Determine connection method ──────────────────
                if settings.MEDIAMTX_ENABLED:
                    # Route through MediaMTX proxy instead of direct camera URL
                    source = f"{settings.MEDIAMTX_URL}/{normalized_pen_id}"
                    logger.info(f"  MediaMTX enabled → routing through: {source}")
                    logger.info(f"  (Camera URL {camera_url} is configured in MediaMTX)")
                    
                    # Quick check: verify MediaMTX has this path configured
                    try:
                        import httpx
                        async with httpx.AsyncClient(timeout=2.0) as client:
                            resp = await client.get(f"{settings.MEDIAMTX_API_URL}/v3/paths/get/{normalized_pen_id}")
                            if resp.status_code == 200:
                                logger.info(f"  MediaMTX path '{normalized_pen_id}' confirmed ready")
                            else:
                                logger.warning(f"  MediaMTX path '{normalized_pen_id}' not found (HTTP {resp.status_code})")
                                logger.warning(f"  Make sure mediamtx.yml has a '{normalized_pen_id}' path configured!")
                    except Exception as e:
                        logger.warning(f"  MediaMTX API check failed: {e}\n  Falling back to direct connection.")
                        source = camera_url
                else:
                    # Direct connection to camera
                    source = camera_url
                    logger.info(f"  MediaMTX disabled → direct connection: {source}")
                    # Direct connection to camera
                    source = camera_url
                    logger.info(f"  MediaMTX disabled → direct connection: {source}")
                
                # ── Step 3: Create stream ─────────────────────────────────
                stream = CameraStream(normalized_pen_id, source)
                # Run blocking start() in thread pool to avoid blocking the event loop
                loop = asyncio.get_event_loop()
                started = await loop.run_in_executor(None, stream.start)
                if started:
                    # Load ROI polygon from DB and attach to stream
                    pen_number = self._extract_pen_number(pen_id)
                    if pen_number is not None:
                        try:
                            from app.models.pig import Pen as PenModel
                            async with AsyncSessionLocal() as _s:
                                _roi = await _s.execute(
                                    select(PenModel.roi_points).where(PenModel.id == pen_number)
                                )
                                stream.roi_points = _roi.scalar_one_or_none()
                        except Exception as _e:
                            logger.warning(f"Could not load roi_points for pen {pen_number}: {_e}")
                    self.streams[normalized_pen_id] = stream
                else:
                    return None
            
            return self.streams.get(normalized_pen_id)
    
    async def stop_stream(self, pen_id: str):
        """Stop a specific stream and its detection thread."""
        normalized_pen_id = self._normalize_pen_id(pen_id)
        _stop_detection_thread(normalized_pen_id)
        async with self._lock:
            if normalized_pen_id in self.streams:
                self.streams[normalized_pen_id].stop()
                del self.streams[normalized_pen_id]
    
    async def stop_all(self):
        """Stop all streams and detection threads."""
        for pen_id in list(_detection_threads.keys()):
            _stop_detection_thread(pen_id)
        async with self._lock:
            for stream in self.streams.values():
                stream.stop()
            self.streams.clear()
    
    def get_active_streams(self) -> list[str]:
        """Get list of active pen IDs."""
        return list(self.streams.keys())


# Global stream manager
stream_manager = StreamManager()


# ─── Background detection thread ─────────────────────────────────────────────

_detection_threads: Dict[str, threading.Thread] = {}
_detection_stop_events: Dict[str, threading.Event] = {}


def _detection_worker(stream: CameraStream, stop_event: threading.Event, interval: float = 0.3):
    """Background thread that runs YOLO detection at a fixed interval.
    
    This keeps detection decoupled from frame delivery so the MJPEG stream
    stays smooth regardless of how long inference takes.
    """
    logger.info(f"🔍 Detection thread started for pen {stream.pen_id} (interval={interval}s)")
    while not stop_event.is_set() and stream.is_running:
        stream.run_detection_once()
        stop_event.wait(interval)  # Sleep but wake instantly on stop
    logger.info(f"🔍 Detection thread stopped for pen {stream.pen_id}")


def _start_detection_thread(stream: CameraStream):
    """Start a background detection thread for a stream."""
    pen_id = stream.pen_id
    # Stop existing thread if any
    _stop_detection_thread(pen_id)
    
    stop_event = threading.Event()
    # Detection every 0.3s (~3 detections/sec) — plenty for monitoring
    t = threading.Thread(
        target=_detection_worker, 
        args=(stream, stop_event, 0.3),
        daemon=True,
        name=f"detect-{pen_id}"
    )
    _detection_stop_events[pen_id] = stop_event
    _detection_threads[pen_id] = t
    t.start()


def _stop_detection_thread(pen_id: str):
    """Stop the background detection thread for a pen."""
    if pen_id in _detection_stop_events:
        _detection_stop_events[pen_id].set()
        del _detection_stop_events[pen_id]
    if pen_id in _detection_threads:
        try:
            _detection_threads[pen_id].join(timeout=2)
        except Exception:
            pass
        del _detection_threads[pen_id]


# ─── Stream output size for MJPEG (smaller = faster encode = smoother) ───────

STREAM_OUTPUT_WIDTH = 960
STREAM_OUTPUT_HEIGHT = 540
STREAM_JPEG_QUALITY = 55     # Good enough for live monitoring, much faster encode
STREAM_TARGET_FPS = 24       # 24 FPS is visually smooth, less CPU than 30


async def generate_mjpeg_stream(pen_id: str) -> AsyncGenerator[bytes, None]:
    """Generate MJPEG stream for a pen with smooth, low-latency delivery.
    
    Detection runs in a separate background thread so frame delivery
    is never blocked by YOLO inference.
    """
    stream = await stream_manager.get_stream(pen_id)
    
    if stream is None:
        # Return a placeholder frame if no camera available
        placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(
            placeholder, 
            f"No camera for {pen_id}", 
            (150, 240),
            cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2
        )
        _, buffer = cv2.imencode('.jpg', placeholder)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        return
    
    # Start background detection thread for this stream, but ONLY if backend is managing cameras
    if settings.LOCAL_CAMERAS_ENABLED:
        _start_detection_thread(stream)
    
    target_frame_time = 1.0 / STREAM_TARGET_FPS
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY]
    
    try:
        while stream.is_running:
            loop_start = _time.time()
            
            # get_frame_fast() reads frame + overlays cached detection (no YOLO blocking)
            frame = stream.get_frame_fast()
            
            if frame is None:
                await asyncio.sleep(0.01)
                continue
            
            # Resize for streaming — smaller frame = much faster JPEG encode
            h, w = frame.shape[:2]
            if w > STREAM_OUTPUT_WIDTH or h > STREAM_OUTPUT_HEIGHT:
                frame = cv2.resize(
                    frame, 
                    (STREAM_OUTPUT_WIDTH, STREAM_OUTPUT_HEIGHT),
                    interpolation=cv2.INTER_LINEAR  # Fast interpolation
                )
            
            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame, encode_params)
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            # Dynamic sleep to maintain target FPS
            elapsed = _time.time() - loop_start
            sleep_time = max(0.001, target_frame_time - elapsed)
            await asyncio.sleep(sleep_time)
    finally:
        # Clean up detection thread when stream client disconnects
        _stop_detection_thread(stream.pen_id)


def get_demo_frame(pen_id: str) -> np.ndarray:
    """Generate a demo frame for testing without actual cameras."""
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    
    # Add gradient background
    for i in range(720):
        frame[i, :] = [30 + i // 10, 30 + i // 15, 40 + i // 20]
    
    # Add simulated pen area
    cv2.rectangle(frame, (100, 100), (1180, 620), (60, 60, 60), -1)
    cv2.rectangle(frame, (100, 100), (1180, 620), (100, 100, 100), 3)
    
    # Add text
    cv2.putText(
        frame, f"Pen {pen_id} - Demo Mode", (450, 50),
        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2
    )
    
    # Simulate sow
    cv2.ellipse(frame, (640, 400), (200, 100), 0, 0, 360, (139, 90, 43), -1)
    
    # Simulate piglets
    np.random.seed(int(datetime.now().timestamp()) % 100)
    for i in range(8):
        x = np.random.randint(300, 980)
        y = np.random.randint(250, 550)
        cv2.circle(frame, (x, y), 20, (150, 100, 60), -1)
    
    cv2.putText(
        frame, "Simulated Detection Data", (480, 680),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 1
    )
    
    return frame
