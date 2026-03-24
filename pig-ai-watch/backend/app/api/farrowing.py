"""
Farrowing Management API - Track farrowing events and piglet records
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timedelta
from typing import List, Optional, Any
import json
import logging
import math

from app.core.database import get_db
from app.models.pig import FarrowingRecord, PigletRecord, Sow, Pen, Event, Task, BehaviorLog, Alert
from app.models.user import User
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/farrowing", tags=["farrowing"])


# ============================================================================
# FARROWING RECORDS
# ============================================================================

@router.get("/records")
async def get_farrowing_records(
    sow_id: Optional[int] = Query(None),
    pen_id: Optional[int] = Query(None),
    days_back: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Get farrowing records with optional filters"""
    query = select(FarrowingRecord)
    
    filters = []
    if sow_id:
        filters.append(FarrowingRecord.sow_id == sow_id)
    if pen_id:
        filters.append(FarrowingRecord.pen_id == pen_id)
    
    since = datetime.utcnow() - timedelta(days=days_back)
    filters.append(FarrowingRecord.created_at >= since)
    
    if filters:
        query = query.where(and_(*filters))
    
    query = query.order_by(FarrowingRecord.farrowing_started.desc()).limit(limit)
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    return [farrowing_to_dict(r) for r in records]


@router.get("/records/{record_id}")
async def get_farrowing_record(record_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific farrowing record with piglet details"""
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Farrowing record not found")
    
    # Get piglets
    piglets_result = await db.execute(
        select(PigletRecord).where(PigletRecord.farrowing_record_id == record_id)
    )
    piglets = piglets_result.scalars().all()
    
    record_dict = farrowing_to_dict(record)
    record_dict["piglets"] = [piglet_to_dict(p) for p in piglets]
    
    return record_dict


@router.post("/records")
async def create_farrowing_record(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new farrowing record when farrowing starts.
    This also updates the sow status and creates events.
    """
    # Get sow
    sow_result = await db.execute(select(Sow).where(Sow.id == data["sow_id"]))
    sow = sow_result.scalar_one_or_none()
    
    if not sow:
        raise HTTPException(status_code=404, detail="Sow not found")
    if sow.is_archived:
        raise HTTPException(status_code=400, detail="Archived sows cannot start a farrowing record")
    
    born_alive = data.get("born_alive", 0)
    stillborn = data.get("stillborn", 0)
    total_born = data.get("total_born", born_alive + stillborn)

    record = FarrowingRecord(
        sow_id=data["sow_id"],
        pen_id=data.get("pen_id", sow.pen_id),
        farrowing_started=datetime.fromisoformat(data["farrowing_started"]) if data.get("farrowing_started") else datetime.utcnow(),
        total_born=total_born,
        born_alive=born_alive,
        stillborn=stillborn,
        mummified=data.get("mummified", 0),
        current_litter_size=born_alive,
        attended_by=current_user.id,
        notes=data.get("notes")
    )
    
    db.add(record)
    
    # Update sow status
    sow.status = "farrowing"
    sow.last_farrowing_date = record.farrowing_started
    
    # Create event
    event = Event(
        type="farrowing",
        category="farrowing",
        description=f"Farrowing started for sow {sow.tag_id}",
        sow_id=sow.id,
        pen_id=sow.pen_id,
        user_id=current_user.id
    )
    db.add(event)
    
    await db.commit()
    await db.refresh(record)
    
    logger.info(f"Farrowing record created for sow {sow.tag_id}")
    
    return farrowing_to_dict(record)


@router.put("/records/{record_id}")
async def update_farrowing_record(
    record_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Update farrowing record with birth details"""
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Farrowing record not found")
    
    # Update fields
    update_fields = [
        "farrowing_completed", "duration_minutes", "total_born", "born_alive",
        "stillborn", "mummified", "avg_birth_weight", "cross_fostered_in",
        "cross_fostered_out", "current_litter_size", "sow_condition",
        "intervention_required", "intervention_notes", "notes"
    ]
    
    for field in update_fields:
        if field in data:
            if field == "farrowing_completed" and data[field]:
                setattr(record, field, datetime.fromisoformat(data[field]))
            else:
                setattr(record, field, data[field])
    
    if "piglet_weights" in data:
        record.piglet_weights = json.dumps(data["piglet_weights"])
        if data["piglet_weights"]:
            record.avg_birth_weight = sum(data["piglet_weights"]) / len(data["piglet_weights"])
    
    # Calculate duration if completed
    if record.farrowing_completed and record.farrowing_started:
        duration = record.farrowing_completed - record.farrowing_started
        record.duration_minutes = int(duration.total_seconds() / 60)
    
    await db.commit()
    await db.refresh(record)
    
    return farrowing_to_dict(record)


@router.post("/records/{record_id}/complete")
async def complete_farrowing(
    record_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Complete a farrowing record with final counts.
    Updates sow status to lactating.
    """
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Farrowing record not found")
    
    # Update record
    record.farrowing_completed = datetime.utcnow()
    record.total_born = data.get("total_born", 0)
    record.born_alive = data.get("born_alive", 0)
    record.stillborn = data.get("stillborn", 0)
    record.mummified = data.get("mummified", 0)
    record.current_litter_size = data.get("born_alive", 0)
    record.sow_condition = data.get("sow_condition", "good")
    
    if record.farrowing_started:
        duration = record.farrowing_completed - record.farrowing_started
        record.duration_minutes = int(duration.total_seconds() / 60)
    
    # Update sow
    sow_result = await db.execute(select(Sow).where(Sow.id == record.sow_id))
    sow = sow_result.scalar_one_or_none()
    
    if sow:
        sow.status = "lactating"
        sow.current_litter_size = record.born_alive
        sow.parity = (sow.parity or 0) + 1
    
    # Create completion event
    event = Event(
        type="farrowing_complete",
        category="farrowing",
        description=f"Farrowing completed for sow {sow.tag_id}: {record.born_alive} alive, {record.stillborn} stillborn",
        sow_id=sow.id,
        pen_id=sow.pen_id,
        user_id=current_user.id,
        event_metadata=json.dumps({
            "total_born": record.total_born,
            "born_alive": record.born_alive,
            "stillborn": record.stillborn,
            "duration_minutes": record.duration_minutes
        })
    )
    db.add(event)
    
    await db.commit()
    await db.refresh(record)
    
    logger.info(f"Farrowing completed for sow {sow.tag_id}: {record.born_alive} alive")
    
    return farrowing_to_dict(record)


@router.post("/records/{record_id}/wean")
async def wean_litter(
    record_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark a farrowing litter as weaned.
    Transitions sow status from lactating → weaned.
    Typical weaning age: 21-28 days post-farrowing.
    """
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.id == record_id)
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Farrowing record not found")

    if not record.farrowing_completed:
        raise HTTPException(status_code=400, detail="Farrowing must be completed before weaning")

    # Update sow status
    sow_result = await db.execute(select(Sow).where(Sow.id == record.sow_id))
    sow = sow_result.scalar_one_or_none()

    weaned_count = data.get("weaned_count", record.current_litter_size)
    weaning_notes = data.get("notes", "")

    if sow:
        sow.status = "weaned"
        sow.current_litter_size = 0  # Piglets removed

    # Create weaning event
    event = Event(
        type="weaning",
        category="farrowing",
        description=f"Litter weaned for sow {sow.tag_id if sow else 'unknown'}: {weaned_count} piglets weaned",
        sow_id=record.sow_id,
        pen_id=record.pen_id,
        user_id=current_user.id,
        event_metadata=json.dumps({
            "weaned_count": weaned_count,
            "farrowing_record_id": record_id,
            "notes": weaning_notes,
        })
    )
    db.add(event)

    await db.commit()

    logger.info(f"Litter weaned for sow {sow.tag_id if sow else record.sow_id}: {weaned_count} piglets")

    return {
        "status": "ok",
        "sow_id": record.sow_id,
        "weaned_count": weaned_count,
        "sow_status": "weaned",
    }


# ============================================================================
# PIGLET RECORDS
# ============================================================================

@router.post("/records/{record_id}/piglets")
async def add_piglet(
    record_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Add a piglet to a farrowing record"""
    # Verify record exists
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Farrowing record not found")
    
    piglet = PigletRecord(
        farrowing_record_id=record_id,
        sow_id=record.sow_id,
        ear_tag=data.get("ear_tag"),
        temp_id=data.get("temp_id"),
        birth_order=data.get("birth_order"),
        birth_weight=data.get("birth_weight"),
        birth_time=datetime.fromisoformat(data["birth_time"]) if data.get("birth_time") else datetime.utcnow(),
        status=data.get("status", "alive"),
        current_weight=data.get("birth_weight")
    )
    
    db.add(piglet)
    await db.commit()
    await db.refresh(piglet)
    
    return piglet_to_dict(piglet)


@router.get("/piglets/{piglet_id}")
async def get_piglet(piglet_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific piglet record"""
    result = await db.execute(
        select(PigletRecord).where(PigletRecord.id == piglet_id)
    )
    piglet = result.scalar_one_or_none()
    
    if not piglet:
        raise HTTPException(status_code=404, detail="Piglet not found")
    
    return piglet_to_dict(piglet)


@router.put("/piglets/{piglet_id}")
async def update_piglet(
    piglet_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Update piglet record (processing, health, etc.)"""
    result = await db.execute(
        select(PigletRecord).where(PigletRecord.id == piglet_id)
    )
    piglet = result.scalar_one_or_none()
    
    if not piglet:
        raise HTTPException(status_code=404, detail="Piglet not found")
    
    # Update basic fields
    simple_fields = [
        "ear_tag", "status", "health_score", "health_notes",
        "iron_given", "teeth_clipped", "tail_docked", "castrated"
    ]
    
    for field in simple_fields:
        if field in data:
            setattr(piglet, field, data[field])
    
    # Handle cross-fostering
    if "nurse_sow_id" in data:
        piglet.nurse_sow_id = data["nurse_sow_id"]
    
    # Handle death
    if data.get("status") == "deceased":
        piglet.death_date = datetime.utcnow()
        piglet.death_cause = data.get("death_cause")
    
    # Handle processing date
    if data.get("processed"):
        piglet.processed_date = datetime.utcnow()
    
    # Handle weight update
    if "current_weight" in data:
        piglet.current_weight = data["current_weight"]
        # Add to weight history
        history = json.loads(piglet.weight_history) if piglet.weight_history else []
        history.append({
            "date": datetime.utcnow().isoformat(),
            "weight": data["current_weight"]
        })
        piglet.weight_history = json.dumps(history)
    
    await db.commit()
    await db.refresh(piglet)
    
    return piglet_to_dict(piglet)


@router.post("/piglets/{piglet_id}/cross-foster")
async def cross_foster_piglet(
    piglet_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cross-foster a piglet to another sow"""
    result = await db.execute(
        select(PigletRecord).where(PigletRecord.id == piglet_id)
    )
    piglet = result.scalar_one_or_none()
    
    if not piglet:
        raise HTTPException(status_code=404, detail="Piglet not found")
    
    new_sow_id = data["nurse_sow_id"]
    
    # Verify new sow exists
    sow_result = await db.execute(select(Sow).where(Sow.id == new_sow_id))
    new_sow = sow_result.scalar_one_or_none()
    
    if not new_sow:
        raise HTTPException(status_code=404, detail="Nurse sow not found")
    
    old_sow_id = piglet.nurse_sow_id or piglet.sow_id
    piglet.nurse_sow_id = new_sow_id
    
    # Update farrowing records
    # Decrease count on old sow's record
    old_record_result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.sow_id == old_sow_id)
        .order_by(FarrowingRecord.created_at.desc()).limit(1)
    )
    old_record = old_record_result.scalar_one_or_none()
    if old_record:
        old_record.cross_fostered_out = (old_record.cross_fostered_out or 0) + 1
        old_record.current_litter_size = max(0, (old_record.current_litter_size or 0) - 1)
    
    # Increase count on new sow's record
    new_record_result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.sow_id == new_sow_id)
        .order_by(FarrowingRecord.created_at.desc()).limit(1)
    )
    new_record = new_record_result.scalar_one_or_none()
    if new_record:
        new_record.cross_fostered_in = (new_record.cross_fostered_in or 0) + 1
        new_record.current_litter_size = (new_record.current_litter_size or 0) + 1
    
    # Create event
    event = Event(
        type="cross_foster",
        category="farrowing",
        description=f"Piglet {piglet.ear_tag or piglet.id} cross-fostered to sow {new_sow.tag_id}",
        sow_id=new_sow_id,
        pen_id=new_sow.pen_id,
        user_id=current_user.id
    )
    db.add(event)
    
    await db.commit()
    await db.refresh(piglet)
    
    logger.info(f"Piglet {piglet.id} cross-fostered to sow {new_sow.tag_id}")
    
    return piglet_to_dict(piglet)


# ============================================================================
# STATISTICS & ANALYTICS
# ============================================================================

@router.get("/statistics")
async def get_farrowing_statistics(
    days_back: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db)
):
    """Get farrowing statistics for the dashboard"""
    since = datetime.utcnow() - timedelta(days=days_back)
    
    # Get all farrowing records in period
    result = await db.execute(
        select(FarrowingRecord).where(FarrowingRecord.created_at >= since)
    )
    records = result.scalars().all()
    
    if not records:
        return {
            "period_days": days_back,
            "total_farrowings": 0,
            "avg_born_alive": 0,
            "avg_stillborn": 0,
            "stillborn_rate": 0,
            "avg_litter_size": 0,
            "total_piglets_born": 0,
            "total_alive": 0,
            "total_stillborn": 0
        }
    
    total_born = sum(r.total_born or 0 for r in records)
    total_alive = sum(r.born_alive or 0 for r in records)
    total_stillborn = sum(r.stillborn or 0 for r in records)
    
    return {
        "period_days": days_back,
        "total_farrowings": len(records),
        "avg_born_alive": total_alive / len(records) if records else 0,
        "avg_stillborn": total_stillborn / len(records) if records else 0,
        "stillborn_rate": (total_stillborn / total_born * 100) if total_born > 0 else 0,
        "avg_litter_size": total_born / len(records) if records else 0,
        "total_piglets_born": total_born,
        "total_alive": total_alive,
        "total_stillborn": total_stillborn,
        "interventions_required": sum(1 for r in records if r.intervention_required)
    }


@router.get("/due-sows")
async def get_sows_due_to_farrow(
    days_ahead: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db)
):
    """Get sows due to farrow in the next X days"""
    now = datetime.utcnow()
    future = now + timedelta(days=days_ahead)

    # Evidence-informed behavioral windows used for guidance text:
    # - Nesting/restlessness typically rises within 12-72h pre-farrowing.
    # - Pronounced lying/sleep cycling and occasional leg twitching are most actionable in ~24h window.
    window_hours = {
        "critical": 24,
        "high": 72,
        "watch": 168,
    }

    def classify_window(hours_until: float) -> tuple[str, str, str, str, list[str]]:
        if hours_until <= window_hours["critical"]:
            return (
                "critical",
                "within_24h",
                "Every 2-4 hours",
                "Prepare farrowing support now. Keep the sow under close watch and verify pen readiness.",
                [
                    "Watch for repeated sleep/lying cycles with leg twitching; this can indicate farrowing is very near (~24h).",
                    "Watch for persistent restlessness and nest-building behavior; active nesting often precedes birth within 12-24h.",
                ],
            )
        if hours_until <= window_hours["high"]:
            return (
                "high",
                "within_3d",
                "Every 6-8 hours",
                "Increase monitoring frequency and stage farrowing supplies.",
                [
                    "Watch for restlessness and nesting behavior; these signs commonly intensify in the final 1-3 days.",
                    "Track posture-switch frequency; sharp increases can indicate transition to active pre-farrowing.",
                ],
            )
        if hours_until <= window_hours["watch"]:
            return (
                "watch",
                "within_7d",
                "At least twice daily",
                "Begin pre-farrow monitoring protocol and verify staff handoff plan.",
                [
                    "Start baseline checks for appetite, posture pattern, and activity so final-day changes are easier to spot.",
                    "Confirm crate setup, hygiene, heat source, and emergency contacts before the high-risk window.",
                ],
            )
        return (
            "normal",
            "beyond_7d",
            "Daily",
            "Continue routine pregnancy monitoring.",
            [
                "Maintain normal welfare checks and body condition scoring.",
                "Review expected farrowing date and update schedule if breeding records change.",
            ],
        )
    
    result = await db.execute(
        select(Sow).where(and_(
            Sow.expected_farrowing_date >= now,
            Sow.expected_farrowing_date <= future,
            Sow.status.in_(["pregnant", "active"]),
            Sow.is_archived == False,
        )).order_by(Sow.expected_farrowing_date.asc())
    )
    sows = result.scalars().all()

    existing_due_alert_keys: set[tuple[int, str]] = set()
    if sows:
        sow_ids = [s.id for s in sows]
        lookback = now - timedelta(hours=24)
        existing_result = await db.execute(
            select(Alert.sow_id, Alert.type).where(
                and_(
                    Alert.sow_id.in_(sow_ids),
                    Alert.type.in_(
                        [
                            "farrowing_due_7d",
                            "farrowing_due_3d",
                            "farrowing_due_24h",
                        ]
                    ),
                    Alert.created_at >= lookback,
                )
            )
        )
        existing_due_alert_keys = {
            (row[0], row[1])
            for row in existing_result.all()
            if row[0] is not None and row[1] is not None
        }

    new_due_alerts: list[Alert] = []
    
    sow_list = []
    for sow in sows:
        if not sow.expected_farrowing_date:
            continue

        delta = sow.expected_farrowing_date - now
        hours_until = max(0.0, delta.total_seconds() / 3600)
        days_until = max(0, math.floor(hours_until / 24))
        urgency, farrowing_window, monitoring_frequency, recommendation, signs_to_watch = classify_window(hours_until)

        alert_type_map = {
            "within_24h": "farrowing_due_24h",
            "within_3d": "farrowing_due_3d",
            "within_7d": "farrowing_due_7d",
        }

        due_alert_type = alert_type_map.get(farrowing_window)
        if due_alert_type and (sow.id, due_alert_type) not in existing_due_alert_keys:
            severity = "critical" if urgency == "critical" else "high" if urgency == "high" else "medium"
            new_due_alerts.append(
                Alert(
                    type=due_alert_type,
                    severity=severity,
                    sow_id=sow.id,
                    pen_id=sow.pen_id,
                    title=f"Sow {sow.tag_id} approaching farrowing ({farrowing_window.replace('_', ' ')})",
                    message=(
                        f"{sow.tag_id} is expected to farrow in ~{hours_until:.0f}h. "
                        f"{recommendation} Priority signs: {signs_to_watch[0]}"
                    ),
                    detection_data=json.dumps(
                        {
                            "hours_until": round(hours_until, 1),
                            "days_until": days_until,
                            "farrowing_window": farrowing_window,
                            "monitoring_frequency": monitoring_frequency,
                            "signs_to_watch": signs_to_watch,
                        }
                    ),
                )
            )
        
        sow_list.append({
            "id": sow.id,
            "tag_id": sow.tag_id,
            "name": sow.name,
            "pen_id": sow.pen_id,
            "expected_date": sow.expected_farrowing_date.isoformat() if sow.expected_farrowing_date else None,
            "days_until": days_until,
            "hours_until": round(hours_until, 1),
            "parity": sow.parity,
            "status": sow.status,
            "urgency": urgency,
            "farrowing_window": farrowing_window,
            "monitoring_frequency": monitoring_frequency,
            "recommendation": recommendation,
            "signs_to_watch": signs_to_watch,
        })

    if new_due_alerts:
        db.add_all(new_due_alerts)
        await db.commit()
    
    return {
        "sows": sow_list,
        "total": len(sows),
        "critical_count": sum(1 for s in sow_list if s["urgency"] == "critical"),
        "high_count": sum(1 for s in sow_list if s["urgency"] == "high"),
        "watch_count": sum(1 for s in sow_list if s["urgency"] == "watch"),
        "generated_alerts": len(new_due_alerts),
    }


# ============================================================================
# PRE / POST FARROWING ANALYTICS
# ============================================================================

@router.get("/pre-post-comparison/{sow_id}")
async def get_pre_post_comparison(
    sow_id: int,
    window_hours: int = Query(48, ge=6, le=168, description="Hours before/after farrowing to compare"),
    db: AsyncSession = Depends(get_db)
):
    """
    Compare sow behavior metrics before vs after farrowing.
    Returns bucketed averages for posture, activity, nursing, feeding,
    crushing risk, and piglet counts for easy chart rendering.
    """
    # Find the most recent completed farrowing for the sow
    result = await db.execute(
        select(FarrowingRecord)
        .where(and_(
            FarrowingRecord.sow_id == sow_id,
            FarrowingRecord.farrowing_started.isnot(None),
        ))
        .order_by(FarrowingRecord.farrowing_started.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()

    if not record or not record.farrowing_started:
        raise HTTPException(status_code=404, detail="No farrowing record found for this sow")

    farrow_time = record.farrowing_started
    pre_start = farrow_time - timedelta(hours=window_hours)
    post_end = (record.farrowing_completed or farrow_time) + timedelta(hours=window_hours)

    # Get the pen for that record
    pen_id = record.pen_id

    # Fetch behavior logs in the full window
    logs_result = await db.execute(
        select(BehaviorLog)
        .where(and_(
            BehaviorLog.pen_id == pen_id,
            BehaviorLog.logged_at >= pre_start,
            BehaviorLog.logged_at <= post_end,
        ))
        .order_by(BehaviorLog.logged_at.asc())
    )
    all_logs = logs_result.scalars().all()

    if not all_logs:
        return {
            "sow_id": sow_id,
            "farrowing_record_id": record.id,
            "farrowing_started": farrow_time.isoformat(),
            "farrowing_completed": record.farrowing_completed.isoformat() if record.farrowing_completed else None,
            "window_hours": window_hours,
            "pre": None,
            "post": None,
            "timeline": [],
            "message": "No behavior logs found in the comparison window."
        }

    pre_logs = [l for l in all_logs if l.logged_at < farrow_time]
    post_logs = [l for l in all_logs if l.logged_at >= (record.farrowing_completed or farrow_time)]

    def summarize(logs):
        if not logs:
            return None
        n = len(logs)
        return {
            "log_count": n,
            "avg_crushing_risk": round(sum(l.crushing_risk or 0 for l in logs) / n, 3),
            "avg_piglet_count": round(sum(l.piglet_count or 0 for l in logs) / n, 1),
            "sleeping_pct": round(sum(1 for l in logs if l.is_sleeping) / n * 100, 1),
            "posture_distribution": _posture_distribution(logs),
            "movement_distribution": _movement_distribution(logs),
            "activity_levels": _activity_levels(logs),
        }

    # Bucket into timeline (4h intervals)
    bucket_hours = max(1, window_hours // 12)
    timeline = []
    cursor = pre_start
    while cursor < post_end:
        bucket_end = cursor + timedelta(hours=bucket_hours)
        bucket_logs = [l for l in all_logs if cursor <= l.logged_at < bucket_end]
        n = len(bucket_logs)
        phase = "pre" if cursor < farrow_time else ("during" if cursor < (record.farrowing_completed or farrow_time) else "post")

        if n > 0:
            timeline.append({
                "timestamp": cursor.isoformat(),
                "phase": phase,
                "log_count": n,
                "avg_crushing_risk": round(sum(l.crushing_risk or 0 for l in bucket_logs) / n, 3),
                "avg_piglet_count": round(sum(l.piglet_count or 0 for l in bucket_logs) / n, 1),
                "sleeping_pct": round(sum(1 for l in bucket_logs if l.is_sleeping) / n * 100, 1),
            })
        else:
            timeline.append({
                "timestamp": cursor.isoformat(),
                "phase": phase,
                "log_count": 0,
                "avg_crushing_risk": None,
                "avg_piglet_count": None,
                "sleeping_pct": None,
            })

        cursor = bucket_end

    return {
        "sow_id": sow_id,
        "farrowing_record_id": record.id,
        "farrowing_started": farrow_time.isoformat(),
        "farrowing_completed": record.farrowing_completed.isoformat() if record.farrowing_completed else None,
        "window_hours": window_hours,
        "born_alive": record.born_alive,
        "total_born": record.total_born,
        "stillborn": record.stillborn,
        "duration_minutes": record.duration_minutes,
        "sow_condition": record.sow_condition,
        "pre": summarize(pre_logs),
        "post": summarize(post_logs),
        "timeline": timeline,
    }


def _posture_distribution(logs) -> dict:
    total = len(logs)
    if total == 0:
        return {}
    counts = {}
    for l in logs:
        p = l.sow_posture or "unknown"
        counts[p] = counts.get(p, 0) + 1
    return {k: round(v / total * 100, 1) for k, v in counts.items()}


def _movement_distribution(logs) -> dict:
    total = len(logs)
    if total == 0:
        return {}
    counts = {}
    for l in logs:
        m = l.movement_level or "unknown"
        counts[m] = counts.get(m, 0) + 1
    return {k: round(v / total * 100, 1) for k, v in counts.items()}


def _activity_levels(logs) -> dict:
    total = len(logs)
    if total == 0:
        return {}
    counts = {}
    for l in logs:
        a = l.activity_level or "unknown"
        counts[a] = counts.get(a, 0) + 1
    return {k: round(v / total * 100, 1) for k, v in counts.items()}


# ============================================================================
# REPLAY / SIMULATION — SERVE RECORDED BEHAVIOR DATA
# ============================================================================

@router.get("/replay/{pen_id}")
async def get_replay_data(
    pen_id: int,
    hours: int = Query(24, ge=1, le=168, description="Hours of data to fetch for replay"),
    db: AsyncSession = Depends(get_db)
):
    """
    Return timestamped behavior logs with detection_data for replay mode.
    The frontend plays these back through the same analytics pipeline.
    """
    since = datetime.utcnow() - timedelta(hours=hours)

    result = await db.execute(
        select(BehaviorLog)
        .where(and_(
            BehaviorLog.pen_id == pen_id,
            BehaviorLog.logged_at >= since,
        ))
        .order_by(BehaviorLog.logged_at.asc())
    )
    logs = result.scalars().all()

    # Get pen + sow info
    pen_result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = pen_result.scalar_one_or_none()

    frames = []
    for log in logs:
        detection_json = None
        if log.detection_data:
            try:
                detection_json = json.loads(log.detection_data)
            except (json.JSONDecodeError, TypeError):
                detection_json = None

        frames.append({
            "id": log.id,
            "timestamp": log.logged_at.isoformat() if log.logged_at else None,
            "sow_posture": log.sow_posture,
            "posture_confidence": log.posture_confidence,
            "piglet_count": log.piglet_count,
            "sow_count": log.sow_count,
            "total_detections": log.total_detections,
            "is_nursing": log.is_nursing,
            "is_feeding": log.is_feeding,
            "is_sleeping": log.is_sleeping,
            "activity_level": log.activity_level,
            "crushing_risk": log.crushing_risk,
            "health_score": log.health_score,
            "movement_level": log.movement_level,
            "detection_data": detection_json,
        })

    return {
        "pen_id": pen_id,
        "pen_name": pen.name if pen else f"Pen {pen_id}",
        "total_frames": len(frames),
        "period_hours": hours,
        "start_time": frames[0]["timestamp"] if frames else None,
        "end_time": frames[-1]["timestamp"] if frames else None,
        "frames": frames,
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def farrowing_to_dict(record: FarrowingRecord) -> dict:
    """Convert FarrowingRecord to dictionary"""
    return {
        "id": record.id,
        "sow_id": record.sow_id,
        "pen_id": record.pen_id,
        "farrowing_started": record.farrowing_started.isoformat() if record.farrowing_started else None,
        "farrowing_completed": record.farrowing_completed.isoformat() if record.farrowing_completed else None,
        "duration_minutes": record.duration_minutes,
        "total_born": record.total_born,
        "born_alive": record.born_alive,
        "stillborn": record.stillborn,
        "mummified": record.mummified,
        "piglet_weights": json.loads(record.piglet_weights) if record.piglet_weights else [],
        "avg_birth_weight": record.avg_birth_weight,
        "cross_fostered_in": record.cross_fostered_in,
        "cross_fostered_out": record.cross_fostered_out,
        "current_litter_size": record.current_litter_size,
        "sow_condition": record.sow_condition,
        "intervention_required": record.intervention_required,
        "intervention_notes": record.intervention_notes,
        "ai_detected": record.ai_detected,
        "crushing_incidents": record.crushing_incidents,
        "attended_by": record.attended_by,
        "notes": record.notes,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None
    }


def piglet_to_dict(piglet: PigletRecord) -> dict:
    """Convert PigletRecord to dictionary"""
    return {
        "id": piglet.id,
        "farrowing_record_id": piglet.farrowing_record_id,
        "sow_id": piglet.sow_id,
        "nurse_sow_id": piglet.nurse_sow_id,
        "ear_tag": piglet.ear_tag,
        "temp_id": piglet.temp_id,
        "birth_order": piglet.birth_order,
        "birth_weight": piglet.birth_weight,
        "birth_time": piglet.birth_time.isoformat() if piglet.birth_time else None,
        "status": piglet.status,
        "death_date": piglet.death_date.isoformat() if piglet.death_date else None,
        "death_cause": piglet.death_cause,
        "processed_date": piglet.processed_date.isoformat() if piglet.processed_date else None,
        "iron_given": piglet.iron_given,
        "teeth_clipped": piglet.teeth_clipped,
        "tail_docked": piglet.tail_docked,
        "castrated": piglet.castrated,
        "health_score": piglet.health_score,
        "health_notes": piglet.health_notes,
        "weight_history": json.loads(piglet.weight_history) if piglet.weight_history else [],
        "current_weight": piglet.current_weight,
        "created_at": piglet.created_at.isoformat() if piglet.created_at else None
    }


# ============================================================================
# AI MONITORING STATE
# ============================================================================

@router.post("/ai-monitor/state")
async def log_farrowing_monitor_state(
    payload: dict,
    db: AsyncSession = Depends(get_db)
):
    """
    Log farrowing monitoring engine state from the frontend.
    Called when state transitions occur (e.g. PREDICTION_HIGH, FARROWING_STARTED).

    Expected payload:
    {
      "pen_id": int,
      "sow_id": int | null,
      "system_state": str,           # NORMAL_MONITORING, PREDICTION_HIGH, etc.
      "previous_state": str | null,
      "prediction_metrics": { ... },  # posture transitions, posture switching, activity
      "piglet_count": int,
      "highest_piglet_count": int,
      "crushing_incidents": int,
      "birth_events": [ ... ],
      "session_started_at": str | null,
      "session_duration_minutes": float | null,
    }
    """
    try:
        pen_id = payload.get("pen_id")
        sow_id = payload.get("sow_id")
        system_state = payload.get("system_state", "NORMAL_MONITORING")
        previous_state = payload.get("previous_state")

        def _birth_time_from_event(event: dict[str, Any]) -> datetime:
            detected_at = event.get("detectedAt")
            if isinstance(detected_at, (int, float)):
                # Frontend sends epoch milliseconds.
                return datetime.utcfromtimestamp(float(detected_at) / 1000)
            return datetime.utcnow()

        async def _sync_piglet_records_from_events(record: FarrowingRecord) -> int:
            if not record.sow_id:
                return 0

            birth_events = payload.get("birth_events") or []

            # Fallback when events are unavailable: create up to highest observed count.
            if not birth_events:
                highest = int(payload.get("highest_piglet_count") or 0)
                birth_events = [{"pigletNumber": i + 1} for i in range(highest)]

            existing_result = await db.execute(
                select(PigletRecord.birth_order).where(PigletRecord.farrowing_record_id == record.id)
            )
            existing_orders = {row[0] for row in existing_result.all() if row[0] is not None}

            created = 0
            for idx, event in enumerate(birth_events):
                order = int(event.get("pigletNumber") or (idx + 1))
                if order in existing_orders:
                    continue

                piglet = PigletRecord(
                    farrowing_record_id=record.id,
                    sow_id=record.sow_id,
                    birth_order=order,
                    birth_time=_birth_time_from_event(event),
                    status="alive",
                )
                db.add(piglet)
                existing_orders.add(order)
                created += 1

            # Keep aggregate fields aligned with highest observed order.
            highest_order = max(existing_orders) if existing_orders else 0
            record.total_born = max(int(record.total_born or 0), highest_order)
            record.born_alive = max(int(record.born_alive or 0), highest_order)
            record.current_litter_size = max(int(record.current_litter_size or 0), highest_order)
            return created

        logger.info(
            f"[AI Monitor] State: {previous_state} → {system_state} "
            f"(pen={pen_id}, sow={sow_id}, piglets={payload.get('highest_piglet_count', 0)})"
        )

        # Auto-create farrowing record on FARROWING_STARTED
        if system_state == "FARROWING_STARTED" and pen_id:
            # Check if sow exists for this pen
            sow = None
            if sow_id:
                result = await db.execute(select(Sow).where(Sow.id == sow_id))
                sow = result.scalar_one_or_none()
            elif pen_id:
                result = await db.execute(
                    select(Sow).where(and_(Sow.pen_id == pen_id, Sow.status.in_(["active", "pregnant"])))
                )
                sow = result.scalar_one_or_none()

            if not sow:
                logger.warning(f"[AI Monitor] FARROWING_STARTED ignored for pen {pen_id}: no active/pregnant sow found")
                return {"status": "ignored", "state": system_state, "reason": "no_sow_found"}

            record = FarrowingRecord(
                sow_id=sow.id if sow else None,
                pen_id=pen_id,
                farrowing_started=datetime.utcnow(),
                ai_detected=True,
                notes=f"Auto-detected by AI monitoring engine. Prediction: {payload.get('prediction_metrics', {}).get('farrowingProbability', 'N/A')}",
            )
            db.add(record)
            await db.flush()

            created_piglets = await _sync_piglet_records_from_events(record)

            if sow:
                sow.status = "farrowing"
                sow.last_farrowing_date = datetime.utcnow()

            # Create event
            event = Event(
                type="farrowing",
                category="ai_detection",
                pen_id=pen_id,
                description=f"AI detected farrowing started for {'Sow #' + str(sow.id) if sow else 'pen ' + str(pen_id)}"
            )
            db.add(event)
            await db.commit()

            logger.info(
                f"[AI Monitor] Created farrowing record #{record.id} for pen {pen_id} "
                f"with {created_piglets} piglet record(s)"
            )
            return {"status": "ok", "state": system_state, "farrowing_record_id": record.id}

        # Sync incremental piglet records while farrowing is active
        if system_state == "FARROWING_ACTIVE" and pen_id:
            result = await db.execute(
                select(FarrowingRecord)
                .where(and_(
                    FarrowingRecord.pen_id == pen_id,
                    FarrowingRecord.farrowing_completed.is_(None),
                    FarrowingRecord.ai_detected == True,
                ))
                .order_by(FarrowingRecord.farrowing_started.desc())
            )
            record = result.scalar_one_or_none()

            if record:
                created_piglets = await _sync_piglet_records_from_events(record)
                record.crushing_incidents = max(
                    int(record.crushing_incidents or 0),
                    int(payload.get("crushing_incidents") or 0),
                )
                await db.commit()
                return {
                    "status": "ok",
                    "state": system_state,
                    "farrowing_record_id": record.id,
                    "new_piglet_records": created_piglets,
                    "total_born": record.total_born,
                }

        # Auto-complete on FARROWING_COMPLETED
        if system_state == "FARROWING_COMPLETED" and pen_id:
            result = await db.execute(
                select(FarrowingRecord)
                .where(and_(
                    FarrowingRecord.pen_id == pen_id,
                    FarrowingRecord.farrowing_completed.is_(None),
                    FarrowingRecord.ai_detected == True,
                ))
                .order_by(FarrowingRecord.farrowing_started.desc())
            )
            record = result.scalar_one_or_none()

            if record:
                now = datetime.utcnow()
                record.farrowing_completed = now
                duration = (now - record.farrowing_started).total_seconds() / 60 if record.farrowing_started else 0
                record.duration_minutes = int(duration)
                record.total_born = payload.get("highest_piglet_count", 0)
                record.born_alive = payload.get("highest_piglet_count", 0)
                record.crushing_incidents = payload.get("crushing_incidents", 0)
                record.notes = (record.notes or "") + f"\nAI completed: {payload.get('highest_piglet_count', 0)} piglets, {int(duration)} min."

                # Update sow status
                if record.sow_id:
                    sow_result = await db.execute(select(Sow).where(Sow.id == record.sow_id))
                    sow = sow_result.scalar_one_or_none()
                    if sow:
                        sow.status = "lactating"
                        sow.current_litter_size = payload.get("highest_piglet_count", 0)
                        sow.parity = (sow.parity or 0) + 1

                event = Event(
                    type="farrowing_complete",
                    category="ai_detection",
                    pen_id=pen_id,
                    description=f"AI detected farrowing completed. {payload.get('highest_piglet_count', 0)} piglets born in {int(duration)} min."
                )
                db.add(event)
                await db.commit()

                logger.info(f"[AI Monitor] Completed farrowing record #{record.id}")
                return {"status": "ok", "state": system_state, "farrowing_record_id": record.id}

        # Log prediction alerts
        if system_state == "PREDICTION_HIGH" and pen_id:
            event = Event(
                type="detection",
                category="ai_detection",
                pen_id=pen_id,
                description=(
                    f"AI predicts farrowing within 6-12 hours. "
                    f"Posture transitions: {payload.get('prediction_metrics', {}).get('postureTransitionsPerHour', 0)}/hr, "
                    f"Posture switching: {payload.get('prediction_metrics', {}).get('nestingCountPerHour', 0)}/hr"
                )
            )
            db.add(event)
            await db.commit()

        return {"status": "ok", "state": system_state}

    except Exception as e:
        logger.error(f"[AI Monitor] Error: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
