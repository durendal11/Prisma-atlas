from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import RecordingSchedule, RecordingClip, StorageStatus, Pen
from app.schemas.recording import RecordingScheduleUpdate
from app.api.websocket import ws_manager

router = APIRouter(
    prefix="/api/recording",
    tags=["Recording"],
    dependencies=[Depends(get_current_user)]
)

VALID_REC_MODES = {"off", "detection", "continuous"}
DEFAULT_SCHEDULE = ["off"] * 168


def _normalize_schedule(raw_schedule) -> List[str]:
    """Normalize schedule payloads to a strict 168-slot [Sun..Sat x 24h] mode list."""
    normalized = DEFAULT_SCHEDULE.copy()

    if not isinstance(raw_schedule, list):
        return normalized

    # Preferred format: flat 168 list of mode strings.
    if len(raw_schedule) == 168 and all(isinstance(x, str) for x in raw_schedule):
        out: List[str] = []
        for mode in raw_schedule:
            m = (mode or "off").strip().lower()
            out.append(m if m in VALID_REC_MODES else "off")
        return out

    # Legacy sparse format: [{day, hour, mode}, ...]
    if raw_schedule and all(isinstance(x, dict) for x in raw_schedule):
        for slot in raw_schedule:
            day = slot.get("day")
            hour = slot.get("hour")
            mode = (slot.get("mode") or "off").strip().lower()
            if isinstance(day, int) and isinstance(hour, int) and 0 <= day <= 6 and 0 <= hour <= 23:
                idx = day * 24 + hour
                normalized[idx] = mode if mode in VALID_REC_MODES else "off"
        return normalized

    # Partial flat format fallback.
    if raw_schedule and all(isinstance(x, str) for x in raw_schedule):
        for idx, mode in enumerate(raw_schedule[:168]):
            m = (mode or "off").strip().lower()
            normalized[idx] = m if m in VALID_REC_MODES else "off"

    return normalized

@router.get("/schedules/{pen_id}")
async def get_recording_schedule(pen_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecordingSchedule).where(RecordingSchedule.pen_id == pen_id))
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        return {"pen_id": pen_id, "schedule": DEFAULT_SCHEDULE.copy()}
        
    return {"pen_id": pen_id, "schedule": _normalize_schedule(schedule.schedule_json)}

@router.put("/schedules/{pen_id}")
async def update_recording_schedule(
    pen_id: int, 
    data: RecordingScheduleUpdate, 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(RecordingSchedule).where(RecordingSchedule.pen_id == pen_id))
    schedule = result.scalar_one_or_none()
    
    schedule_data = _normalize_schedule(data.schedule)
    
    if schedule:
        schedule.schedule_json = schedule_data
        schedule.updated_at = datetime.utcnow()
    else:
        new_schedule = RecordingSchedule(pen_id=pen_id, schedule_json=schedule_data)
        db.add(new_schedule)
        
    await db.commit()
    
    await ws_manager.broadcast({
        "type": "schedule_updated",
        "pen_id": pen_id
    })
    
    return {"status": "ok", "schedule": schedule_data}

@router.get("/clips/{pen_id}")
async def get_recording_clips(
    pen_id: int,
    start_date: str = None,
    end_date: str = None,
    mode: str = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure pen belongs to current user before reading unscoped clip rows.
    pen_result = await db.execute(
        select(Pen).where(Pen.id == pen_id).execution_options(ignore_tenant=True)
    )
    pen = pen_result.scalar_one_or_none()
    if not pen or pen.owner_id not in (None, current_user.id):
        raise HTTPException(status_code=404, detail="Pen not found")

    # Backfill legacy unowned rows so tenant-scoped APIs can see edge-reported clips/storage.
    await db.execute(
        update(RecordingClip)
        .where(RecordingClip.pen_id == pen_id, RecordingClip.owner_id.is_(None))
        .values(owner_id=current_user.id)
        .execution_options(ignore_tenant=True)
    )
    await db.execute(
        update(StorageStatus)
        .where(StorageStatus.pen_id == pen_id, StorageStatus.owner_id.is_(None))
        .values(owner_id=current_user.id)
        .execution_options(ignore_tenant=True)
    )
    await db.execute(
        update(RecordingSchedule)
        .where(RecordingSchedule.pen_id == pen_id, RecordingSchedule.owner_id.is_(None))
        .values(owner_id=current_user.id)
        .execution_options(ignore_tenant=True)
    )
    if pen.owner_id is None:
        pen.owner_id = current_user.id
    await db.commit()

    query = select(RecordingClip).where(RecordingClip.pen_id == pen_id).execution_options(ignore_tenant=True)
    
    if start_date:
        query = query.where(RecordingClip.start_time >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(RecordingClip.start_time <= datetime.fromisoformat(end_date))
    if mode:
        query = query.where(RecordingClip.mode == mode)
        
    query = query.order_by(RecordingClip.start_time.desc()).limit(limit)
    
    result = await db.execute(query)
    clips = result.scalars().all()
    
    return [
        {
            "id": clip.id,
            "start_time": clip.start_time.isoformat() if clip.start_time else None,
            "end_time": clip.end_time.isoformat() if clip.end_time else None,
            "mode": clip.mode,
            "file_size_bytes": clip.file_size_bytes,
            "storage_path": clip.storage_path,
            "file_path": clip.file_path,
            "duration_seconds": (clip.end_time - clip.start_time).total_seconds() if clip.start_time and clip.end_time else 0
        }
        for clip in clips
    ]

@router.get("/download/{clip_id}")
async def download_recording(clip_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecordingClip).where(RecordingClip.id == clip_id))
    clip = result.scalar_one_or_none()
    
    if not clip or not clip.file_path:
        raise HTTPException(status_code=404, detail="Clip not found")
        
    if not os.path.exists(clip.file_path):
        raise HTTPException(status_code=404, detail="Video file not found on edge device storage")
        
    return FileResponse(
        path=clip.file_path, 
        media_type='video/mp4', 
        filename=os.path.basename(clip.file_path)
    )

@router.get("/storage")
async def get_all_storage_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Claim legacy unowned storage rows for the current user's pens.
    user_pens_result = await db.execute(
        select(Pen.id)
        .where(Pen.owner_id == current_user.id)
        .execution_options(ignore_tenant=True)
    )
    user_pen_ids = [row[0] for row in user_pens_result.all()]

    if user_pen_ids:
        await db.execute(
            update(StorageStatus)
            .where(StorageStatus.pen_id.in_(user_pen_ids), StorageStatus.owner_id.is_(None))
            .values(owner_id=current_user.id)
            .execution_options(ignore_tenant=True)
        )
        await db.commit()

    if not user_pen_ids:
        return []

    # get latest status per pen
    result = await db.execute(
        select(StorageStatus)
        .where(StorageStatus.pen_id.in_(user_pen_ids))
        .order_by(StorageStatus.reported_at.desc())
        .execution_options(ignore_tenant=True)
    )
    all_status = result.scalars().all()
    
    # deduplicate by pen_id
    seen = set()
    latest = []
    for s in all_status:
        if s.pen_id not in seen:
            seen.add(s.pen_id)
            latest.append({
                "pen_id": s.pen_id,
                "storage_path": s.storage_path,
                "total_bytes": s.total_bytes,
                "free_bytes": s.free_bytes,
                "reported_at": s.reported_at.isoformat() if s.reported_at else None
            })
            
    return latest
