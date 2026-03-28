from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import RecordingSchedule, RecordingClip, StorageStatus
from app.schemas.recording import RecordingScheduleUpdate
from app.api.websocket import ws_manager

router = APIRouter(
    prefix="/api/recording",
    tags=["Recording"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/schedules/{pen_id}")
async def get_recording_schedule(pen_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RecordingSchedule).where(RecordingSchedule.pen_id == pen_id))
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        return {"pen_id": pen_id, "schedule": []}
        
    return {"pen_id": pen_id, "schedule": schedule.schedule_json}

@router.put("/schedules/{pen_id}")
async def update_recording_schedule(
    pen_id: int, 
    data: RecordingScheduleUpdate, 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(RecordingSchedule).where(RecordingSchedule.pen_id == pen_id))
    schedule = result.scalar_one_or_none()
    
    schedule_data = data.schedule
    
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
    
    return {"status": "ok"}

@router.get("/clips/{pen_id}")
async def get_recording_clips(
    pen_id: int,
    start_date: str = None,
    end_date: str = None,
    mode: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(RecordingClip).where(RecordingClip.pen_id == pen_id)
    
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
async def download_recording(clip_id: int, db: AsyncSession = Depends(get_db)):
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
async def get_all_storage_status(db: AsyncSession = Depends(get_db)):
    # get latest status per pen
    result = await db.execute(
        select(StorageStatus).order_by(StorageStatus.reported_at.desc())
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
