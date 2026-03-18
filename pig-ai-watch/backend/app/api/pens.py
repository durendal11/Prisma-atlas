from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
import cv2
import os

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Pen
from app.schemas.pig import PenCreate, PenResponse, PenUpdate

router = APIRouter(prefix="/api/pens", tags=["Pens"])


class CameraTestRequest(BaseModel):
    rtsp_url: str


class CameraTestResponse(BaseModel):
    success: bool
    message: str
    details: Optional[dict] = None


@router.get("", response_model=List[PenResponse])
async def get_pens(
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all pens. Returns fresh data (no cache)."""
    query = select(Pen)
    if is_active is not None:
        query = query.where(Pen.is_active == is_active)
    
    result = await db.execute(query.order_by(Pen.name))
    pens = result.scalars().all()
    
    # Serialize and return with no-cache headers to prevent stale data on refresh
    from fastapi.encoders import jsonable_encoder
    return JSONResponse(
        content=jsonable_encoder(pens),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
    )


@router.post("", response_model=PenResponse)
async def create_pen(
    pen_data: PenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new pen."""
    new_pen = Pen(**pen_data.model_dump())
    db.add(new_pen)
    await db.commit()
    await db.refresh(new_pen)
    
    # If camera_source is set, register with MediaMTX
    if new_pen.camera_source:
        from app.services import mediamtx
        await mediamtx.add_camera(f"pen_{new_pen.id}", new_pen.camera_source)
    
    return new_pen


@router.get("/{pen_id}", response_model=PenResponse)
async def get_pen(
    pen_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific pen."""
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pen not found"
        )
    return pen


@router.put("/{pen_id}", response_model=PenResponse)
async def update_pen(
    pen_id: int,
    pen_data: PenUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a pen."""
    from fastapi import HTTPException, status
    import logging
    logger = logging.getLogger(__name__)
    
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pen not found"
        )
    
    # Update only provided fields
    update_data = pen_data.model_dump(exclude_unset=True)
    logger.info(f"🔍 PenUpdate for pen {pen_id}: raw={pen_data}, dumped={update_data}")
    for field, value in update_data.items():
        logger.info(f"  Setting {field} = {repr(value)}")
        setattr(pen, field, value)
    
    # Force flush to generate UPDATE statement
    await db.flush()
    await db.commit()
    await db.refresh(pen)
    logger.info(f"✅ Pen {pen_id} updated. camera_source = {pen.camera_source}")
    
    # Sync camera change to MediaMTX proxy
    if "camera_source" in update_data:
        from app.services import mediamtx
        pen_name = f"pen_{pen_id}"
        if pen.camera_source:
            await mediamtx.add_camera(pen_name, pen.camera_source)
        else:
            await mediamtx.remove_camera(pen_name)
            # Also stop the active stream so it doesn't keep reading
            from app.services.camera_stream import stream_manager
            await stream_manager.stop_stream(pen_name)
    
    return pen


@router.post("/test-camera", response_model=CameraTestResponse)
async def test_camera_connection(
    test_data: CameraTestRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Test RTSP camera connection:
    1. Ping check — is the camera on the network?
    2. TCP port check — is RTSP port 554 open?
    3. RTSP stream test — can we read a frame?
    Runs blocking I/O in a thread pool.
    """
    import logging
    import asyncio
    
    logger = logging.getLogger(__name__)
    rtsp_url = test_data.rtsp_url
    
    logger.info(f"Testing camera connection: {rtsp_url}")
    
    def _test_camera_blocking(url: str) -> CameraTestResponse:
        """Run the full connection test in a thread (blocking I/O)."""
        import time
        import socket
        import subprocess
        import re
        
        # ── Step 1: Extract IP from RTSP URL ────────────────────────────
        ip_match = re.search(r'@([\d.]+)', url)
        if not ip_match:
            ip_match = re.search(r'rtsp://([\d.]+)', url)
        
        if ip_match:
            camera_ip = ip_match.group(1)
            
            # ── Step 2: Ping check (informational only — may fail inside Docker) ──
            logger.info(f"Step 1/3: Pinging {camera_ip}...")
            try:
                ping_result = subprocess.run(
                    ['ping', '-c', '2', '-W', '3', camera_ip],
                    capture_output=True, text=True, timeout=8
                )
                if ping_result.returncode != 0:
                    logger.warning(f"Ping failed for {camera_ip} — continuing with TCP/RTSP check anyway (ICMP may be blocked in Docker)")
                else:
                    logger.info(f"   Ping OK for {camera_ip}")
            except (subprocess.TimeoutExpired, Exception) as e:
                logger.warning(f"Ping timed out for {camera_ip}: {e} — continuing with TCP/RTSP check")
            
            # ── Step 3: TCP port check ──────────────────────────────────
            port_match = re.search(r':(\d+)/', url.split('@')[-1] if '@' in url else url)
            camera_port = int(port_match.group(1)) if port_match else 554
            
            logger.info(f"Step 2/3: TCP check {camera_ip}:{camera_port}...")
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(5)
                result = sock.connect_ex((camera_ip, camera_port))
                sock.close()
                if result != 0:
                    logger.warning(f"TCP port {camera_port} not open on {camera_ip} (error {result})")
                    return CameraTestResponse(
                        success=False,
                        message=f"Camera at {camera_ip} is online but RTSP port {camera_port} is not responding. The camera may be rebooting or RTSP is not enabled.",
                        details={
                            "error": "port_closed",
                            "step": "port_check",
                            "ip": camera_ip,
                            "port": camera_port,
                            "errno": result
                        }
                    )
                logger.info(f"   TCP port {camera_port} open")
            except Exception as e:
                logger.warning(f"TCP check exception: {e}")
                return CameraTestResponse(
                    success=False,
                    message=f"Could not connect to {camera_ip}:{camera_port} — {str(e)}",
                    details={"error": str(e), "step": "port_check"}
                )
        
        # ── Step 4: RTSP stream test using system ffmpeg (works like VLC) ──
        logger.info(f"Step 3/3: Opening RTSP stream...")
        
        import shutil
        system_ffmpeg = shutil.which("ffmpeg")
        
        capture = None
        try:
            if system_ffmpeg and url.lower().startswith("rtsp://"):
                # Use system ffmpeg — same engine as VLC, with proper TCP support
                logger.info(f"   Using system ffmpeg: {system_ffmpeg}")
                from app.services.camera_stream import FFmpegCapture
                capture = FFmpegCapture(url, width=1280, height=720, fps=30)
                if not capture.open():
                    logger.warning(f"System ffmpeg failed to open RTSP stream: {url}")
                    # Try reading stderr for error details
                    capture.release()
                    capture = None
            
            if capture is None:
                # Fallback to OpenCV's bundled FFMPEG
                # Note: OpenCV 4.13 on macOS may ignore this env var entirely
                logger.info(f"   Falling back to OpenCV FFMPEG")
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                    "rtsp_transport;tcp|timeout;10000000|analyzeduration;5000000|probesize;5000000"
                )
                capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
            
            if not capture.isOpened():
                logger.warning(f"Failed to open RTSP stream: {url}")
                return CameraTestResponse(
                    success=False,
                    message="RTSP stream could not be opened. Check username, password, and stream path (e.g. /stream1).",
                    details={"error": "stream_not_opened", "step": "rtsp_test"}
                )
            
            start_time = time.time()
            ret, frame = capture.read()
            read_time = time.time() - start_time
            
            if not ret or frame is None:
                logger.warning(f"Camera opened but cannot read frames: {url}")
                return CameraTestResponse(
                    success=False,
                    message="Camera connected but no frames received. Check username/password and stream path.",
                    details={
                        "error": "no_frames",
                        "step": "rtsp_test",
                        "read_time_ms": int(read_time * 1000)
                    }
                )
            
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = capture.get(cv2.CAP_PROP_FPS)
            
            logger.info(f"✅ Camera test successful: {url}")
            logger.info(f"   Resolution: {width}x{height}, FPS: {fps}")
            
            return CameraTestResponse(
                success=True,
                message=f"Camera connected successfully! Resolution: {width}x{height}",
                details={
                    "width": width,
                    "height": height,
                    "fps": fps,
                    "frame_shape": list(frame.shape),
                    "read_time_ms": int(read_time * 1000)
                }
            )
            
        except Exception as e:
            logger.error(f"Camera test exception: {str(e)}")
            return CameraTestResponse(
                success=False,
                message=f"Connection failed: {str(e)}",
                details={"error": str(e), "step": "rtsp_test"}
            )
        finally:
            if capture is not None:
                capture.release()
    
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _test_camera_blocking, rtsp_url)
    return result
