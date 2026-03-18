from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Alert
from app.schemas.pig import AlertCreate, AlertUpdate, AlertResponse

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertResponse])
async def get_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    type: Optional[str] = None,
    severity: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_resolved: Optional[bool] = None,
    pen_id: Optional[int] = None,
    sow_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all alerts with filters."""
    query = select(Alert)
    
    conditions = []
    if type:
        conditions.append(Alert.type == type)
    if severity:
        conditions.append(Alert.severity == severity)
    if is_read is not None:
        conditions.append(Alert.is_read == is_read)
    if is_resolved is not None:
        conditions.append(Alert.is_resolved == is_resolved)
    if pen_id:
        conditions.append(Alert.pen_id == pen_id)
    if sow_id:
        conditions.append(Alert.sow_id == sow_id)
    if start_date:
        conditions.append(Alert.created_at >= start_date)
    if end_date:
        conditions.append(Alert.created_at <= end_date)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.offset(skip).limit(limit).order_by(Alert.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_alert_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get alert statistics."""
    # Total unread alerts
    result = await db.execute(
        select(func.count(Alert.id)).where(Alert.is_read == False)
    )
    unread_count = result.scalar()
    
    # Unresolved by severity
    severities = ["critical", "high", "medium", "low"]
    severity_counts = {}
    for severity in severities:
        result = await db.execute(
            select(func.count(Alert.id)).where(
                and_(Alert.severity == severity, Alert.is_resolved == False)
            )
        )
        severity_counts[severity] = result.scalar()
    
    return {
        "unread_count": unread_count,
        "unresolved_by_severity": severity_counts,
        "total_unresolved": sum(severity_counts.values())
    }


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific alert by ID."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    return alert


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    alert_data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new alert."""
    new_alert = Alert(**alert_data.model_dump())
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)
    
    return new_alert


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    alert_data: AlertUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update alert status (mark as read/resolved)."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    update_data = alert_data.model_dump(exclude_unset=True)
    
    if update_data.get("is_resolved"):
        update_data["resolved_at"] = datetime.utcnow()
        update_data["resolved_by"] = current_user.id
    
    for field, value in update_data.items():
        setattr(alert, field, value)
    
    await db.commit()
    await db.refresh(alert)
    
    return alert


@router.post("/mark-all-read")
async def mark_all_alerts_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all alerts as read."""
    result = await db.execute(
        select(Alert).where(Alert.is_read == False)
    )
    alerts = result.scalars().all()
    
    for alert in alerts:
        alert.is_read = True
    
    await db.commit()
    
    return {"message": f"Marked {len(alerts)} alerts as read"}
