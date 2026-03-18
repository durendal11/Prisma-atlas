from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Sow, Alert, Pen, Detection
from app.schemas.pig import DashboardStats, PenStatus
from typing import List
from datetime import datetime

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get dashboard statistics."""
    # Total sows
    result = await db.execute(select(func.count(Sow.id)).where(Sow.is_archived == False))
    total_sows = result.scalar() or 0
    
    # Lactating sows (was: nursing)
    result = await db.execute(
        select(func.count(Sow.id)).where(
            (Sow.status == "lactating") & (Sow.is_archived == False)
        )
    )
    lactating_sows = result.scalar() or 0
    
    # Total piglets (sum of current_litter_size for lactating sows)
    result = await db.execute(
        select(func.sum(Sow.current_litter_size)).where(
            (Sow.status == "lactating") & (Sow.is_archived == False)
        )
    )
    total_piglets = result.scalar() or 0
    
    # Active alerts
    result = await db.execute(
        select(func.count(Alert.id)).where(Alert.is_resolved == False)
    )
    active_alerts = result.scalar() or 0
    
    # Critical alerts
    result = await db.execute(
        select(func.count(Alert.id)).where(
            (Alert.is_resolved == False) & (Alert.severity == "critical")
        )
    )
    critical_alerts = result.scalar() or 0
    
    # Active pens
    result = await db.execute(
        select(func.count(Pen.id)).where(Pen.is_active == True)
    )
    pens_monitored = result.scalar() or 0
    
    return DashboardStats(
        total_sows=total_sows,
        lactating_sows=lactating_sows,
        total_piglets=total_piglets,
        active_alerts=active_alerts,
        critical_alerts=critical_alerts,
        pens_monitored=pens_monitored
    )


@router.get("/pen-status", response_model=List[PenStatus])
async def get_pen_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current status of all active pens."""
    result = await db.execute(
        select(Pen).where(Pen.is_active == True)
    )
    pens = result.scalars().all()
    
    pen_statuses = []
    for pen in pens:
        # Get the first sow in this pen (there may be multiple)
        sow_result = await db.execute(
            select(Sow).where(
                (Sow.pen_id == pen.id) & (Sow.is_archived == False)
            ).limit(1)
        )
        sow = sow_result.scalar_one_or_none()
        
        # Get latest detection for this pen
        detection_result = await db.execute(
            select(Detection)
            .where(Detection.pen_id == pen.id)
            .order_by(Detection.created_at.desc())
            .limit(1)
        )
        detection = detection_result.scalar_one_or_none()
        
        pen_statuses.append(PenStatus(
            pen_id=pen.id,
            pen_name=pen.name,
            sow_tag=sow.tag_id if sow else None,
            piglet_count=detection.piglet_count if detection else 0,
            sow_posture=detection.sow_posture if detection else "unknown",
            crushing_risk=detection.crushing_risk if detection else 0.0,
            last_updated=detection.created_at if detection else datetime.utcnow(),
            is_streaming=pen.camera_source is not None
        ))
    
    return pen_statuses
