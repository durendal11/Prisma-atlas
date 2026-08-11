from app.api.websocket import ws_manager
import asyncio
import json
import logging
from datetime import datetime, date, timedelta, timezone

from sqlalchemy import select, and_, or_, desc, func
from app.core.database import AsyncSessionLocal
from app.models.pig import Sow, Alert, Event, Task, TaskTemplate, BehaviorLog
from app.core.firebase import broadcast_alert

logger = logging.getLogger(__name__)

async def get_or_create_induction_template(db):
    result = await db.execute(select(TaskTemplate).where(TaskTemplate.name == 'pre_induction_checklist'))
    template = result.scalar_one_or_none()
    
    if not template:
        checklist = [
            {"step": "Verify recorded breeding date with records", "required": True},
            {"step": "Confirm sow is eating normally", "required": True},
            {"step": "Assess sow locomotion (no lameness)", "required": True},
            {"step": "Check udder development (firm, filling with milk)", "required": True},
            {"step": "Attempt milk letdown from front teats", "required": True},
            {"step": "Check vulva (swollen, discharge)", "required": True},
            {"step": "Contact veterinarian to discuss prostaglandin induction", "required": True},
            {"step": "Document no induction administered without vet instruction", "required": True},
            {"step": "Document all findings", "required": True}
        ]
        template = TaskTemplate(
            name='pre_induction_checklist',
            description='Pre-Induction Checklist for overdue farrowing',
            category='health',
            priority='high',
            checklist_items=json.dumps(checklist)
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        
    return template

async def check_compound_risk(sow: Sow, db) -> bool:
    if not sow.pen_id:
        return False
        
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    result = await db.execute(
        select(BehaviorLog)
        .where(
            BehaviorLog.pen_id == sow.pen_id,
            BehaviorLog.logged_at >= two_hours_ago
        )
        .order_by(desc(BehaviorLog.logged_at))
    )
    logs = result.scalars().all()
    
    if not logs:
        return False
        
    total_logs = len(logs)
    standing_count = sum(1 for log in logs if log.sow_posture == 'standing')
    not_feeding_count = sum(1 for log in logs if not log.is_feeding)
    
    is_standing_mostly = (standing_count / total_logs) > 0.60
    is_not_feeding = (not_feeding_count / total_logs) > 0.80
    
    # Check if last 3 consecutive logs have health_score < 50
    health_issues = False
    if total_logs >= 3:
        health_issues = all(hasattr(log, 'health_score') and log.health_score is not None and log.health_score < 50 for log in logs[:3])
    
    return is_standing_mostly and is_not_feeding and health_issues

async def handle_tier1_watch(sow: Sow, db):
    sow.status = 'overdue_watch'
    sow.intensified_monitoring = True
    
    alert = Alert(
        type='delayed_farrowing',
        severity='low',
        title='Overdue Watch Started',
        message=f'Sow {sow.tag_id} has not farrowed on expected date. Monitoring intensified.',
        sow_id=sow.id,
        pen_id=sow.pen_id
    )
    
    event = Event(
        sow_id=sow.id,
        pen_id=sow.pen_id,
        type='overdue_watch_started',
        category='farrowing',
        description=f'Sow {sow.tag_id} entered overdue watch.',
        timestamp=datetime.now(timezone.utc)
    )
    
    db.add(alert)
    db.add(event)
    await db.commit()
    await db.refresh(alert)
    await broadcast_alert(
        title=alert.title,
        body=alert.message,
        alert_type=alert.type,
        pen_id=alert.pen_id,
        severity=alert.severity
    )
    alert_message = {
        "type": "alert",
        "data": {
            "id": alert.id,
            "type": alert.type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "pen_id": alert.pen_id,
            "timestamp": alert.created_at.isoformat() if hasattr(alert, 'created_at') and alert.created_at else None
        }
    }
    await ws_manager.broadcast(alert_message)
    logger.info(f"Tier 1 (Watch) triggered for sow {sow.tag_id}")

async def handle_tier2_action(sow: Sow, db):
    sow.status = 'overdue_watch'
    
    is_compound_risk = await check_compound_risk(sow, db)
    severity = 'critical' if is_compound_risk else 'high'
    message_append = " BEHAVIORAL COMPOUND RISK DETECTED." if is_compound_risk else ""
    
    alert = Alert(
        type='delayed_farrowing_action',
        severity=severity,
        title='Induction Eligible',
        message=f'Sow {sow.tag_id} is 2 days past expected farrowing date. Prostaglandin induction eligible. Contact veterinarian.{message_append}',
        sow_id=sow.id,
        pen_id=sow.pen_id
    )
    
    event = Event(
        sow_id=sow.id,
        pen_id=sow.pen_id,
        type='induction_eligible',
        category='farrowing',
        description=f'Sow {sow.tag_id} is eligible for pre-induction checks.',
        timestamp=datetime.now(timezone.utc)
    )
    
    template = await get_or_create_induction_template(db)
    
    task = Task(
        title=f"Pre-Induction Checklist - {sow.tag_id}",
        description="Verify sow readiness before contacting vet for induction.",
        category="health",
        priority="high",
        template_id=template.id,
        sow_id=sow.id,
        pen_id=sow.pen_id,
        due_date=datetime.now(timezone.utc) + timedelta(hours=4),
        checklist_items=template.checklist_items
    )
    
    db.add(alert)
    db.add(event)
    db.add(task)
    await db.commit()
    await db.refresh(alert)
    await broadcast_alert(
        title=alert.title,
        body=alert.message,
        alert_type=alert.type,
        pen_id=alert.pen_id,
        severity=alert.severity
    )
    alert_message = {
        "type": "alert",
        "data": {
            "id": alert.id,
            "type": alert.type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "pen_id": alert.pen_id,
            "timestamp": alert.created_at.isoformat() if hasattr(alert, 'created_at') and alert.created_at else None
        }
    }
    await ws_manager.broadcast(alert_message)
    logger.info(f"Tier 2 (Action) triggered for sow {sow.tag_id}")

async def handle_tier3_critical(sow: Sow, days_overdue: int, db):
    sow.status = 'overdue_watch'
    sow.prolonged_gestation = True
    
    cutoff = datetime.now(timezone.utc) - timedelta(hours=23)
    
    # Use general date fallback since Alert might not have created_at directly
    # In pig-ai-watch Alert often relies on id matching timeline if created_at absent, 
    # but we will just query via the ORM safely using a limit to check recent
    # Usually Alerts have timestamp or created_at. We'll fetch the latest one.
    recent_query = await db.execute(
        select(Alert)
        .where(
            Alert.sow_id == sow.id,
            Alert.type == 'prolonged_gestation_critical'
        )
        .order_by(desc(Alert.id))
        .limit(1)
    )
    recent_alert = recent_query.scalar_one_or_none()
    
    # Simplified cooldown check assuming an auto-incrementing ID and roughly evaluating it, 
    # or just checking if created recently (this is an approximation if created_at is missing).
    has_recent = False
    if recent_alert:
        # Avoid firing twice exactly within same hour execution
        has_recent = True 
        # Optionally add true time check if `created_at` or `timestamp` exists on Alert model
        if hasattr(recent_alert, 'created_at') and recent_alert.created_at:
            has_recent = recent_alert.created_at.replace(tzinfo=timezone.utc) >= cutoff
    
    if has_recent:
        return
        
    alert = Alert(
        type='prolonged_gestation_critical',
        severity='critical',
        title='Prolonged Gestation',
        message=f'Sow {sow.tag_id} is {days_overdue} days past expected date. Prolonged gestation — elevated stillbirth risk. Immediate veterinary contact required.',
        sow_id=sow.id,
        pen_id=sow.pen_id
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    await broadcast_alert(
        title=alert.title,
        body=alert.message,
        alert_type=alert.type,
        pen_id=alert.pen_id,
        severity=alert.severity
    )
    alert_message = {
        "type": "alert",
        "data": {
            "id": alert.id,
            "type": alert.type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "pen_id": alert.pen_id,
            "timestamp": alert.created_at.isoformat() if hasattr(alert, 'created_at') and alert.created_at else None
        }
    }
    await ws_manager.broadcast(alert_message)
    logger.info(f"Tier 3 (Critical) triggered for sow {sow.tag_id}")

async def run_checker():
    """Main function to periodically check for delayed farrowings."""
    async with AsyncSessionLocal() as db:
        sows = await db.execute(select(Sow).where(Sow.status.in_(['pregnant', 'overdue_watch'])))
        for sow in sows.scalars().all():
            if not sow.expected_farrowing_date:
                continue
                
            expected_date = sow.expected_farrowing_date.date() if isinstance(sow.expected_farrowing_date, datetime) else sow.expected_farrowing_date
            days_overdue = (date.today() - expected_date).days
            
            if days_overdue <= 0:
                if sow.status == 'overdue_watch' or sow.intensified_monitoring or sow.prolonged_gestation:
                    sow.status = 'pregnant'
                    sow.intensified_monitoring = False
                    sow.prolonged_gestation = False
                    await db.commit()
            elif days_overdue == 1:
                if not sow.intensified_monitoring:
                    await handle_tier1_watch(sow, db)
            elif days_overdue == 2:
                existing_task = await db.execute(select(Task).where(Task.sow_id == sow.id, Task.title.like('Pre-Induction Checklist%')))
                if not existing_task.scalar_one_or_none():
                    await handle_tier2_action(sow, db)
            elif days_overdue >= 3:
                await handle_tier3_critical(sow, days_overdue, db)

async def delayed_farrowing_task_loop():
    logger.info("Delayed farrowing checker loop started")
    while True:
        try:
            await run_checker()
        except Exception as e:
            logger.error(f"Error in delayed farrowing checker: {e}")
        await asyncio.sleep(3600)  # Check every hour
