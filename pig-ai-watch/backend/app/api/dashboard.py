from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Sow, Alert, Pen, Detection
from app.schemas.pig import DashboardStats, PenStatus
from typing import List

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
    
    # Total piglets (sum of current_litter_size for all non-archived sows)
    result = await db.execute(
        select(func.sum(Sow.current_litter_size)).where(Sow.is_archived == False)
    )
    total_piglets = result.scalar() or 0
    
    # Active alerts
    result = await db.execute(
        select(func.count(Alert.id)).where(Alert.is_resolved == False)
    )
    active_alerts = result.scalar() or 0
    
    # Active pens
    result = await db.execute(
        select(func.count(Pen.id)).where(Pen.is_active == True)
    )
    pens_monitored = result.scalar() or 0
    
    return DashboardStats(
        total_sows=total_sows,
        total_piglets=total_piglets,
        active_alerts=active_alerts,
        pens_monitored=pens_monitored
    )


@router.get("/pen-status", response_model=List[PenStatus])
async def get_pen_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current status of all active pens with recent detections (last 5 minutes)."""
    # Calculate threshold for recent detections (5 minutes ago)
    recent_threshold = datetime.utcnow() - timedelta(minutes=5)

    latest_detection_sq = (
        select(
            Detection.pen_id.label("pen_id"),
            Detection.piglet_count.label("piglet_count"),
            Detection.sow_posture.label("sow_posture"),
            Detection.crushing_risk.label("crushing_risk"),
            Detection.created_at.label("created_at"),
            func.row_number().over(
                partition_by=Detection.pen_id,
                order_by=Detection.created_at.desc(),
            ).label("rn"),
        )
        .where(Detection.created_at >= recent_threshold)  # Only recent detections
    ).subquery()

    active_sow_sq = (
        select(
            Sow.pen_id.label("pen_id"),
            Sow.tag_id.label("tag_id"),
            func.row_number().over(
                partition_by=Sow.pen_id,
                order_by=Sow.created_at.desc(),
            ).label("rn"),
        )
        .where(Sow.is_archived == False)
    ).subquery()

    result = await db.execute(
        select(
            Pen.id,
            Pen.name,
            Pen.camera_source,
            active_sow_sq.c.tag_id,
            latest_detection_sq.c.piglet_count,
            latest_detection_sq.c.sow_posture,
            latest_detection_sq.c.crushing_risk,
            latest_detection_sq.c.created_at,
        )
        .select_from(Pen)
        .outerjoin(
            active_sow_sq,
            and_(active_sow_sq.c.pen_id == Pen.id, active_sow_sq.c.rn == 1),
        )
        .join(  # Changed to inner join - only include pens with recent detections
            latest_detection_sq,
            and_(latest_detection_sq.c.pen_id == Pen.id, latest_detection_sq.c.rn == 1),
        )
        .where(Pen.is_active == True)
        .order_by(Pen.id.asc())
    )

    rows = result.all()
    return [
        PenStatus(
            pen_id=row.id,
            pen_name=row.name,
            sow_tag=row.tag_id,
            piglet_count=row.piglet_count,
            sow_posture=row.sow_posture,
            crushing_risk=row.crushing_risk,
            last_updated=row.created_at,
            is_streaming=True,  # If in this list, it has recent detections
        )
        for row in rows
    ]
