from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel
import cv2
import os
import re

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import (
    Pen,
    Sow,
    Alert,
    Event,
    Detection,
    BehaviorLog,
    Task,
    FarrowingRecord,
    PigletRecord,
    RecordingSchedule,
    RecordingClip,
    StorageStatus,
)
from app.schemas.pig import PenCreate, PenResponse, PenUpdate

router = APIRouter(prefix="/api/pens", tags=["Pens"])


def _canonical_pen_name(name: Optional[str]) -> str:
    """Return a canonical key used for duplicate detection."""
    if not name:
        return ""
    cleaned = re.sub(r"[_\-]+", " ", str(name).strip().lower())
    cleaned = re.sub(r"\s+", " ", cleaned)

    # Treat pen_1, pen-1, pen 1, and Pen1 as the same logical pen.
    match = re.fullmatch(r"pen\s*(\d+)", cleaned)
    if match:
        return f"pen {int(match.group(1))}"

    return cleaned


def _normalize_pen_name(name: Optional[str]) -> str:
    """Normalize user input into a consistent stored pen name."""
    if not name:
        return ""
    canonical = _canonical_pen_name(name)
    match = re.fullmatch(r"pen\s(\d+)", canonical)
    if match:
        return f"Pen {int(match.group(1))}"
    return re.sub(r"\s+", " ", str(name).strip())


async def _find_pen_by_canonical_name(
    db: AsyncSession,
    canonical_name: str,
    exclude_id: Optional[int] = None,
) -> Optional[Pen]:
    query = select(Pen).execution_options(ignore_tenant=True)
    if exclude_id is not None:
        query = query.where(Pen.id != exclude_id)

    result = await db.execute(query)
    all_pens = result.scalars().all()
    for existing_pen in all_pens:
        if _canonical_pen_name(existing_pen.name) == canonical_name:
            return existing_pen
    return None


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
    validated_pens = [PenResponse.model_validate(p) for p in pens]
    return JSONResponse(
        content=jsonable_encoder(validated_pens),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
    )


@router.post("", response_model=PenResponse)
async def create_pen(
    pen_data: PenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new pen."""
    normalized_name = _normalize_pen_name(pen_data.name)
    canonical_name = _canonical_pen_name(normalized_name)

    existing_pen = await _find_pen_by_canonical_name(db, canonical_name)
    if existing_pen is not None:
        if existing_pen.owner_id in (None, current_user.id):
            # Reclaim legacy unowned rows so users can recreate names after data drift.
            pen_payload = pen_data.model_dump()
            pen_payload["name"] = normalized_name
            for field, value in pen_payload.items():
                setattr(existing_pen, field, value)
            existing_pen.owner_id = current_user.id
            existing_pen.is_active = True
            await db.commit()
            await db.refresh(existing_pen)
            return existing_pen

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pen name already exists in another account"
        )

    pen_payload = pen_data.model_dump()
    pen_payload["name"] = normalized_name
    pen_payload["owner_id"] = current_user.id

    new_pen = Pen(**pen_payload)
    db.add(new_pen)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        conflict_pen = await _find_pen_by_canonical_name(db, canonical_name)
        if conflict_pen is not None and conflict_pen.owner_id in (None, current_user.id):
            pen_payload = pen_data.model_dump()
            pen_payload["name"] = normalized_name
            for field, value in pen_payload.items():
                setattr(conflict_pen, field, value)
            conflict_pen.owner_id = current_user.id
            conflict_pen.is_active = True
            await db.commit()
            await db.refresh(conflict_pen)
            return conflict_pen
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pen name already exists"
        )
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
    if "name" in update_data and update_data["name"] is not None:
        normalized_name = _normalize_pen_name(update_data["name"])
        canonical_name = _canonical_pen_name(normalized_name)

        existing_pen = await _find_pen_by_canonical_name(db, canonical_name, exclude_id=pen_id)
        if existing_pen is not None:
            if existing_pen.owner_id in (None, current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f'Pen "{existing_pen.name}" already exists'
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Pen name already exists in another account"
            )

        update_data["name"] = normalized_name

    for field, value in update_data.items():
        logger.info(f"  Setting {field} = {repr(value)}")
        setattr(pen, field, value)
    
    # Force flush to generate UPDATE statement
    await db.flush()
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pen name already exists"
        )
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

    # Sync ROI polygon to live stream (hot-reload without restart)
    if "roi_points" in update_data:
        from app.services.camera_stream import stream_manager
        pen_name = f"pen_{pen_id}"
        existing_stream = stream_manager.streams.get(pen_name)
        if existing_stream is not None:
            existing_stream.roi_points = update_data["roi_points"]
            logger.info(f"✅ ROI polygon updated live for {pen_name}: {update_data['roi_points']}")

    return pen


@router.delete("/{pen_id}")
async def delete_pen(
    pen_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a pen when no sow is currently assigned to it."""
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()

    if not pen:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pen not found"
        )

    sow_result = await db.execute(select(Sow).where(Sow.pen_id == pen_id, Sow.is_archived == False))
    active_sow = sow_result.scalar_one_or_none()
    if active_sow:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Cannot delete pen while sow "{active_sow.tag_id}" is assigned'
        )

    # Best-effort stream/proxy cleanup; do not block DB deletion.
    try:
        from app.services import mediamtx
        from app.services.camera_stream import stream_manager

        pen_name = f"pen_{pen_id}"
        await mediamtx.remove_camera(pen_name)
        await stream_manager.stop_stream(pen_name)
    except Exception:
        pass

    try:
        # Keep historical/archived sows but detach from pen first.
        await db.execute(update(Sow).where(Sow.pen_id == pen_id).values(pen_id=None))

        # Delete dependent records that can block FK deletion of pens.
        farrowing_ids = select(FarrowingRecord.id).where(FarrowingRecord.pen_id == pen_id)
        await db.execute(delete(PigletRecord).where(PigletRecord.farrowing_record_id.in_(farrowing_ids)))
        await db.execute(delete(FarrowingRecord).where(FarrowingRecord.pen_id == pen_id))
        await db.execute(delete(Task).where(Task.pen_id == pen_id))
        await db.execute(delete(BehaviorLog).where(BehaviorLog.pen_id == pen_id))
        await db.execute(delete(Detection).where(Detection.pen_id == pen_id))
        await db.execute(delete(Alert).where(Alert.pen_id == pen_id))
        await db.execute(delete(Event).where(Event.pen_id == pen_id))
        await db.execute(delete(RecordingSchedule).where(RecordingSchedule.pen_id == pen_id))
        await db.execute(delete(RecordingClip).where(RecordingClip.pen_id == pen_id))
        await db.execute(delete(StorageStatus).where(StorageStatus.pen_id == pen_id))

        await db.delete(pen)
        await db.commit()
        return {"message": "Pen deleted successfully"}
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pen could not be deleted due to related records. Please try again."
        )


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

        # Edge Node Stream URLs point to cloud MediaMTX (rtsp://mediamtx:8554/pen_x)
        # and fail for different reasons than direct camera RTSP URLs.
        is_edge_stream = "mediamtx:8554" in (url or "") or re.search(r"/pen_\d+$", url or "") is not None
        
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
                if is_edge_stream:
                    return CameraTestResponse(
                        success=False,
                        message=(
                            "Edge stream is not available yet. Ensure MediaMTX is running on the cloud "
                            "and your edge proxy is actively publishing this exact path "
                            "(example: rtsp://<cloud-ip>:8554/pen_1)."
                        ),
                        details={"error": "stream_not_opened", "step": "rtsp_test", "mode": "edge_stream"}
                    )
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
