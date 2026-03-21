from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from app.services.llm_advisor import generate_pen_advisory, generate_daily_digest, generate_push_notification, generate_task_push_notification

router = APIRouter()

@router.post("/pen-advisory", response_model=Dict[str, Any])
async def get_pen_advisory(payload: Dict[str, Any]):
    """
    Generates a veterinary advisory based on pen telemetry data.
    """
    try:
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
