from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.pig import Sow
from app.services.llm_advisor import generate_pen_advisory, generate_daily_digest, generate_push_notification, generate_task_push_notification

router = APIRouter()

@router.post("/pen-advisory", response_model=Dict[str, Any])
async def get_pen_advisory(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Generates a veterinary advisory based on pen telemetry data.
    """
    try:
        pen_id_raw = payload.get("pen_id")
        pen_id = int(pen_id_raw) if str(pen_id_raw).isdigit() else None

        if pen_id is not None:
            sow_result = await db.execute(
                select(Sow)
                .where(Sow.pen_id == pen_id, Sow.is_archived == False)
                .order_by(Sow.updated_at.desc().nullslast(), Sow.created_at.desc())
                .limit(1)
            )
            sow = sow_result.scalar_one_or_none()
            if sow and sow.expected_farrowing_date:
                now = datetime.utcnow()
                delta = sow.expected_farrowing_date - now
                hours_until = max(0.0, delta.total_seconds() / 3600)
                days_until = max(0, int(hours_until // 24))

                if hours_until <= 24:
                    farrowing_window = "within_24h"
                elif hours_until <= 72:
                    farrowing_window = "within_3d"
                elif hours_until <= 168:
                    farrowing_window = "within_7d"
                else:
                    farrowing_window = "beyond_7d"

                payload["farrowing_due_context"] = {
                    "sow_id": sow.id,
                    "sow_tag": sow.tag_id,
                    "expected_farrowing_date": sow.expected_farrowing_date.isoformat(),
                    "hours_until": round(hours_until, 1),
                    "days_until": days_until,
                    "farrowing_window": farrowing_window,
                }

                payload["study_hints"] = [
                    "Oliviero et al. 2010 (Livestock Science): increased posture transitions and nest-building precede farrowing.",
                    "Jensen 1993 (Applied Animal Behaviour Science): nesting behavior commonly rises 12-24h pre-farrowing.",
                    "Merck Veterinary Manual: monitor closely when inter-piglet interval exceeds 45 minutes during active farrowing.",
                ]

        advisory = generate_pen_advisory(payload)
        if "error" in advisory and "LLM not configured" in advisory["error"]:
            raise HTTPException(status_code=503, detail="AI services are not currently configured.")
        return advisory
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/daily-digest", response_model=Dict[str, str])
async def get_daily_digest(payload: Dict[str, Any]):
    """
    Generates a daily farm digest based on performance analytics.
    Returns markdown text.
    """
    try:
        digest_markdown = generate_daily_digest(payload)
        return {"markdown": digest_markdown}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/format-push-notification", response_model=Dict[str, Any])
async def get_push_notification_copy(payload: Dict[str, Any]):
    """
    Converts raw system alert JSON into structured push notification copy.
    """
    try:
        push_data = generate_push_notification(payload)
        return push_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/task-push-notification", response_model=Dict[str, Any])
async def get_task_push_notification(payload: Dict[str, Any]):
    """
    Format unfinished/recommended tasks into a brief push notification.
    """
    try:
        push_data = generate_task_push_notification(payload)
        return push_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
