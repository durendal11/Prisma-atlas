"""
Crush Events API - Lifecycle tracking and outcome finalization for crushing risk events.

Endpoints:
  GET  /api/crush-events           - list events (filterable by pen, outcome, date)
  GET  /api/crush-events/summary   - aggregate stats (counts by outcome, FP rate)
  GET  /api/crush-events/{id}      - single event with full timeline
  POST /api/crush-events/{id}/dismiss       - caretaker Pen is Fine
  POST /api/crush-events/{id}/confirm-crush - admin override: mark as likely_crush
  POST /api/crush-events/{id}/respond       - structured clarification response
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timedelta
from typing import List, Optional
import logging

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pig import CrushingEvent, Alert
from app.schemas.pig import CrushingEventResponse, CrushingEventSummaryResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crush-events", tags=["Crush Events"])


@router.get("", response_model=List[CrushingEventResponse])
async def list_crush_events(
    pen_id: Optional[int] = Query(None),
    outcome: Optional[str] = Query(None),
    days_back: int = Query(30, ge=1, le=365),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List crushing events with optional filters."""
    since = datetime.utcnow() - timedelta(days=days_back)
    filters = [CrushingEvent.created_at >= since]
    if pen_id:
        filters.append(CrushingEvent.pen_id == pen_id)
    if outcome:
        filters.append(CrushingEvent.outcome == outcome)
    result = await db.execute(
        select(CrushingEvent)
        .where(and_(*filters))
        .order_by(CrushingEvent.created_at.desc())
        .offset(skip).limit(limit)
    )
    return result.scalars().all()


@router.get("/summary", response_model=CrushingEventSummaryResponse)
async def crush_event_summary(
    pen_id: Optional[int] = Query(None),
    days_back: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return aggregate outcome counts for the requested period."""
    since = datetime.utcnow() - timedelta(days=days_back)
    base_filter = [CrushingEvent.created_at >= since]
    if pen_id:
        base_filter.append(CrushingEvent.pen_id == pen_id)

    async def _count(extra=None):
        f = list(base_filter) + ([extra] if extra is not None else [])
        r = await db.execute(select(func.count(CrushingEvent.id)).where(and_(*f)))
        return r.scalar() or 0

    total         = await _count()
    prevented     = await _count(CrushingEvent.outcome == "prevented")
    likely_crush  = await _count(CrushingEvent.outcome == "likely_crush")
    false_pos     = await _count(CrushingEvent.outcome == "false_positive")
    unresolved    = await _count(CrushingEvent.outcome == "unresolved")
    fp_rate = (false_pos / total) if total > 0 else None

    return CrushingEventSummaryResponse(
        total=total, prevented=prevented, likely_crush=likely_crush,
        false_positive=false_pos, unresolved=unresolved,
        false_positive_rate=round(fp_rate, 3) if fp_rate is not None else None,
        period_days=days_back,
    )


@router.get("/{event_id}", response_model=CrushingEventResponse)
async def get_crush_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single crushing event by ID."""
    result = await db.execute(select(CrushingEvent).where(CrushingEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Crushing event not found")
    return event


@router.post("/{event_id}/dismiss")
async def dismiss_crush_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Caretaker Pen is Fine dismiss.

    Outcome:
      - recovery_count present (count returned to baseline) -> prevented
      - otherwise -> unresolved (checked but unclear)
    Also resolves the linked Alert row.
    """
    result = await db.execute(select(CrushingEvent).where(CrushingEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Crushing event not found")

    now = datetime.utcnow()
    event.dismissed_at = now
    event.dismissed_by = current_user.id
    event.outcome = (
        "prevented"
        if (event.recovery_count is not None and event.baseline_count is not None)
        else "unresolved"
    )
    if not event.resolved_at:
        event.resolved_at = now
        if event.alerted_at:
            event.duration_minutes = (now - event.alerted_at).total_seconds() / 60

    if event.alert_id:
        ar = await db.execute(select(Alert).where(Alert.id == event.alert_id))
        alert = ar.scalar_one_or_none()
        if alert and not alert.is_resolved:
            alert.is_resolved = True
            alert.resolved_at = now
            alert.resolved_by = current_user.id

    await db.commit()
    await db.refresh(event)
    return {"message": "Event dismissed", "event_id": event.id, "outcome": event.outcome,
            "dismissed_at": event.dismissed_at.isoformat()}


@router.post("/{event_id}/confirm-crush")
async def confirm_crush(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin override: mark outcome as likely_crush."""
    result = await db.execute(select(CrushingEvent).where(CrushingEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Crushing event not found")

    event.outcome = "likely_crush"
    now = datetime.utcnow()
    if not event.resolved_at:
        event.resolved_at = now
        if event.alerted_at:
            event.duration_minutes = (now - event.alerted_at).total_seconds() / 60

    await db.commit()
    await db.refresh(event)
    return {"message": "Event marked as likely crush", "event_id": event.id, "outcome": event.outcome}


class ClarificationResponse(BaseModel):
    """Structured farmer response to a crushing risk alert."""
    action: str  # "pen_is_fine", "piglet_died", "piglet_transferred", "will_check"
    piglets_affected: int = 1  # Number of piglets that died/transferred
    death_cause: Optional[str] = None  # "crushing", "starvation", "disease", "unknown"
    notes: Optional[str] = None


@router.post("/{event_id}/respond")
async def respond_to_crush_event(
    event_id: int,
    body: ClarificationResponse,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Structured farmer response to a crushing risk alert.

    This is the primary endpoint called from push notification action buttons:
      - "Pen is Fine"       → action="pen_is_fine"
      - "Piglet Died"       → action="piglet_died" (records mortality, reduces baseline)
      - "Piglet Transferred" → action="piglet_transferred" (reduces baseline, no mortality)
      - "I'll Check"        → action="will_check" (extends grace period)

    Returns:
        Updated event with outcome and baseline adjustments.
    """
    from app.models.pig import Sow, FarrowingRecord

    result = await db.execute(select(CrushingEvent).where(CrushingEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Crushing event not found")

    now = datetime.utcnow()
    response_data = {
        "event_id": event.id,
        "action": body.action,
        "responded_by": current_user.id,
        "responded_at": now.isoformat(),
    }

    if body.action == "pen_is_fine":
        # Count recovered or farmer verified — false alarm
        event.outcome = (
            "prevented"
            if (event.recovery_count is not None and event.baseline_count is not None)
            else "unresolved"
        )
        event.dismissed_at = now
        event.dismissed_by = current_user.id
        if not event.resolved_at:
            event.resolved_at = now
            if event.alerted_at:
                event.duration_minutes = (now - event.alerted_at).total_seconds() / 60

        # Resolve the linked alert
        if event.alert_id:
            ar = await db.execute(select(Alert).where(Alert.id == event.alert_id))
            alert = ar.scalar_one_or_none()
            if alert and not alert.is_resolved:
                alert.is_resolved = True
                alert.resolved_at = now
                alert.resolved_by = current_user.id

        response_data["outcome"] = event.outcome
        response_data["message"] = "Event dismissed — pen verified as safe."

    elif body.action == "piglet_died":
        # Confirmed mortality — update baseline and record death
        event.outcome = "likely_crush"
        if not event.resolved_at:
            event.resolved_at = now
            if event.alerted_at:
                event.duration_minutes = (now - event.alerted_at).total_seconds() / 60

        count_reduction = max(1, body.piglets_affected)

        # Update sow's current_litter_size
        if event.sow_id:
            sow_result = await db.execute(select(Sow).where(Sow.id == event.sow_id))
            sow_row = sow_result.scalar_one_or_none()
            if sow_row and sow_row.current_litter_size and sow_row.current_litter_size > 0:
                sow_row.current_litter_size = max(0, sow_row.current_litter_size - count_reduction)
                response_data["new_litter_size"] = sow_row.current_litter_size

        # Update active farrowing record
        if event.pen_id:
            fr_result = await db.execute(
                select(FarrowingRecord)
                .where(
                    and_(
                        FarrowingRecord.pen_id == event.pen_id,
                        FarrowingRecord.farrowing_completed.is_(None),
                    )
                )
                .order_by(FarrowingRecord.created_at.desc())
                .limit(1)
            )
            fr = fr_result.scalar_one_or_none()
            if fr and fr.current_litter_size and fr.current_litter_size > 0:
                fr.current_litter_size = max(0, fr.current_litter_size - count_reduction)
                fr.crushing_incidents = (fr.crushing_incidents or 0) + 1

        # Resolve the linked alert
        if event.alert_id:
            ar = await db.execute(select(Alert).where(Alert.id == event.alert_id))
            alert = ar.scalar_one_or_none()
            if alert and not alert.is_resolved:
                alert.is_resolved = True
                alert.resolved_at = now
                alert.resolved_by = current_user.id

        response_data["outcome"] = "likely_crush"
        response_data["baseline_reduced_by"] = count_reduction
        response_data["death_cause"] = body.death_cause or "crushing"
        response_data["message"] = (
            f"Confirmed piglet mortality ({count_reduction} piglet(s)). "
            f"Baseline reduced. Death cause: {body.death_cause or 'crushing'}."
        )

    elif body.action == "piglet_transferred":
        # Piglet was cross-fostered out — reduce baseline but no mortality
        event.outcome = "unresolved"
        event.dismissed_at = now
        event.dismissed_by = current_user.id
        if not event.resolved_at:
            event.resolved_at = now

        count_reduction = max(1, body.piglets_affected)

        if event.sow_id:
            sow_result = await db.execute(select(Sow).where(Sow.id == event.sow_id))
            sow_row = sow_result.scalar_one_or_none()
            if sow_row and sow_row.current_litter_size and sow_row.current_litter_size > 0:
                sow_row.current_litter_size = max(0, sow_row.current_litter_size - count_reduction)
                response_data["new_litter_size"] = sow_row.current_litter_size

        response_data["outcome"] = "unresolved"
        response_data["baseline_reduced_by"] = count_reduction
        response_data["message"] = (
            f"Piglet transferred/cross-fostered ({count_reduction}). "
            f"Baseline reduced — no mortality recorded."
        )

    elif body.action == "will_check":
        # Farmer acknowledges but needs time — don't resolve yet
        response_data["outcome"] = None
        response_data["message"] = (
            "Acknowledged. The system will continue monitoring. "
            "If no follow-up within 20 minutes, the alert will escalate."
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action: '{body.action}'. "
                   f"Must be one of: pen_is_fine, piglet_died, piglet_transferred, will_check",
        )

    if body.notes:
        response_data["notes"] = body.notes

    await db.commit()
    await db.refresh(event)

    logger.info(
        "Crush event %d responded: action=%s, outcome=%s, user=%d",
        event_id, body.action, event.outcome, current_user.id,
    )

    return response_data
