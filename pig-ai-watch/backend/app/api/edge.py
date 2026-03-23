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
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
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


class ModelVersion(BaseModel):
    filename: str
    md5: str


# ── POST /detections ─────────────────────────────────────────────────────────

@router.post("/detections", dependencies=[Depends(verify_edge_key)])
async def push_detection(body: DetectionPush, db: AsyncSession = Depends(get_db)):
    """Receive a single detection from the edge device."""
    try:
        detection, event, alert, message, pen_id = _build_detection_payload(body)
        db.add(detection)
        db.add(event)
        if alert is not None:
            db.add(alert)

        await db.commit()
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
        logger.exception("Edge detection database error")
        raise HTTPException(status_code=500, detail="Database error while storing detection")


# ── POST /detections/batch ───────────────────────────────────────────────────

@router.post("/detections/batch", dependencies=[Depends(verify_edge_key)])
async def push_detection_batch(body: DetectionBatch, db: AsyncSession = Depends(get_db)):
    """Receive a batch of buffered detections (offline sync)."""
    # Before: 1 transaction per detection in the loop.
    # After: 1 transaction for the entire batch.
    stored = 0
    pending_messages: List[Tuple[dict, str]] = []

    for det in body.detections:
        try:
            detection, event, alert, message, pen_id = _build_detection_payload(det)
            db.add(detection)
            db.add(event)
            if alert is not None:
                db.add(alert)
            pending_messages.append((message, pen_id))
            stored += 1
        except Exception as exc:
            logger.warning("Skipping duplicate/bad detection: %s", exc)

    if stored:
        try:
            await db.commit()
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
            camera_url=p.camera_source,
            thresholds={"crushing_risk": settings.CRUSHING_RISK_THRESHOLD},
        )
        for p in pens
    ]
    return ConfigResponse(cameras=cameras)


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


def _build_detection_payload(det: DetectionPush) -> Tuple[Detection, Event, Optional[Alert], dict, str]:
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
    if det.crushing_risk >= settings.CRUSHING_RISK_THRESHOLD:
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


async def _broadcast_detection(message: dict, pen_id: str):
    """Broadcast a detection message to websocket clients."""
    try:
        from app.api.websocket import ws_manager

        await ws_manager.broadcast(message, pen_id)
    except Exception as exc:
        logger.debug("WebSocket broadcast skipped: %s", exc)
