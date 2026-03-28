"""
Behavior Logging API - Logs sow behavior every 12 seconds for analytics
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, Integer
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from typing import List, Optional, Any
import json
import logging

from app.core.database import get_db
from app.models.pig import BehaviorLog, Pen, Sow, Event, Alert
from app.schemas.pig import BehaviorLogCreate, BehaviorLogResponse, BehaviorAnalytics
from app.analyzers.nesting import NestingBehaviorAnalyzer
from app.analyzers.birth import BirthEventDetector
from app.analyzers.welfare import PigletWelfareMonitor
from app.analyzers.cluster import ClusterVisibilityAnalyzer
from app.api.websocket import ws_manager
from app.services.ai_summary import generate_alert_summary

logger = logging.getLogger(__name__)
# NOTE: frontend calls /api/behavior/*; keep the router in the /api namespace.
router = APIRouter(prefix="/api/behavior", tags=["behavior"])

_nesting_analyzers: dict[int, NestingBehaviorAnalyzer] = {}
_birth_detectors: dict[int, BirthEventDetector] = {}
_welfare_monitors: dict[int, PigletWelfareMonitor] = {}
_cluster_analyzers: dict[int, ClusterVisibilityAnalyzer] = {}
_ai_last_called: dict[int, datetime] = {}
AI_MIN_INTERVAL_SECONDS = 120


def _ai_cooldown_active(pen_id: int) -> bool:
    last = _ai_last_called.get(pen_id)
    if not last:
        return False
    return (datetime.utcnow() - last).total_seconds() < AI_MIN_INTERVAL_SECONDS


def _mark_ai_called(pen_id: int):
    _ai_last_called[pen_id] = datetime.utcnow()


AI_TRIGGER_TYPES = {
    "cluster_visibility_gap",
    "piglet_welfare_flag",
    "dystocia_risk",
    "birth_detected",
    "nesting_onset",
    "active_nesting",
    "crushing_risk",
}


async def get_recent_logs(db: AsyncSession, pen_id: int, minutes: int = 30) -> list:
    since = datetime.utcnow() - timedelta(minutes=minutes)
    result = await db.execute(
        select(BehaviorLog)
        .where(
            and_(
                BehaviorLog.pen_id == pen_id,
                BehaviorLog.logged_at >= since,
                BehaviorLog.is_archived == False,
            )
        )
        .order_by(BehaviorLog.logged_at.asc())
    )
    return result.scalars().all()


async def fire_alert(db: AsyncSession, pen_id: int, event: dict[str, Any]):
    severity_raw = str(event.get("severity", "medium"))
    severity = severity_raw.lower()
    priority = str(event.get("priority", severity_raw)).upper()
    push_title = str(event.get("push_title") or event.get("type", "Alert").replace("_", " ").title())
    push_body = str(event.get("push_body") or event.get("alert", ""))
    alert_type = str(event.get("alert_type") or event.get("type", "system"))

    # MEDIUM pushes can be suppressed, while CRITICAL/HIGH always pass.
    suppress_until_minutes = int(event.get("suppress_until_minutes", 0) or 0)
    medium_suppressed = False
    if priority == "MEDIUM" and suppress_until_minutes > 0:
        since = datetime.utcnow() - timedelta(minutes=suppress_until_minutes)
        recent_result = await db.execute(
            select(Alert.id)
            .where(
                and_(
                    Alert.pen_id == pen_id,
                    Alert.type == alert_type,
                    Alert.created_at >= since,
                )
            )
            .limit(1)
        )
        medium_suppressed = recent_result.scalar_one_or_none() is not None

    alert = Alert(
        type=alert_type,
        severity=severity,
        title=event.get("type", "Alert").replace("_", " ").title(),
        message=event.get("alert", ""),
        pen_id=pen_id,
        detection_data=json.dumps(event),
    )
    db.add(alert)

    if priority in ("CRITICAL", "HIGH") or (priority == "MEDIUM" and not medium_suppressed):
        await ws_manager.broadcast(
            {
                "type": "push_alert",
                "pen_id": pen_id,
                "priority": priority,
                "alert_type": alert_type,
                "push_title": push_title,
                "push_body": push_body,
                "timestamp": datetime.utcnow().isoformat(),
            },
            f"pen_{pen_id}",
        )
        
        from app.core.firebase import broadcast_alert
        await broadcast_alert(
            title=push_title,
            body=push_body,
            alert_type=alert_type,
            pen_id=pen_id,
            severity=severity
        )


def _parse_detection_data(raw: Optional[str]) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


@router.post("/log")
async def log_behavior(
    behavior: BehaviorLogCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Log sow behavior data from frontend detection.
    Called every 12 seconds during live monitoring.
    """
    try:
        if behavior.sow_id:
            sow_result = await db.execute(select(Sow).where(Sow.id == behavior.sow_id))
            sow = sow_result.scalar_one_or_none()
            if sow and sow.is_archived:
                raise HTTPException(status_code=400, detail="Cannot log behavior for an archived sow")

        raw_detection_data = behavior.detection_data
        parsed_detection_data: dict[str, Any] = {}
        if isinstance(raw_detection_data, str):
            try:
                parsed = json.loads(raw_detection_data)
                if isinstance(parsed, dict):
                    parsed_detection_data = parsed
            except (TypeError, ValueError, json.JSONDecodeError):
                parsed_detection_data = {}

        recent_logs = await get_recent_logs(db, behavior.pen_id, minutes=30)

        if behavior.pen_id not in _nesting_analyzers:
            _nesting_analyzers[behavior.pen_id] = NestingBehaviorAnalyzer()
        if behavior.pen_id not in _birth_detectors:
            _birth_detectors[behavior.pen_id] = BirthEventDetector()
        if behavior.pen_id not in _welfare_monitors:
            _welfare_monitors[behavior.pen_id] = PigletWelfareMonitor()
        if behavior.pen_id not in _cluster_analyzers:
            _cluster_analyzers[behavior.pen_id] = ClusterVisibilityAnalyzer()

        nesting_result = _nesting_analyzers[behavior.pen_id].analyze(recent_logs, window_minutes=30)
        now = datetime.utcnow()
        birth_events = _birth_detectors[behavior.pen_id].process_log(behavior, now)
        welfare_alerts = _welfare_monitors[behavior.pen_id].process_log(behavior, now)
        _cluster_analyzers[behavior.pen_id].update_confirmed_total(
            _birth_detectors[behavior.pen_id].confirmed_count
        )
        cluster_alerts = _cluster_analyzers[behavior.pen_id].process_log(behavior, now)

        enriched_detection_data = {
            **parsed_detection_data,
            "nesting_score": nesting_result.get("nesting_score", 0.0),
            "nesting_phase": nesting_result.get("nesting_phase", "calm"),
            "transitions_per_hour": nesting_result.get("transitions_per_hour", 0.0),
            "motionless_piglet_flag": len(welfare_alerts) > 0,
            "birth_count_session": _birth_detectors[behavior.pen_id].confirmed_count,
        }
        enriched_detection_data_json = json.dumps(enriched_detection_data)

        log_entry = BehaviorLog(
            pen_id=behavior.pen_id,
            sow_id=behavior.sow_id,
            piglet_count=behavior.piglet_count,
            sow_count=behavior.sow_count,
            total_detections=behavior.total_detections,
            sow_posture=behavior.sow_posture,
            posture_confidence=behavior.posture_confidence,
            is_nursing=behavior.is_nursing,
            is_feeding=behavior.is_feeding,
            is_sleeping=behavior.is_sleeping,
            activity_level=behavior.activity_level,
            crushing_risk=behavior.crushing_risk,
            health_score=behavior.health_score,
            avg_confidence=behavior.avg_confidence,
            detection_density=behavior.detection_density,
            movement_level=behavior.movement_level,
            cleanliness_score=behavior.cleanliness_score,
            wetness_score=behavior.wetness_score,
            detection_data=enriched_detection_data_json,
            is_archived=False,
            logged_at=behavior.logged_at or datetime.utcnow(),
        )
        
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)

        # Emit events for high-risk or poor environment scores
        events_to_add = []
        if behavior.crushing_risk >= 0.7:
            events_to_add.append(Event(
                type="detection",
                category="ai_detection",
                pen_id=behavior.pen_id,
                description=f"High crushing risk detected ({behavior.crushing_risk:.2f})"
            ))
        if behavior.cleanliness_score <= 0.3:
            events_to_add.append(Event(
                type="detection",
                category="ai_detection",
                pen_id=behavior.pen_id,
                description=f"Pen cleanliness low ({behavior.cleanliness_score:.2f})"
            ))
        if behavior.wetness_score >= 0.6:
            events_to_add.append(Event(
                type="detection",
                category="ai_detection",
                pen_id=behavior.pen_id,
                description=f"Pen wetness high ({behavior.wetness_score:.2f})"
            ))

        crushing_alerts: list[dict[str, Any]] = []
        if behavior.crushing_risk >= 0.7:
            severity = "CRITICAL" if behavior.crushing_risk >= 0.8 else "HIGH"
            crushing_alerts.append(
                {
                    "type": "crushing_risk",
                    "pen_id": behavior.pen_id,
                    "severity": severity,
                    "priority": severity,
                    "risk_level": round(float(behavior.crushing_risk), 3),
                    "alert": (
                        f"High crushing risk detected in Pen {behavior.pen_id} "
                        f"(risk={behavior.crushing_risk:.2f}). Check sow and piglet spacing immediately."
                    ),
                    "push_title": f"Pen {behavior.pen_id} - Crushing risk",
                    "push_body": (
                        f"Risk score {behavior.crushing_risk:.2f}. "
                        "Check pen immediately."
                    ),
                    # High/critical alerts should not be deduped by medium cooldown logic.
                    "suppress_until_minutes": 0,
                }
            )

        all_alerts = birth_events + welfare_alerts + cluster_alerts + crushing_alerts
        pen_id = behavior.pen_id

        should_summarize = any(
            e.get("type") in AI_TRIGGER_TYPES or e.get("severity") in ("HIGH", "CRITICAL")
            for e in all_alerts
        )

        ai_summary = None
        if should_summarize and not _ai_cooldown_active(pen_id):
            pen_data = {
                "pen_id": pen_id,
                "sow_name": str(behavior.sow_id or "Unknown"),
                "lifecycle_stage": behavior.activity_level or "unknown",
                "window_minutes": 30,
                "log_count": len(recent_logs),
                "dominant_posture": behavior.sow_posture,
                "posture_pct": round((behavior.posture_confidence or 0) * 100, 1),
                "transition_count": int(enriched_detection_data.get("transitions_per_hour", 0)),
                "nursing_count": sum(1 for l in recent_logs if l.sow_posture == "nursing"),
                "feeding_count": sum(1 for l in recent_logs if l.sow_posture == "feeding"),
                "avg_risk": behavior.crushing_risk or 0.0,
                "peak_risk": max(
                    (l.crushing_risk for l in recent_logs if l.crushing_risk is not None),
                    default=behavior.crushing_risk or 0.0,
                ),
                "danger_zone_count": behavior.piglet_count or 0,
                "is_farrowing": enriched_detection_data.get("birth_count_session", 0) > 0,
                "mins_since_piglet": None,
                "nesting_score": enriched_detection_data.get("nesting_score", 0.0),
                "nesting_phase": enriched_detection_data.get("nesting_phase", "calm"),
                "motionless_piglet_flag": enriched_detection_data.get("motionless_piglet_flag", False),
                "anomalies": [e["type"] for e in all_alerts],
            }
            try:
                ai_summary = await generate_alert_summary(pen_data)
                _mark_ai_called(pen_id)
            except Exception:
                ai_summary = None

        for event in all_alerts:
            if ai_summary and event.get("severity") in ("HIGH", "CRITICAL"):
                event["push_title"] = ai_summary.get("push_title", event.get("push_title", ""))
                event["push_body"] = ai_summary.get("push_body", event.get("push_body", ""))
                event["ai_detail"] = ai_summary.get("detail", "")
                event["ai_action"] = ai_summary.get("recommended_action", "")
            await fire_alert(db, pen_id, event)

        if events_to_add:
            db.add_all(events_to_add)
        if events_to_add or birth_events or welfare_alerts or cluster_alerts:
            await db.commit()
        
        logger.info(f"Behavior logged for pen {behavior.pen_id}: {behavior.sow_posture}, risk={behavior.crushing_risk:.2f}")
        
        return {"status": "ok", "nesting_phase": enriched_detection_data["nesting_phase"]}
    except Exception as e:
        logger.error(f"Failed to log behavior: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/{pen_id}", response_model=List[BehaviorLogResponse])
async def get_behavior_logs(
    pen_id: int,
    hours: int = Query(default=24, ge=1, le=168, description="Hours of history to fetch"),
    limit: int = Query(default=500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db)
):
    """Get behavior logs for a specific pen within the specified time window."""
    since = datetime.utcnow() - timedelta(hours=hours)
    
    result = await db.execute(
        select(BehaviorLog)
        .where(and_(
            BehaviorLog.pen_id == pen_id,
            BehaviorLog.is_archived == False,
            BehaviorLog.logged_at >= since
        ))
        .order_by(BehaviorLog.logged_at.desc())
        .limit(limit)
    )
    
    return result.scalars().all()


@router.get("/analytics/{pen_id}", response_model=BehaviorAnalytics)
async def get_behavior_analytics(
    pen_id: int,
    hours: int = Query(default=24, ge=1, le=168, description="Hours of history to analyze"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated behavior analytics for health monitoring.
    Useful for identifying patterns and potential health issues.
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    
    result = await db.execute(
        select(BehaviorLog)
        .where(and_(
            BehaviorLog.pen_id == pen_id,
            BehaviorLog.is_archived == False,
            BehaviorLog.logged_at >= since
        ))
    )
    logs = result.scalars().all()
    
    if not logs:
        return {
            "pen_id": pen_id,
            "hours": hours,
            "likelihood": "Unknown",
            "score": 0.0,
            "reason": "No behavior logs found for this pen",
            "posture_changes_per_hour": 0.0,
            "restlessness": 0.0,
            "nursing_ratio": 0.0,
            "sleeping_ratio": 0.0,
            "expected_window_hours": None,
        }
    
    total_logs = len(logs)
    
    # Calculate averages
    avg_piglet_count = sum(l.piglet_count for l in logs) / total_logs
    avg_crushing_risk = sum(l.crushing_risk for l in logs) / total_logs
    avg_health_score = sum(l.health_score for l in logs) / total_logs
    
    # Calculate percentages
    nursing_count = sum(1 for l in logs if l.is_nursing)
    feeding_count = sum(1 for l in logs if l.is_feeding)
    sleeping_count = sum(1 for l in logs if l.is_sleeping)
    
    # Posture distribution
    posture_counts: dict = {}
    for log in logs:
        posture = log.sow_posture or 'unknown'
        posture_counts[posture] = posture_counts.get(posture, 0) + 1
    posture_distribution = {k: v / total_logs * 100 for k, v in posture_counts.items()}
    
    # Activity distribution
    activity_counts: dict = {}
    for log in logs:
        activity = log.activity_level or 'unknown'
        activity_counts[activity] = activity_counts.get(activity, 0) + 1
    activity_distribution = {k: v / total_logs * 100 for k, v in activity_counts.items()}
    
    return BehaviorAnalytics(
        pen_id=pen_id,
        period_start=since,
        period_end=datetime.utcnow(),
        total_logs=total_logs,
        avg_piglet_count=round(avg_piglet_count, 2),
        avg_crushing_risk=round(avg_crushing_risk, 3),
        avg_health_score=round(avg_health_score, 1),
        nursing_percentage=round(nursing_count / total_logs * 100, 1),
        feeding_percentage=round(feeding_count / total_logs * 100, 1),
        sleeping_percentage=round(sleeping_count / total_logs * 100, 1),
        posture_distribution=posture_distribution,
        activity_distribution=activity_distribution,
    )


@router.get("/farrowing-likelihood/{pen_id}")
async def get_farrowing_likelihood(
    pen_id: int,
    hours: int = Query(default=12, ge=2, le=72, description="History window for likelihood"),
    db: AsyncSession = Depends(get_db)
):
    """Estimate farrowing likelihood from posture change rates and restlessness.
    Returns a 0-100 score. Triggers an alert if score >= alert_threshold."""
    since = datetime.utcnow() - timedelta(hours=hours)

    result = await db.execute(
        select(BehaviorLog)
        .where(and_(BehaviorLog.pen_id == pen_id, BehaviorLog.is_archived == False, BehaviorLog.logged_at >= since))
        .order_by(BehaviorLog.logged_at.asc())
    )
    logs = result.scalars().all()

    if not logs:
        return {
            "pen_id": pen_id,
            "score": 0,
            "likelihood": "Unknown",
            "expected_window_hours": None,
            "changes_per_hour": 0.0,
            "nursing_ratio": 0.0,
            "sleeping_ratio": 0.0,
            "feeding_ratio": 0.0,
            "lying_ratio": 0.0,
            "restlessness_index": 0.0,
            "period_hours": hours,
            "message": "No behavior logs recorded yet. Start live monitoring to collect data.",
        }

    # ── Component 1: Posture change rate (0-30 points) ──
    posture_changes = 0
    for prev, curr in zip(logs, logs[1:]):
        if prev.sow_posture != curr.sow_posture:
            posture_changes += 1
    hours_span = max((logs[-1].logged_at - logs[0].logged_at).total_seconds() / 3600, 0.1)
    changes_per_hour = posture_changes / hours_span
    # >20 changes/hr = max component value (1.0)
    posture_component = min(changes_per_hour / 20, 1.0)

    # ── Component 2: Restlessness / movement (0.0-1.0) ──
    movement_score_raw = sum(
        1.0 if l.movement_level in ("moderate", "high") else 0.5 if l.movement_level == "low" else 0
        for l in logs
    ) / len(logs)
    movement_component = min(max(movement_score_raw, 0.0), 1.0)

    # ── Component 3: Lying time increase (0.0-1.0) ──
    lying_count = sum(1 for l in logs if l.sow_posture in ("sleeping", "sow-sleep", "sow-sleep-lactate", "lying"))
    lying_ratio = lying_count / len(logs)
    # Pre-farrowing sows spend >60% lying; component rises above 30%
    lying_component = min(max(0.0, (lying_ratio - 0.3) / 0.4), 1.0)

    # ── Component 4: Feeding reduction (0.0-1.0) ──
    feeding_count = sum(1 for l in logs if l.is_feeding)
    feeding_ratio = feeding_count / len(logs)
    # Lower feeding = higher likelihood; if <15% feeding this component ramps up.
    feeding_component = min(max(0.0, (1 - feeding_ratio / 0.15)), 1.0) if feeding_ratio < 0.15 else 0.0

    # ── Component 5: Nesting score (0.0-1.0) from latest behavior_log detection_data ──
    latest_log_result = await db.execute(
        select(BehaviorLog)
        .where(and_(BehaviorLog.pen_id == pen_id, BehaviorLog.is_archived == False, BehaviorLog.logged_at >= since))
        .order_by(BehaviorLog.logged_at.desc())
        .limit(2)
    )
    recent_two_logs = latest_log_result.scalars().all()
    latest_log = recent_two_logs[0] if recent_two_logs else None
    prev_log = recent_two_logs[1] if len(recent_two_logs) > 1 else None

    latest_detection_data = _parse_detection_data(latest_log.detection_data if latest_log else None)
    prev_detection_data = _parse_detection_data(prev_log.detection_data if prev_log else None)

    nesting_score_component = float(latest_detection_data.get("nesting_score", 0.0) or 0.0)
    nesting_score_component = min(max(nesting_score_component, 0.0), 1.0)
    nesting_phase = str(latest_detection_data.get("nesting_phase", "calm") or "calm")
    previous_nesting_phase = str(prev_detection_data.get("nesting_phase", "calm") or "calm")
    transitions_per_hour_from_data = float(latest_detection_data.get("transitions_per_hour", 0.0) or 0.0)

    # ── Final composite score (0-100) ──
    behavioral_score = int(round(
        (
            posture_component * 0.20
            + movement_component * 0.20
            + lying_component * 0.15
            + feeding_component * 0.20
            + nesting_score_component * 0.25
        ) * 100
    ))
    
    # ── Delayed Farrowing Calendar Bonus ──
    sow_result = await db.execute(
        select(Sow).where(and_(Sow.pen_id == pen_id, Sow.status.in_(['pregnant', 'overdue_watch', 'farrowing'])))
    )
    sow = sow_result.scalar_one_or_none()
    
    calendar_bonus = 0
    if sow and sow.expected_farrowing_date:
        today = datetime.utcnow().date()
        exp_date = sow.expected_farrowing_date.date() if isinstance(sow.expected_farrowing_date, datetime) else sow.expected_farrowing_date
        days_overdue = max(0, (today - exp_date).days)
        calendar_bonus = min(30, days_overdue * 10)  # +10 per overdue day, cap at 30
        
    score = min(100, max(0, behavioral_score + calendar_bonus))

    # Nursing presence decreases likelihood
    nursing_ratio = sum(1 for l in logs if l.is_nursing) / len(logs)
    sleeping_ratio = sum(1 for l in logs if l.is_sleeping) / len(logs)

    # Adjust: active nursing sows are less likely pre-farrowing
    if nursing_ratio > 0.3:
        score = max(0, score - int(nursing_ratio * 20))

    if score >= 70:
        likelihood = "High"
        expected_window_hours = 6
    elif score >= 40:
        likelihood = "Moderate"
        expected_window_hours = 12
    else:
        likelihood = "Low"
        expected_window_hours = 24

    likelihood_note = None
    if nesting_phase == "active_nesting" and score >= 60:
        likelihood = "High"
        likelihood_note = "Active nesting behavior detected — farrowing likely within 12h"
    elif nesting_phase == "early_nesting" and likelihood == "Low":
        likelihood = "Moderate"

    # ── Alert generation: if score >= 70 (configurable threshold) ──
    alert_threshold = 70
    alerts_to_add = []
    if score >= alert_threshold:
        # Check if we already have a recent farrowing likelihood alert for this pen
        recent_alert = await db.execute(
            select(Alert)
            .where(and_(
                Alert.pen_id == pen_id,
                Alert.type == "farrowing_likelihood",
                Alert.is_resolved == False,
                Alert.created_at >= datetime.utcnow() - timedelta(hours=2),
            ))
        )
        if not recent_alert.scalar_one_or_none():
            from app.models.pig import Alert as AlertModel
            alerts_to_add.append(AlertModel(
                type="farrowing_likelihood",
                severity="high" if score >= 85 else "medium",
                title=f"High Farrowing Likelihood — Pen {pen_id}",
                message=(
                    f"Farrowing likelihood score is {score}/100. "
                    f"Posture changes: {changes_per_hour:.1f}/hr, Restlessness: {movement_score_raw:.2f}. "
                    f"Expected within ~{expected_window_hours} hours."
                ),
                pen_id=pen_id,
            ))

    # ── Alert rule: nesting onset (cooldown 4h) ──
    if (
        previous_nesting_phase in ("calm", "mild_restlessness")
        and nesting_phase in ("early_nesting", "active_nesting")
    ):
        recent_nesting_onset_alert = await db.execute(
            select(Alert)
            .where(and_(
                Alert.pen_id == pen_id,
                Alert.type == "nesting_onset",
                Alert.is_resolved == False,
                Alert.created_at >= datetime.utcnow() - timedelta(hours=4),
            ))
        )
        if not recent_nesting_onset_alert.scalar_one_or_none():
            from app.models.pig import Alert as AlertModel
            alerts_to_add.append(AlertModel(
                type="nesting_onset",
                severity="medium",
                title=f"Nesting Behavior Detected — Pen {pen_id}",
                message=(
                    f"Nesting behavior detected in Pen {pen_id}. "
                    f"Farrowing may begin within 12-24 hours. "
                    f"(Jensen 1993: nesting onset is primary pre-farrowing indicator)"
                ),
                pen_id=pen_id,
            ))

    # ── Alert rule: active nesting intensity (cooldown 2h) ──
    if nesting_phase == "active_nesting" and transitions_per_hour_from_data > 12:
        recent_active_nesting_alert = await db.execute(
            select(Alert)
            .where(and_(
                Alert.pen_id == pen_id,
                Alert.type == "active_nesting",
                Alert.is_resolved == False,
                Alert.created_at >= datetime.utcnow() - timedelta(hours=2),
            ))
        )
        if not recent_active_nesting_alert.scalar_one_or_none():
            from app.models.pig import Alert as AlertModel
            alerts_to_add.append(AlertModel(
                type="active_nesting",
                severity="high",
                title=f"Intense Nesting Activity — Pen {pen_id}",
                message=(
                    f"Intense nesting activity in Pen {pen_id}. "
                    f"Farrowing expected within 12 hours. "
                    f"Prepare farrowing supplies and increase monitoring frequency."
                ),
                pen_id=pen_id,
            ))

    if alerts_to_add:
        db.add_all(alerts_to_add)
        await db.commit()

    return {
        "pen_id": pen_id,
        "score": score,
        "likelihood": likelihood,
        "note": likelihood_note,
        "expected_window_hours": expected_window_hours,
        "changes_per_hour": round(changes_per_hour, 2),
        "nursing_ratio": round(nursing_ratio, 2),
        "sleeping_ratio": round(sleeping_ratio, 2),
        "feeding_ratio": round(feeding_ratio, 2),
        "lying_ratio": round(lying_ratio, 2),
        "restlessness_index": round(movement_score_raw, 2),
        "period_hours": hours,
        "components": {
            "posture_switching": round(posture_component * 100, 1),
            "movement": round(movement_component * 100, 1),
            "lying_time": round(lying_component * 100, 1),
            "feeding_reduction": round(feeding_component * 100, 1),
            "nesting_score": round(nesting_score_component * 100, 1),
        },
    }


@router.get("/farrowing-likelihood-trend/{pen_id}")
async def get_farrowing_likelihood_trend(
    pen_id: int,
    hours: int = Query(default=48, ge=6, le=168, description="Total trend window in hours"),
    interval_hours: int = Query(default=2, ge=1, le=12, description="Bucket interval in hours"),
    db: AsyncSession = Depends(get_db)
):
    """
    Return farrowing likelihood scores over time for trend visualization.
    Buckets behavior logs into intervals and computes a score per bucket.
    """
    now = datetime.utcnow()
    since = now - timedelta(hours=hours)

    result = await db.execute(
        select(BehaviorLog)
        .where(and_(BehaviorLog.pen_id == pen_id, BehaviorLog.is_archived == False, BehaviorLog.logged_at >= since))
        .order_by(BehaviorLog.logged_at.asc())
    )
    logs = result.scalars().all()

    if not logs:
        return {"pen_id": pen_id, "trend": [], "period_hours": hours, "interval_hours": interval_hours}

    # Bucket logs into intervals
    trend = []
    bucket_start = since
    while bucket_start < now:
        bucket_end = bucket_start + timedelta(hours=interval_hours)
        bucket_logs = [l for l in logs if bucket_start <= l.logged_at < bucket_end]

        if bucket_logs:
            # Compute simplified score for this bucket
            posture_changes = 0
            for prev, curr in zip(bucket_logs, bucket_logs[1:]):
                if prev.sow_posture != curr.sow_posture:
                    posture_changes += 1
            span = max((bucket_logs[-1].logged_at - bucket_logs[0].logged_at).total_seconds() / 3600, 0.1)
            cph = posture_changes / span

            mvmt = sum(
                1.0 if l.movement_level in ("moderate", "high") else 0.5 if l.movement_level == "low" else 0
                for l in bucket_logs
            ) / len(bucket_logs)

            lying = sum(1 for l in bucket_logs if l.sow_posture in ("sleeping", "sow-sleep", "sow-sleep-lactate", "lying")) / len(bucket_logs)
            feeding = sum(1 for l in bucket_logs if l.is_feeding) / len(bucket_logs)
            nursing = sum(1 for l in bucket_logs if l.is_nursing) / len(bucket_logs)

            ps = min(30, (cph / 20) * 30)
            ms = min(20, mvmt * 20)
            ls = min(20, max(0, (lying - 0.3) / 0.4) * 20)
            fs = min(15, max(0, (1 - feeding / 0.15)) * 15) if feeding < 0.15 else 0
            sc = int(round(ps + ms + ls + fs))
            if nursing > 0.3:
                sc = max(0, sc - int(nursing * 20))
            sc = max(0, min(100, sc))

            trend.append({
                "timestamp": bucket_start.isoformat(),
                "score": sc,
                "changes_per_hour": round(cph, 2),
                "restlessness": round(mvmt, 2),
                "lying_ratio": round(lying, 2),
                "log_count": len(bucket_logs),
            })
        else:
            trend.append({
                "timestamp": bucket_start.isoformat(),
                "score": None,
                "changes_per_hour": None,
                "restlessness": None,
                "lying_ratio": None,
                "log_count": 0,
            })

        bucket_start = bucket_end

    return {"pen_id": pen_id, "trend": trend, "period_hours": hours, "interval_hours": interval_hours}


@router.get("/health-summary")
async def get_health_summary(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db)
):
    """
    Get health summary across all pens for dashboard.
    Identifies pens that may need attention based on behavior patterns.
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    
    # Get all pens with recent behavior logs
    result = await db.execute(
        select(
            BehaviorLog.pen_id,
            func.avg(BehaviorLog.crushing_risk).label('avg_risk'),
            func.avg(BehaviorLog.health_score).label('avg_health_score'),
            func.count(BehaviorLog.id).label('log_count')
        )
        .where(and_(BehaviorLog.logged_at >= since, BehaviorLog.is_archived == False))
        .group_by(BehaviorLog.pen_id)
    )
    
    summaries = []
    for row in result:
        log_count = row.log_count or 0
        summaries.append({
            'pen_id': row.pen_id,
            'avg_crushing_risk': round(row.avg_risk or 0, 3),
            'avg_health_score': round(row.avg_health_score or 0, 1),
            'total_logs': log_count,
            'needs_attention': (row.avg_risk or 0) > 0.6,
        })
    
    # Sort by risk (highest first - needs attention)
    summaries.sort(key=lambda x: x['avg_crushing_risk'], reverse=True)
    
    return {
        'period_hours': hours,
        'pens': summaries,
        'pens_needing_attention': sum(1 for s in summaries if s['needs_attention']),
        'total_pens': len(summaries),
    }


@router.get("/pen-environment/{pen_id}")
async def get_pen_environment_status(
    pen_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get current environment status (cleanliness, wetness) for a pen.
    This is calculated based on cleaning task history and time decay.
    """
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    
    now = datetime.utcnow()
    
    # Calculate current scores based on time since last cleaning
    if pen.last_cleaned_at:
        hours_since_cleaned = (now - pen.last_cleaned_at).total_seconds() / 3600
        interval = pen.cleaning_interval_hours or 24
        
        # Calculate decay factor (0 at cleaning, 1 at interval)
        decay_factor = min(hours_since_cleaned / interval, 1.5)
        
        # Cleanliness decays over time
        cleanliness = max(0.0, 1.0 - (decay_factor ** 1.2))
        
        # Wetness increases over time
        wetness = min(1.0, decay_factor * 0.7)
    else:
        # No cleaning history - use stored values or defaults
        cleanliness = pen.cleanliness_score if pen.cleanliness_score is not None else 0.5
        wetness = pen.wetness_score if pen.wetness_score is not None else 0.5
        hours_since_cleaned = None
    
    # Determine if cleaning is needed
    is_overdue = pen.next_cleaning_due and pen.next_cleaning_due < now
    needs_cleaning = is_overdue or cleanliness < 0.4 or wetness > 0.6
    
    return {
        "pen_id": pen.id,
        "pen_name": pen.name,
        "cleanliness_score": round(cleanliness, 3),
        "wetness_score": round(wetness, 3),
        "last_cleaned_at": pen.last_cleaned_at.isoformat() if pen.last_cleaned_at else None,
        "next_cleaning_due": pen.next_cleaning_due.isoformat() if pen.next_cleaning_due else None,
        "hours_since_cleaned": round(hours_since_cleaned, 1) if hours_since_cleaned else None,
        "cleaning_interval_hours": pen.cleaning_interval_hours or 24,
        "is_overdue": is_overdue,
        "needs_cleaning": needs_cleaning,
        "status": "critical" if cleanliness < 0.3 else ("warning" if needs_cleaning else "ok")
    }
