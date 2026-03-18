from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Event
from app.schemas.pig import EventCreate, EventResponse

router = APIRouter(prefix="/api/events", tags=["Events"])


@router.get("", response_model=List[EventResponse])
async def get_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    type: Optional[str] = None,
    category: Optional[str] = None,
    pen_id: Optional[int] = None,
    sow_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get event logs with pagination and filters."""
    query = select(Event)
    
    conditions = []
    if type:
        conditions.append(Event.type == type)
    if category:
        conditions.append(Event.category == category)
    if pen_id:
        conditions.append(Event.pen_id == pen_id)
    if sow_id:
        conditions.append(Event.sow_id == sow_id)
    if start_date:
        conditions.append(Event.created_at >= start_date)
    if end_date:
        conditions.append(Event.created_at <= end_date)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.offset(skip).limit(limit).order_by(Event.created_at.desc())
    result = await db.execute(query)
    
    return result.scalars().all()


@router.post("", response_model=EventResponse)
async def create_event(
    event_data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new event log entry."""
    new_event = Event(
        **event_data.model_dump(),
        user_id=current_user.id
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    
    return new_event


@router.get("/types")
async def get_event_types(
    current_user: User = Depends(get_current_user)
):
    """Get available event types and categories."""
    return {
        "types": [
            "detection",
            "posture_change",
            "farrowing",
            "feeding",
            "health_check",
            "system",
            "manual_entry"
        ],
        "categories": [
            "ai_detection",
            "manual_entry",
            "automated",
            "system"
        ]
    }
