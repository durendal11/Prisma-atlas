"""
PRISMA ATLAS — Edge Device API Router

Endpoints consumed by the Raspberry Pi edge agent:
  POST /api/edge/detections       — single detection push
  POST /api/edge/detections/batch — offline-sync batch push
  GET  /api/edge/config           — camera / pen configuration
  GET  /api/edge/model/version    — current model filename + MD5
  GET  /api/edge/model/download   — stream the model file
"""

import hashlib
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings
from app.core.database import get_db
from app.models.pig import Alert, Detection, Event, Pen

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/edge", tags=["Edge Device"])


# ── Auth dependency ──────────────────────────────────────────────────────────

async def verify_edge_key(request: Request):
    """Validate the X-Edge-Key header against settings.EDGE_API_KEY."""
    key = request.headers.get("X-Edge-Key", "")
    if not settings.EDGE_API_KEY or key != settings.EDGE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge key")


# ── Schemas ──────────────────────────────────────────────────────────────────

class BBox(BaseModel):
    class_name: str
    confidence: float
    bbox: List[float]  # [x, y, w, h]


class DetectionPush(BaseModel):
    pen_id: str
    piglet_count: int = 0
    sow_posture: str = "unknown"
    crushing_risk: float = 0.0
    processing_time_ms: float = 0.0
    bounding_boxes: List[BBox] = []
    timestamp: str  # ISO-8601


class DetectionBatch(BaseModel):
    detections: List[DetectionPush]


class CameraConfig(BaseModel):
    pen_id: str
    camera_url: Optional[str]
    thresholds: dict = {}


class ConfigResponse(BaseModel):
    cameras: List[CameraConfig]


class PublisherConfig(BaseModel):
    pen_id: str
    stream_path: str
    local_camera_url: str


class PublisherConfigResponse(BaseModel):
    publishers: List[PublisherConfig]


class ModelVersion(BaseModel):
    filename: str
    md5: str


# ── POST /detections ─────────────────────────────────────────────────────────

@router.post("/detections", dependencies=[Depends(verify_edge_key)])
async def push_detection(body: DetectionPush, db: AsyncSession = Depends(get_db)):
    """Receive a single detection from the edge device."""
    try:
        pen_id_int = _resolve_pen_id(body.pen_id)
        result = await db.execute(select(Pen).where(Pen.id == pen_id_int).execution_options(ignore_tenant=True))
        pen = result.scalar_one_or_none()
        if pen:
            db.info["tenant_id"] = pen.owner_id

        # Pen model has no current_sow_id field; treat an existing pen as writable.
        has_sow = bool(pen)
        detection, event, alert, message, pen_id = _build_detection_payload(body, has_sow=has_sow)
        
        if has_sow:
            db.add(detection)
            db.add(event)
            if alert is not None:
                db.add(alert)

        await db.commit()
        if has_sow and alert is not None:
             try:
                 await db.refresh(alert)
                 from app.core.firebase import broadcast_alert
                 await broadcast_alert(
                     title=alert.title,
                     body=alert.message,
                     alert_type=alert.type,
                     pen_id=alert.pen_id,
                     severity=alert.severity
                 )
             except Exception as e:
                 logger.error(f"Error broadcasting alert: {e}")
        await _broadcast_detection(message, pen_id)
        return {"status": "ok"}
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=f"Invalid detection payload: {exc}")
    except IntegrityError as exc:
        await db.rollback()
        logger.warning("Edge detection rejected by DB constraints: %s", exc)
        raise HTTPException(
            status_code=400,
            detail="Detection rejected. Ensure referenced pen exists and payload is valid.",
        )
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.exception("Edge detection database error, trying legacy fallback")

        # Compatibility fallback for drifted schemas in production.
        # Stores the detection row with legacy-safe columns only.
        try:
            pen_id_int = _resolve_pen_id(body.pen_id)
            await _insert_detection_legacy(db, body, pen_id_int)
            await db.commit()
            message, pen_id = _build_ws_message(body)
            await _broadcast_detection(message, pen_id)
            return {"status": "ok", "mode": "legacy_fallback"}
        except Exception:
            await db.rollback()
            logger.exception("Legacy fallback insert failed")
            raise HTTPException(status_code=500, detail="Database error while storing detection")


# ── POST /detections/batch ───────────────────────────────────────────────────

@router.post("/detections/batch", dependencies=[Depends(verify_edge_key)])
async def push_detection_batch(body: DetectionBatch, db: AsyncSession = Depends(get_db)):
    """Receive a batch of buffered detections (offline sync)."""
    # Before: 1 transaction per detection in the loop.
    # After: 1 transaction for the entire batch.
    stored = 0
    pending_messages: List[Tuple[dict, str]] = []
    active_alerts: List[Alert] = []

    for det in body.detections:
        try:
            pen = None
            if det.pen_id:
                pen_id_int = _resolve_pen_id(det.pen_id)
                result = await db.execute(select(Pen).where(Pen.id == pen_id_int).execution_options(ignore_tenant=True))
                pen = result.scalar_one_or_none()
                if pen:
                    db.info["tenant_id"] = pen.owner_id
                    
            # Pen model has no current_sow_id field; treat an existing pen as writable.
            has_sow = bool(pen)
            detection, event, alert, message, pen_id = _build_detection_payload(det, has_sow=has_sow)
            
            if has_sow:
                db.add(detection)
                db.add(event)
                if alert is not None:
                    db.add(alert)
                    active_alerts.append(alert)
                    
            pending_messages.append((message, pen_id))
            if has_sow:
                stored += 1
        except Exception as exc:
            logger.warning("Skipping duplicate/bad detection: %s", exc)

    if stored:
        try:
            await db.commit()
            for alert in active_alerts:
                try:
                    await db.refresh(alert)
                    from app.core.firebase import broadcast_alert
                    await broadcast_alert(
                        title=alert.title,
                        body=alert.message,
                        alert_type=alert.type,
                        pen_id=alert.pen_id,
                        severity=alert.severity
                    )
                except Exception as e:
                    logger.error(f"Error broadcasting alert: {e}")
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Batch commit failed")
            raise HTTPException(status_code=500, detail="Database error while storing detection batch")

        for message, pen_id in pending_messages:
            await _broadcast_detection(message, pen_id)

    return {"status": "ok", "stored": stored, "total": len(body.detections)}


# ── GET /config ──────────────────────────────────────────────────────────────

@router.get("/config", dependencies=[Depends(verify_edge_key)], response_model=ConfigResponse)
async def get_edge_config(db: AsyncSession = Depends(get_db)):
    """Return pen/camera configuration for the edge device."""
    result = await db.execute(select(Pen).where(Pen.is_active == True))
    pens = result.scalars().all()
    cameras = [
        CameraConfig(
            pen_id=f"pen_{p.id}",
            camera_url=p.edge_camera_source or p.camera_source,
            thresholds={"crushing_risk": settings.CRUSHING_RISK_THRESHOLD},
        )
        for p in pens
    ]
    return ConfigResponse(cameras=cameras)


def _extract_edge_stream_path(camera_source: Optional[str]) -> Optional[str]:
    """Return a publish path (e.g. pen_1) for Edge Node stream camera_source URLs."""
    if not camera_source:
        return None

    try:
        parsed = urlparse(camera_source)
    except Exception:
        return None

    raw_path = (parsed.path or "").strip("/")
    if not raw_path:
        return None

    netloc = (parsed.netloc or "").lower()
    # Edge Node streams are expected to target cloud MediaMTX publish paths.
    if "mediamtx" in netloc or re.fullmatch(r"pen_[a-zA-Z0-9_-]+", raw_path):
        return raw_path
    return None


@router.get("/publisher-config", dependencies=[Depends(verify_edge_key)], response_model=PublisherConfigResponse)
async def get_edge_publisher_config(db: AsyncSession = Depends(get_db)):
    """Return edge publisher assignments from cloud camera setup.

    Requires both:
      - camera_source: cloud RTSP path (rtsp://.../pen_X)
      - edge_camera_source: farm-local RTSP camera URL
    """
    result = await db.execute(select(Pen).where(Pen.is_active == True))
    pens = result.scalars().all()

    publishers: List[PublisherConfig] = []
    for p in pens:
        local_camera_url = (p.edge_camera_source or "").strip()
        stream_path = _extract_edge_stream_path(p.camera_source)
        if not local_camera_url or not stream_path:
            continue

        publishers.append(
            PublisherConfig(
                pen_id=f"pen_{p.id}",
                stream_path=stream_path,
                local_camera_url=local_camera_url,
            )
        )

    return PublisherConfigResponse(publishers=publishers)


# ── GET /model/version ───────────────────────────────────────────────────────

@router.get("/model/version", dependencies=[Depends(verify_edge_key)], response_model=ModelVersion)
async def get_model_version():
    """Return the current model filename and MD5 hash."""
    model_path = Path(settings.YOLO_WEIGHTS_PATH)
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="Model file not found on server")
    md5 = hashlib.md5()
    with open(model_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            md5.update(chunk)
    return ModelVersion(filename=model_path.name, md5=md5.hexdigest())


# ── GET /model/download ─────────────────────────────────────────────────────

@router.get("/model/download", dependencies=[Depends(verify_edge_key)])
async def download_model():
    """Stream the YOLO model file to the edge device."""
    model_path = Path(settings.YOLO_WEIGHTS_PATH)
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="Model file not found on server")
    return FileResponse(
        path=str(model_path),
        filename=model_path.name,
        media_type="application/octet-stream",
    )


# ── Internal helpers ─────────────────────────────────────────────────────────

def _resolve_pen_id(pen_id: str) -> int:
    """Resolve pen_id string to integer (e.g. pen_3 -> 3)."""
    try:
        return int(pen_id.replace("pen_", ""))
    except (ValueError, AttributeError):
        return 1


def _build_detection_payload(det: DetectionPush, has_sow: bool = True) -> Tuple[Detection, Event, Optional[Alert], dict, str]:
    """Build ORM objects and websocket payload from a detection request."""
    pen_id_int = _resolve_pen_id(det.pen_id)
    ts_str = det.timestamp.replace("Z", "+00:00")
    ts = datetime.fromisoformat(ts_str)

    detection = Detection(
        pen_id=pen_id_int,
        piglet_count=det.piglet_count,
        sow_posture=det.sow_posture,
        crushing_risk=det.crushing_risk,
        bounding_boxes=json.dumps([b.model_dump() for b in det.bounding_boxes]),
        confidence_scores=json.dumps([b.confidence for b in det.bounding_boxes]),
        processing_time_ms=det.processing_time_ms,
        frame_timestamp=ts,
    )

    event = Event(
        type="detection",
        category="ai_detection",
        description=f"Edge detection: {det.piglet_count} piglet(s), posture={det.sow_posture}, risk={det.crushing_risk:.2f}",
        pen_id=pen_id_int,
        event_metadata=json.dumps({
            "piglet_count": det.piglet_count,
            "sow_posture": det.sow_posture,
            "crushing_risk": det.crushing_risk,
            "source": "edge_device",
        }),
    )

    alert: Optional[Alert] = None
    if has_sow and det.crushing_risk >= settings.CRUSHING_RISK_THRESHOLD:
        severity = "critical" if det.crushing_risk >= 0.8 else "high"
        alert = Alert(
            type="crushing_risk",
            severity=severity,
            title=f"Crushing Risk Detected - {det.pen_id}",
            message=f"Crushing risk {det.crushing_risk:.0%} in pen {det.pen_id} (posture: {det.sow_posture})",
            pen_id=pen_id_int,
            detection_data=json.dumps({
                "piglet_count": det.piglet_count,
                "sow_posture": det.sow_posture,
                "crushing_risk": det.crushing_risk,
            }),
        )

    ws_message = {
        "type": "detection",
        "pen_id": det.pen_id,
        "data": {
            "piglet_count": det.piglet_count,
            "posture": det.sow_posture,
            "risk_level": det.crushing_risk,
            "bboxes": [b.model_dump() for b in det.bounding_boxes],
            "timestamp": det.timestamp,
            "processing_time_ms": det.processing_time_ms,
            "source": "edge_device",
        },
    }

    return detection, event, alert, ws_message, det.pen_id


def _build_ws_message(det: DetectionPush) -> Tuple[dict, str]:
    ws_message = {
        "type": "detection",
        "pen_id": det.pen_id,
        "data": {
            "piglet_count": det.piglet_count,
            "posture": det.sow_posture,
            "risk_level": det.crushing_risk,
            "bboxes": [b.model_dump() for b in det.bounding_boxes],
            "timestamp": det.timestamp,
            "processing_time_ms": det.processing_time_ms,
            "source": "edge_device",
        },
    }
    return ws_message, det.pen_id


async def _insert_detection_legacy(db: AsyncSession, det: DetectionPush, pen_id_int: int) -> None:
    ts = datetime.fromisoformat(det.timestamp.replace("Z", "+00:00"))
    await db.execute(
        text(
            """
            INSERT INTO detections (
                pen_id,
                piglet_count,
                sow_posture,
                crushing_risk,
                bounding_boxes,
                confidence_scores,
                frame_timestamp,
                processing_time_ms
            ) VALUES (
                :pen_id,
                :piglet_count,
                :sow_posture,
                :crushing_risk,
                :bounding_boxes,
                :confidence_scores,
                :frame_timestamp,
                :processing_time_ms
            )
            """
        ),
        {
            "pen_id": pen_id_int,
            "piglet_count": det.piglet_count,
            "sow_posture": det.sow_posture,
            "crushing_risk": det.crushing_risk,
            "bounding_boxes": json.dumps([b.model_dump() for b in det.bounding_boxes]),
            "confidence_scores": json.dumps([b.confidence for b in det.bounding_boxes]),
            "frame_timestamp": ts,
            "processing_time_ms": det.processing_time_ms,
        },
    )


async def _broadcast_detection(message: dict, pen_id: str):
    """Broadcast a detection message to websocket clients."""
    try:
        from app.api.websocket import ws_manager

        await ws_manager.broadcast(message, pen_id)
    except Exception as exc:
        logger.debug("WebSocket broadcast skipped: %s", exc)
from app.models.pig import RecordingSchedule, RecordingClip, StorageStatus, Pen
from app.schemas.recording import RecordingClipPruneRequest, RecordingClipReport, StorageStatusReport
import json

VALID_REC_MODES = {"off", "detection", "continuous"}
DEFAULT_SCHEDULE = ["off"] * 168


def _normalize_schedule(raw_schedule) -> List[str]:
    normalized = DEFAULT_SCHEDULE.copy()

    if not isinstance(raw_schedule, list):
        return normalized

    if len(raw_schedule) == 168 and all(isinstance(x, str) for x in raw_schedule):
        out: List[str] = []
        for mode in raw_schedule:
            m = (mode or "off").strip().lower()
            out.append(m if m in VALID_REC_MODES else "off")
        return out

    if raw_schedule and all(isinstance(x, dict) for x in raw_schedule):
        for slot in raw_schedule:
            day = slot.get("day")
            hour = slot.get("hour")
            mode = (slot.get("mode") or "off").strip().lower()
            if isinstance(day, int) and isinstance(hour, int) and 0 <= day <= 6 and 0 <= hour <= 23:
                idx = day * 24 + hour
                normalized[idx] = mode if mode in VALID_REC_MODES else "off"
        return normalized

    if raw_schedule and all(isinstance(x, str) for x in raw_schedule):
        for idx, mode in enumerate(raw_schedule[:168]):
            m = (mode or "off").strip().lower()
            normalized[idx] = m if m in VALID_REC_MODES else "off"

    return normalized

@router.get("/recording-schedule", dependencies=[Depends(verify_edge_key)])
async def get_recording_schedule(db: AsyncSession = Depends(get_db)):
    """Get recording schedules for all pens"""
    result = await db.execute(select(RecordingSchedule).execution_options(ignore_tenant=True))
    schedules = result.scalars().all()
    
    result_pens = await db.execute(select(Pen).where(Pen.is_active == True).execution_options(ignore_tenant=True))
    pens = result_pens.scalars().all()
    
    pen_schedules = {s.pen_id: _normalize_schedule(s.schedule_json) for s in schedules}
    
    output = []
    for pen in pens:
        output.append({
            "pen_id": pen.id,
            "schedule": pen_schedules.get(pen.id, DEFAULT_SCHEDULE.copy())
        })
        
    return output

@router.post("/recordings")
async def register_recording(
    clip: RecordingClipReport,
    x_edge_key: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Register a completed video clip"""
    if not settings.EDGE_API_KEY or x_edge_key != settings.EDGE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge key")

    pen_result = await db.execute(
        select(Pen).where(Pen.id == clip.pen_id).execution_options(ignore_tenant=True)
    )
    pen = pen_result.scalar_one_or_none()
    if pen and pen.owner_id is not None:
        db.info["tenant_id"] = pen.owner_id

    new_clip = RecordingClip(
        pen_id=clip.pen_id,
        file_path=clip.file_path,
        start_time=clip.start_time,
        end_time=clip.end_time,
        mode=clip.mode if clip.mode in VALID_REC_MODES else "detection",
        file_size_bytes=clip.file_size_bytes,
        storage_path=clip.storage_path,
        edge_device_id=x_edge_key
    )
    db.add(new_clip)
    await db.commit()
    return {"status": "ok", "id": new_clip.id}


@router.post("/recording-clip")
async def register_recording_alias(
    clip: RecordingClipReport,
    x_edge_key: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Alias endpoint used by some edge builds."""
    return await register_recording(clip=clip, x_edge_key=x_edge_key, db=db)


@router.post("/recordings/prune")
async def prune_recording_metadata(
    payload: RecordingClipPruneRequest,
    x_edge_key: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Delete stale recording metadata rows for files removed by edge loop-recording."""
    if not settings.EDGE_API_KEY or x_edge_key != settings.EDGE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge key")

    file_paths = [p for p in payload.file_paths if isinstance(p, str) and p.strip()]
    if not file_paths:
        return {"status": "ok", "deleted": 0}

    stmt = delete(RecordingClip).where(RecordingClip.file_path.in_(file_paths))
    if payload.pen_id is not None:
        stmt = stmt.where(RecordingClip.pen_id == payload.pen_id)

    result = await db.execute(stmt.execution_options(ignore_tenant=True))
    await db.commit()
    return {"status": "ok", "deleted": int(result.rowcount or 0)}

@router.post("/storage-status")
async def report_storage_status(
    status: StorageStatusReport,
    x_edge_key: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Update storage status for the edge agent/pen"""
    if not settings.EDGE_API_KEY or x_edge_key != settings.EDGE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid edge key")

    if status.pen_id is not None:
        pen_result = await db.execute(
            select(Pen).where(Pen.id == status.pen_id).execution_options(ignore_tenant=True)
        )
        pen = pen_result.scalar_one_or_none()
        if pen and pen.owner_id is not None:
            db.info["tenant_id"] = pen.owner_id

    new_status = StorageStatus(
        pen_id=status.pen_id,
        storage_path=status.storage_path,
        total_bytes=status.total_bytes,
        free_bytes=status.free_bytes
    )
    db.add(new_status)
    await db.commit()
    return {"status": "ok"}
