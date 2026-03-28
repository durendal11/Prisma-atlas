from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import Sow, Pen, BehaviorLog
from app.schemas.pig import SowCreate, SowUpdate, SowResponse
from app.services.delayed_farrowing_checker import run_checker

router = APIRouter(prefix="/api/sows", tags=["Sows"])


@router.get("", response_model=List[SowResponse])
async def get_sows(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    pen_id: Optional[int] = None,
    search: Optional[str] = None,
    archived: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all sows with optional filters."""
    query = select(Sow).where(Sow.is_archived == archived)
    
    if status:
        query = query.where(Sow.status == status)
    if pen_id:
        query = query.where(Sow.pen_id == pen_id)
    if search:
        query = query.where(
            (Sow.tag_id.ilike(f"%{search}%")) | 
            (Sow.name.ilike(f"%{search}%"))
        )
    
    query = query.offset(skip).limit(limit).order_by(Sow.created_at.desc())
    result = await db.execute(query)
    # We return 0 and None for the behavior stats to avoid a massive slow JOIN on the entire logs table
    return [
        serialize_sow_response(sow, 0, None)
        for sow in result.scalars().all()
    ]


@router.get("/{sow_id}", response_model=SowResponse)
async def get_sow(
    sow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific sow by ID."""
    sow = await get_sow_by_id(db, sow_id)
    
    if not sow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sow not found"
        )

    behavior_result = await db.execute(
        select(
            func.count(BehaviorLog.id),
            func.max(BehaviorLog.logged_at),
        ).where(
            and_(
                BehaviorLog.sow_id == sow.id,
                BehaviorLog.is_archived == sow.is_archived,
            )
        )
    )
    detection_logs_count, last_detection_at = behavior_result.one()

    return serialize_sow_response(sow, detection_logs_count or 0, last_detection_at)


@router.post("", response_model=SowResponse, status_code=status.HTTP_201_CREATED)
async def create_sow(
    sow_data: SowCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new sow profile."""
    # Check for duplicate tag_id
    result = await db.execute(select(Sow).where(Sow.tag_id == sow_data.tag_id))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sow with this tag ID already exists"
        )
    
    # Validate pen_id if provided
    if sow_data.pen_id:
        result = await db.execute(select(Pen).where(Pen.id == sow_data.pen_id))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pen not found"
            )
    
    new_sow = Sow(**sow_data.model_dump())
    db.add(new_sow)
    await db.commit()
    await db.refresh(new_sow)
    
    if new_sow.expected_farrowing_date:
        background_tasks.add_task(run_checker)
    
    return new_sow


@router.put("/{sow_id}", response_model=SowResponse)
async def update_sow(
    sow_id: int,
    sow_data: SowUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a sow profile."""
    sow = await get_sow_by_id(db, sow_id)
    
    if not sow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sow not found"
        )
    
    update_data = sow_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sow, field, value)
    
    await db.commit()
    await db.refresh(sow)
    
    if "expected_farrowing_date" in update_data or "status" in update_data:
        background_tasks.add_task(run_checker)
    
    return sow


@router.delete("/{sow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sow(
    sow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a sow profile."""
    sow = await get_sow_by_id(db, sow_id)
    
    if not sow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sow not found"
        )
    
    await db.delete(sow)
    await db.commit()


@router.post("/{sow_id}/archive", response_model=SowResponse)
async def archive_sow(
    sow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Archive a sow profile and its sow-linked detection logs."""
    sow = await get_sow_by_id(db, sow_id)

    if not sow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sow not found"
        )

    if sow.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sow is already archived"
        )

    archived_at = datetime.utcnow()
    sow.is_archived = True
    sow.archived_at = archived_at

    behavior_logs_result = await db.execute(
        select(BehaviorLog).where(BehaviorLog.sow_id == sow.id)
    )
    behavior_logs = behavior_logs_result.scalars().all()
    for log in behavior_logs:
        log.is_archived = True
        log.archived_at = archived_at

    await db.commit()
    await db.refresh(sow)

    return serialize_sow_response(sow, len(behavior_logs), max((log.logged_at for log in behavior_logs), default=None))


@router.post("/{sow_id}/restore", response_model=SowResponse)
async def restore_sow(
    sow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore an archived sow profile and its sow-linked detection logs."""
    sow = await get_sow_by_id(db, sow_id)

    if not sow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sow not found"
        )

    if not sow.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sow is not archived"
        )

    sow.is_archived = False
    sow.archived_at = None

    behavior_logs_result = await db.execute(
        select(BehaviorLog).where(BehaviorLog.sow_id == sow.id)
    )
    behavior_logs = behavior_logs_result.scalars().all()
    for log in behavior_logs:
        log.is_archived = False
        log.archived_at = None

    await db.commit()
    await db.refresh(sow)

    return serialize_sow_response(sow, len(behavior_logs), max((log.logged_at for log in behavior_logs), default=None))


async def get_sow_by_id(db: AsyncSession, sow_id: int) -> Optional[Sow]:
    result = await db.execute(select(Sow).where(Sow.id == sow_id))
    return result.scalar_one_or_none()


def serialize_sow_response(
    sow: Sow,
    detection_logs_count: int = 0,
    last_detection_at=None,
):
    payload = SowResponse.model_validate(sow).model_dump()
    payload["detection_logs_count"] = int(detection_logs_count or 0)
    payload["last_detection_at"] = last_detection_at
    return payload
