"""
Task Management API - Workflow automation and task assignment
Similar to PigFlow's task management for farrowing care
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from typing import List, Optional
import json
import logging

from app.core.database import get_db
from app.models.pig import Task, TaskTemplate, Sow, Pen, WorkflowRule
from app.models.user import User
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ============================================================================
# TASK CRUD OPERATIONS
# ============================================================================

@router.get("/")
async def get_tasks(
    status: Optional[str] = Query(None, description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    assigned_to: Optional[int] = Query(None, description="Filter by assignee"),
    sow_id: Optional[int] = Query(None, description="Filter by sow"),
    pen_id: Optional[int] = Query(None, description="Filter by pen"),
    due_today: bool = Query(False, description="Only tasks due today"),
    overdue: bool = Query(False, description="Only overdue tasks"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Get tasks with optional filters"""
    query = select(Task)
    
    filters = []
    if status:
        filters.append(Task.status == status)
    if category:
        filters.append(Task.category == category)
    if priority:
        filters.append(Task.priority == priority)
    if assigned_to:
        filters.append(Task.assigned_to == assigned_to)
    if sow_id:
        filters.append(Task.sow_id == sow_id)
    if pen_id:
        filters.append(Task.pen_id == pen_id)
    
    if due_today:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        filters.append(and_(Task.due_date >= today_start, Task.due_date < today_end))
    
    if overdue:
        filters.append(and_(
            Task.due_date < datetime.utcnow(),
            Task.status.in_(["pending", "in_progress"])
        ))
    
    if filters:
        query = query.where(and_(*filters))
    
    query = query.order_by(Task.due_date.asc(), Task.priority.desc()).limit(limit)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [task_to_dict(task) for task in tasks]


@router.get("/my-tasks")
async def get_my_tasks(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tasks assigned to current user"""
    query = select(Task).where(Task.assigned_to == current_user.id)
    
    if status:
        query = query.where(Task.status == status)
    else:
        query = query.where(Task.status.in_(["pending", "in_progress"]))
    
    query = query.order_by(Task.due_date.asc(), Task.priority.desc())
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [task_to_dict(task) for task in tasks]


@router.get("/dashboard-summary")
async def get_task_dashboard(db: AsyncSession = Depends(get_db)):
    """Get task statistics for dashboard"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)
    
    # Count by status
    status_counts = {}
    for status in ["pending", "in_progress", "completed", "overdue"]:
        if status == "overdue":
            count_result = await db.execute(
                select(func.count(Task.id)).where(and_(
                    Task.due_date < now,
                    Task.status.in_(["pending", "in_progress"])
                ))
            )
        else:
            count_result = await db.execute(
                select(func.count(Task.id)).where(Task.status == status)
            )
        status_counts[status] = count_result.scalar() or 0
    
    # Due today
    due_today_result = await db.execute(
        select(func.count(Task.id)).where(and_(
            Task.due_date >= today_start,
            Task.due_date < today_end,
            Task.status.in_(["pending", "in_progress"])
        ))
    )
    
    # Due this week
    due_week_result = await db.execute(
        select(func.count(Task.id)).where(and_(
            Task.due_date >= today_start,
            Task.due_date < week_end,
            Task.status.in_(["pending", "in_progress"])
        ))
    )
    
    # High priority pending
    high_priority_result = await db.execute(
        select(func.count(Task.id)).where(and_(
            Task.priority.in_(["high", "critical"]),
            Task.status.in_(["pending", "in_progress"])
        ))
    )
    
    # Completed today
    completed_today_result = await db.execute(
        select(func.count(Task.id)).where(and_(
            Task.completed_at >= today_start,
            Task.status == "completed"
        ))
    )
    
    return {
        "status_counts": status_counts,
        "due_today": due_today_result.scalar() or 0,
        "due_this_week": due_week_result.scalar() or 0,
        "high_priority": high_priority_result.scalar() or 0,
        "completed_today": completed_today_result.scalar() or 0,
        "total_pending": status_counts["pending"] + status_counts["in_progress"]
    }


# ============================================================================
# CLEANING SCHEDULE ROUTES (must be before /{task_id} to avoid route conflicts)
# ============================================================================

@router.get("/cleaning-schedule")
async def get_cleaning_schedule(
    db: AsyncSession = Depends(get_db)
):
    """
    Get cleaning schedule for all pens with current environment status.
    Returns pens sorted by next cleaning due date.
    """
    result = await db.execute(
        select(Pen).where(Pen.is_active == True).order_by(Pen.next_cleaning_due.asc().nullsfirst())
    )
    pens = result.scalars().all()
    
    now = datetime.utcnow()
    schedule = []
    
    for pen in pens:
        # Calculate current environment scores based on decay
        if pen.last_cleaned_at:
            cleanliness, wetness = calculate_pen_environment_decay(
                pen.last_cleaned_at,
                pen.cleaning_interval_hours or 24
            )
        else:
            cleanliness = pen.cleanliness_score or 0.5
            wetness = pen.wetness_score or 0.5
        
        # Handle timezone-aware datetimes for comparison
        next_due = pen.next_cleaning_due
        if next_due and next_due.tzinfo is not None:
            next_due = next_due.replace(tzinfo=None)
        
        # Determine status
        is_overdue = next_due and next_due < now
        hours_until_due = None
        if next_due:
            hours_until_due = (next_due - now).total_seconds() / 3600
        
        schedule.append({
            "pen_id": pen.id,
            "pen_name": pen.name,
            "location": pen.location,
            "cleanliness_score": round(cleanliness, 2),
            "wetness_score": round(wetness, 2),
            "last_cleaned_at": pen.last_cleaned_at.isoformat() if pen.last_cleaned_at else None,
            "next_cleaning_due": pen.next_cleaning_due.isoformat() if pen.next_cleaning_due else None,
            "cleaning_interval_hours": pen.cleaning_interval_hours or 24,
            "is_overdue": is_overdue,
            "hours_until_due": round(hours_until_due, 1) if hours_until_due else None,
            "status": "overdue" if is_overdue else ("due_soon" if hours_until_due and hours_until_due < 4 else "ok")
        })
    
    # Count statistics
    overdue_count = sum(1 for p in schedule if p["is_overdue"])
    due_soon_count = sum(1 for p in schedule if p["status"] == "due_soon")
    
    return {
        "schedule": schedule,
        "summary": {
            "total_pens": len(schedule),
            "overdue_count": overdue_count,
            "due_soon_count": due_soon_count,
            "needs_attention": overdue_count + due_soon_count
        }
    }


@router.get("/cleaning-schedule/{pen_id}")
async def get_pen_cleaning_status(
    pen_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed cleaning status for a specific pen."""
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    
    now = datetime.utcnow()
    
    # Calculate current environment scores
    if pen.last_cleaned_at:
        cleanliness, wetness = calculate_pen_environment_decay(
            pen.last_cleaned_at,
            pen.cleaning_interval_hours or 24
        )
        # Handle timezone-aware datetimes
        last_cleaned = pen.last_cleaned_at
        if last_cleaned.tzinfo is not None:
            last_cleaned = last_cleaned.replace(tzinfo=None)
        hours_since_cleaned = (now - last_cleaned).total_seconds() / 3600
    else:
        cleanliness = 0.5
        wetness = 0.5
        hours_since_cleaned = None
    
    # Get pending cleaning tasks for this pen
    tasks_result = await db.execute(
        select(Task).where(and_(
            Task.pen_id == pen_id,
            Task.category == "cleaning",
            Task.status.in_(["pending", "in_progress"])
        )).order_by(Task.due_date.asc())
    )
    pending_tasks = tasks_result.scalars().all()
    
    # Get recent completed cleaning tasks
    recent_result = await db.execute(
        select(Task).where(and_(
            Task.pen_id == pen_id,
            Task.category == "cleaning",
            Task.status == "completed"
        )).order_by(Task.completed_at.desc()).limit(5)
    )
    recent_completed = recent_result.scalars().all()
    
    return {
        "pen_id": pen.id,
        "pen_name": pen.name,
        "current_status": {
            "cleanliness_score": round(cleanliness, 3),
            "wetness_score": round(wetness, 3),
            "hours_since_cleaned": round(hours_since_cleaned, 1) if hours_since_cleaned else None,
            "last_cleaned_at": pen.last_cleaned_at.isoformat() if pen.last_cleaned_at else None,
            "next_cleaning_due": pen.next_cleaning_due.isoformat() if pen.next_cleaning_due else None,
            "cleaning_interval_hours": pen.cleaning_interval_hours or 24
        },
        "pending_tasks": [task_to_dict(t) for t in pending_tasks],
        "recent_completed": [task_to_dict(t) for t in recent_completed]
    }


@router.post("/cleaning-schedule/{pen_id}/create-task")
async def create_cleaning_task_for_pen(
    pen_id: int,
    task_data: dict = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a cleaning task for a specific pen."""
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    
    task_data = task_data or {}
    
    # Default due date is the pen's next cleaning due, or now + interval
    due_date = pen.next_cleaning_due
    if not due_date:
        due_date = datetime.utcnow() + timedelta(hours=pen.cleaning_interval_hours or 24)
    
    if task_data.get("due_date"):
        due_date = datetime.fromisoformat(task_data["due_date"])
    
    # Default checklist for cleaning tasks
    default_checklist = [
        {"step": "Remove soiled bedding", "required": True, "completed": False},
        {"step": "Clean floor and walls", "required": True, "completed": False},
        {"step": "Disinfect surfaces", "required": True, "completed": False},
        {"step": "Add fresh bedding", "required": True, "completed": False},
        {"step": "Check and clean water supply", "required": True, "completed": False},
        {"step": "Check and clean feed area", "required": False, "completed": False},
        {"step": "Inspect for damage/repairs needed", "required": False, "completed": False}
    ]
    
    task = Task(
        title=task_data.get("title", f"Clean Pen {pen.name}"),
        description=task_data.get("description", f"Scheduled cleaning for pen {pen.name}"),
        category="cleaning",
        priority=task_data.get("priority", "medium"),
        status="pending",
        pen_id=pen.id,
        assigned_to=task_data.get("assigned_to"),
        created_by=current_user.id,
        due_date=due_date,
        scheduled_date=due_date,
        checklist_items=json.dumps(task_data.get("checklist_items", default_checklist))
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    logger.info(f"Cleaning task created for pen {pen.name}, due: {due_date}")
    return task_to_dict(task)


@router.put("/cleaning-schedule/{pen_id}/interval")
async def update_pen_cleaning_interval(
    pen_id: int,
    interval_data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Update the cleaning interval for a pen."""
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    
    new_interval = interval_data.get("cleaning_interval_hours")
    if not new_interval or new_interval < 1:
        raise HTTPException(status_code=400, detail="Invalid interval. Must be at least 1 hour.")
    
    pen.cleaning_interval_hours = new_interval
    
    # Recalculate next due date if there's a last cleaned time
    if pen.last_cleaned_at:
        pen.next_cleaning_due = pen.last_cleaned_at + timedelta(hours=new_interval)
    
    await db.commit()
    await db.refresh(pen)
    
    return {
        "message": f"Cleaning interval updated for pen {pen.name}",
        "pen_id": pen.id,
        "cleaning_interval_hours": pen.cleaning_interval_hours,
        "next_cleaning_due": pen.next_cleaning_due.isoformat() if pen.next_cleaning_due else None
    }


@router.post("/cleaning-schedule/{pen_id}/mark-cleaned")
async def mark_pen_as_cleaned(
    pen_id: int,
    clean_data: dict = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually mark a pen as cleaned without completing a task.
    Useful for quick updates or when cleaning was done without a formal task.
    """
    result = await db.execute(select(Pen).where(Pen.id == pen_id))
    pen = result.scalar_one_or_none()
    
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    
    now = datetime.utcnow()
    clean_data = clean_data or {}
    
    pen.cleanliness_score = 1.0
    pen.wetness_score = 0.0
    pen.last_cleaned_at = now
    
    # Update interval if provided
    if clean_data.get("cleaning_interval_hours"):
        pen.cleaning_interval_hours = clean_data["cleaning_interval_hours"]
    
    pen.next_cleaning_due = now + timedelta(hours=pen.cleaning_interval_hours or 24)
    
    await db.commit()
    await db.refresh(pen)
    
    logger.info(f"Pen {pen.name} manually marked as cleaned")
    
    return {
        "message": f"Pen {pen.name} marked as cleaned",
        "pen_id": pen.id,
        "cleanliness_score": pen.cleanliness_score,
        "wetness_score": pen.wetness_score,
        "last_cleaned_at": pen.last_cleaned_at.isoformat(),
        "next_cleaning_due": pen.next_cleaning_due.isoformat()
    }


# ============================================================================
# TASK CRUD OPERATIONS
# ============================================================================

@router.get("/{task_id}")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific task by ID"""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task_to_dict(task)


@router.post("/")
async def create_task(
    task_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new task"""
    task = Task(
        title=task_data["title"],
        description=task_data.get("description"),
        category=task_data.get("category", "general"),
        priority=task_data.get("priority", "medium"),
        status="pending",
        template_id=task_data.get("template_id"),
        sow_id=task_data.get("sow_id"),
        pen_id=task_data.get("pen_id"),
        assigned_to=task_data.get("assigned_to"),
        created_by=current_user.id,
        due_date=datetime.fromisoformat(task_data["due_date"]) if task_data.get("due_date") else None,
        scheduled_date=datetime.fromisoformat(task_data["scheduled_date"]) if task_data.get("scheduled_date") else None,
        checklist_items=json.dumps(task_data.get("checklist_items", [])),
        notes=task_data.get("notes")
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    logger.info(f"Task created: {task.title} (ID: {task.id})")
    return task_to_dict(task)


@router.put("/{task_id}")
async def update_task(
    task_id: int,
    task_data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Update a task"""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update fields
    for field in ["title", "description", "category", "priority", "status", 
                  "assigned_to", "notes", "completion_notes"]:
        if field in task_data:
            setattr(task, field, task_data[field])
    
    if "due_date" in task_data:
        task.due_date = datetime.fromisoformat(task_data["due_date"]) if task_data["due_date"] else None
    
    if "checklist_items" in task_data:
        task.checklist_items = json.dumps(task_data["checklist_items"])
        # Calculate progress
        items = task_data["checklist_items"]
        if items:
            completed = sum(1 for item in items if item.get("completed", False))
            task.checklist_progress = (completed / len(items)) * 100
    
    # Handle status changes
    if task_data.get("status") == "in_progress" and not task.started_at:
        task.started_at = datetime.utcnow()
    elif task_data.get("status") == "completed" and not task.completed_at:
        task.completed_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(task)
    
    return task_to_dict(task)


@router.post("/{task_id}/start")
async def start_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Mark a task as in progress"""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task.status = "in_progress"
    task.started_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(task)
    
    return task_to_dict(task)


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: int,
    completion_data: dict = None,
    db: AsyncSession = Depends(get_db)
):
    """Mark a task as completed. For cleaning tasks, this updates pen cleanliness and schedules next cleaning."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task.status = "completed"
    task.completed_at = datetime.utcnow()
    task.checklist_progress = 100.0
    
    if completion_data:
        task.completion_notes = completion_data.get("notes")
    
    # Handle cleaning task completion - update pen environment scores
    if task.category == "cleaning" and task.pen_id:
        await handle_cleaning_task_completion(task, completion_data, db)
    
    await db.commit()
    await db.refresh(task)
    
    logger.info(f"Task completed: {task.title} (ID: {task.id})")
    return task_to_dict(task)


@router.delete("/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a task"""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.delete(task)
    await db.commit()
    
    return {"message": "Task deleted successfully"}


# ============================================================================
# TASK TEMPLATES
# ============================================================================

@router.get("/templates/")
async def get_task_templates(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get all task templates"""
    query = select(TaskTemplate).where(TaskTemplate.is_active == True)
    
    if category:
        query = query.where(TaskTemplate.category == category)
    
    result = await db.execute(query)
    templates = result.scalars().all()
    
    return [template_to_dict(t) for t in templates]


@router.post("/templates/")
async def create_task_template(
    template_data: dict,
    db: AsyncSession = Depends(get_db)
):
    """Create a new task template"""
    template = TaskTemplate(
        name=template_data["name"],
        description=template_data.get("description"),
        category=template_data["category"],
        priority=template_data.get("priority", "medium"),
        estimated_duration_minutes=template_data.get("estimated_duration_minutes", 30),
        trigger_type=template_data.get("trigger_type"),
        trigger_days_offset=template_data.get("trigger_days_offset"),
        checklist_items=json.dumps(template_data.get("checklist_items", []))
    )
    
    db.add(template)
    await db.commit()
    await db.refresh(template)
    
    return template_to_dict(template)


@router.post("/templates/{template_id}/create-task")
async def create_task_from_template(
    template_id: int,
    task_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a task from a template"""
    result = await db.execute(select(TaskTemplate).where(TaskTemplate.id == template_id))
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    task = Task(
        title=task_data.get("title", template.name),
        description=task_data.get("description", template.description),
        category=template.category,
        priority=task_data.get("priority", template.priority),
        status="pending",
        template_id=template.id,
        sow_id=task_data.get("sow_id"),
        pen_id=task_data.get("pen_id"),
        assigned_to=task_data.get("assigned_to"),
        created_by=current_user.id,
        due_date=datetime.fromisoformat(task_data["due_date"]) if task_data.get("due_date") else None,
        checklist_items=template.checklist_items,
        notes=task_data.get("notes")
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    return task_to_dict(task)


# ============================================================================
# FARROWING-SPECIFIC TASK AUTOMATION
# ============================================================================

@router.post("/generate-farrowing-tasks/{sow_id}")
async def generate_farrowing_tasks(
    sow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate farrowing-related tasks based on sow's expected farrowing date.
    Similar to PigFlow's automated task generation.
    """
    # Get sow
    result = await db.execute(select(Sow).where(Sow.id == sow_id))
    sow = result.scalar_one_or_none()
    
    if not sow:
        raise HTTPException(status_code=404, detail="Sow not found")
    if sow.is_archived:
        raise HTTPException(status_code=400, detail="Archived sows cannot generate farrowing tasks")
    
    if not sow.expected_farrowing_date:
        raise HTTPException(status_code=400, detail="Sow has no expected farrowing date set")
    
    expected_date = sow.expected_farrowing_date
    tasks_created = []
    
    # Pre-farrowing tasks (3 days before)
    pre_farrow_tasks = [
        {
            "title": f"Pre-farrowing pen preparation - {sow.tag_id}",
            "description": "Prepare farrowing pen for upcoming birth",
            "category": "farrowing",
            "priority": "high",
            "due_date": expected_date - timedelta(days=3),
            "checklist": [
                {"step": "Clean and disinfect pen", "required": True},
                {"step": "Check heating lamp working", "required": True},
                {"step": "Prepare bedding material", "required": True},
                {"step": "Check water supply", "required": True},
                {"step": "Verify feed supply", "required": True}
            ]
        },
        {
            "title": f"Sow health check pre-farrowing - {sow.tag_id}",
            "description": "Health assessment before farrowing",
            "category": "health",
            "priority": "high",
            "due_date": expected_date - timedelta(days=2),
            "checklist": [
                {"step": "Check body condition score", "required": True},
                {"step": "Observe udder development", "required": True},
                {"step": "Check for any health issues", "required": True},
                {"step": "Record temperature", "required": False}
            ]
        }
    ]
    
    # Day of farrowing tasks
    farrow_day_tasks = [
        {
            "title": f"Monitor farrowing - {sow.tag_id}",
            "description": "Active monitoring during farrowing",
            "category": "farrowing",
            "priority": "critical",
            "due_date": expected_date,
            "checklist": [
                {"step": "Check sow every 30 minutes", "required": True},
                {"step": "Assist if needed (piglet stuck)", "required": True},
                {"step": "Ensure piglets nursing", "required": True},
                {"step": "Record birth times", "required": False},
                {"step": "Dry off weak piglets", "required": True}
            ]
        }
    ]
    
    # Post-farrowing tasks (Day 1)
    day1_tasks = [
        {
            "title": f"Day 1 piglet care - {sow.tag_id}",
            "description": "First day critical care for newborn piglets",
            "category": "farrowing",
            "priority": "critical",
            "due_date": expected_date + timedelta(days=1),
            "checklist": [
                {"step": "Count and record piglet numbers", "required": True},
                {"step": "Weigh piglets", "required": True},
                {"step": "Check all piglets nursing", "required": True},
                {"step": "Identify weak/small piglets", "required": True},
                {"step": "Cross-foster if needed", "required": False},
                {"step": "Check sow for milk letdown", "required": True}
            ]
        }
    ]
    
    # Day 3 processing tasks
    day3_tasks = [
        {
            "title": f"Piglet processing - {sow.tag_id}",
            "description": "Standard piglet processing procedures",
            "category": "processing",
            "priority": "high",
            "due_date": expected_date + timedelta(days=3),
            "checklist": [
                {"step": "Iron injection", "required": True},
                {"step": "Teeth clipping (if needed)", "required": False},
                {"step": "Tail docking (if policy)", "required": False},
                {"step": "Ear tagging", "required": True},
                {"step": "Castration (males, if policy)", "required": False},
                {"step": "Record processing in system", "required": True}
            ]
        }
    ]
    
    all_task_definitions = pre_farrow_tasks + farrow_day_tasks + day1_tasks + day3_tasks
    
    for task_def in all_task_definitions:
        task = Task(
            title=task_def["title"],
            description=task_def["description"],
            category=task_def["category"],
            priority=task_def["priority"],
            status="pending",
            sow_id=sow.id,
            pen_id=sow.pen_id,
            created_by=current_user.id,
            due_date=task_def["due_date"],
            checklist_items=json.dumps(task_def["checklist"])
        )
        db.add(task)
        tasks_created.append(task_def["title"])
    
    await db.commit()
    
    logger.info(f"Generated {len(tasks_created)} farrowing tasks for sow {sow.tag_id}")
    
    return {
        "message": f"Generated {len(tasks_created)} farrowing tasks",
        "sow_id": sow.id,
        "sow_tag": sow.tag_id,
        "expected_farrowing_date": expected_date.isoformat(),
        "tasks_created": tasks_created
    }


@router.get("/farrowing-schedule")
async def get_farrowing_schedule(
    days_ahead: int = Query(14, ge=1, le=60),
    db: AsyncSession = Depends(get_db)
):
    """
    Get upcoming farrowing schedule with associated tasks.
    Perfect for a farrowing calendar view.
    """
    now = datetime.utcnow()
    future_date = now + timedelta(days=days_ahead)
    
    # Get sows due to farrow
    result = await db.execute(
        select(Sow).where(and_(
            Sow.expected_farrowing_date >= now,
            Sow.expected_farrowing_date <= future_date,
            Sow.status.in_(["pregnant", "active"]),
            Sow.is_archived == False,
        )).order_by(Sow.expected_farrowing_date.asc())
    )
    sows = result.scalars().all()
    
    schedule = []
    for sow in sows:
        # Get tasks for this sow
        tasks_result = await db.execute(
            select(Task).where(and_(
                Task.sow_id == sow.id,
                Task.category.in_(["farrowing", "processing"]),
                Task.status.in_(["pending", "in_progress"])
            ))
        )
        tasks = tasks_result.scalars().all()
        
        schedule.append({
            "sow_id": sow.id,
            "tag_id": sow.tag_id,
            "name": sow.name,
            "pen_id": sow.pen_id,
            "expected_date": sow.expected_farrowing_date.isoformat() if sow.expected_farrowing_date else None,
            "parity": sow.parity,
            "days_until": (sow.expected_farrowing_date - now).days if sow.expected_farrowing_date else None,
            "tasks_count": len(tasks),
            "tasks_pending": sum(1 for t in tasks if t.status == "pending"),
            "tasks": [task_to_dict(t) for t in tasks]
        })
    
    return {
        "schedule": schedule,
        "total_sows_due": len(sows),
        "period_start": now.isoformat(),
        "period_end": future_date.isoformat()
    }


# ============================================================================
# CLEANING TASK MANAGEMENT
# ============================================================================

async def handle_cleaning_task_completion(task: Task, completion_data: dict, db: AsyncSession):
    """
    Handle pen cleaning task completion:
    1. Reset pen cleanliness to 1.0 (clean)
    2. Reset wetness to 0.0 (dry)
    3. Update last_cleaned_at timestamp
    4. Calculate and set next_cleaning_due based on interval
    5. Optionally create next scheduled cleaning task
    """
    pen_result = await db.execute(select(Pen).where(Pen.id == task.pen_id))
    pen = pen_result.scalar_one_or_none()
    
    if not pen:
        logger.warning(f"Pen {task.pen_id} not found for cleaning task {task.id}")
        return
    
    now = datetime.utcnow()
    
    # Reset environment scores after cleaning
    pen.cleanliness_score = 1.0  # Fully clean
    pen.wetness_score = 0.0       # Fully dry
    pen.last_cleaned_at = now
    
    # Calculate next cleaning due time based on pen's interval
    interval_hours = pen.cleaning_interval_hours or 24
    if completion_data and completion_data.get("next_interval_hours"):
        # Allow override of interval via completion data
        interval_hours = completion_data["next_interval_hours"]
        pen.cleaning_interval_hours = interval_hours
    
    pen.next_cleaning_due = now + timedelta(hours=interval_hours)
    
    logger.info(
        f"Pen {pen.name} (ID: {pen.id}) cleaned. "
        f"Next cleaning due: {pen.next_cleaning_due.isoformat()}"
    )
    
    # Create next cleaning task if auto-scheduling is enabled
    if completion_data and completion_data.get("auto_schedule_next", True):
        await create_next_cleaning_task(pen, task, db)


async def create_next_cleaning_task(pen: Pen, completed_task: Task, db: AsyncSession):
    """Create the next scheduled cleaning task for a pen"""
    next_task = Task(
        title=f"Clean Pen {pen.name}",
        description=f"Scheduled cleaning for pen {pen.name}",
        category="cleaning",
        priority="medium",
        status="pending",
        pen_id=pen.id,
        template_id=completed_task.template_id,
        assigned_to=completed_task.assigned_to,  # Assign to same person
        created_by=completed_task.created_by,
        due_date=pen.next_cleaning_due,
        scheduled_date=pen.next_cleaning_due,
        checklist_items=completed_task.checklist_items,  # Copy checklist
        notes=f"Auto-scheduled after completing task {completed_task.id}"
    )
    
    db.add(next_task)
    logger.info(f"Next cleaning task created for pen {pen.name}, due: {pen.next_cleaning_due}")


def calculate_pen_environment_decay(last_cleaned: datetime, interval_hours: int) -> tuple:
    """
    Calculate current cleanliness and wetness scores based on time since last cleaning.
    
    Returns:
        tuple: (cleanliness_score, wetness_score)
        - cleanliness decays from 1.0 to 0.0 over the interval period
        - wetness increases from 0.0 to 1.0 over the interval period
    """
    if not last_cleaned:
        return 0.5, 0.5  # Unknown state
    
    now = datetime.utcnow()
    
    # Handle timezone-aware datetimes by making both naive
    if last_cleaned.tzinfo is not None:
        last_cleaned = last_cleaned.replace(tzinfo=None)
    
    hours_since_cleaning = (now - last_cleaned).total_seconds() / 3600
    
    # Calculate decay factor (0.0 at cleaning, 1.0 at interval)
    decay_factor = min(hours_since_cleaning / interval_hours, 1.5)  # Cap at 1.5x
    
    # Cleanliness starts at 1.0 and decays exponentially
    cleanliness = max(0.0, 1.0 - (decay_factor ** 1.2))
    
    # Wetness starts at 0.0 and increases (pens get wet from waste/water)
    wetness = min(1.0, decay_factor * 0.7)  # Caps at 0.7 normally, higher if overdue
    
    return round(cleanliness, 3), round(wetness, 3)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def task_to_dict(task: Task) -> dict:
    """Convert Task model to dictionary"""
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "category": task.category,
        "priority": task.priority,
        "status": task.status,
        "template_id": task.template_id,
        "sow_id": task.sow_id,
        "pen_id": task.pen_id,
        "assigned_to": task.assigned_to,
        "created_by": task.created_by,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "scheduled_date": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "checklist_items": json.loads(task.checklist_items) if task.checklist_items else [],
        "checklist_progress": task.checklist_progress,
        "notes": task.notes,
        "completion_notes": task.completion_notes,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None
    }


def template_to_dict(template: TaskTemplate) -> dict:
    """Convert TaskTemplate model to dictionary"""
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "priority": template.priority,
        "estimated_duration_minutes": template.estimated_duration_minutes,
        "trigger_type": template.trigger_type,
        "trigger_days_offset": template.trigger_days_offset,
        "checklist_items": json.loads(template.checklist_items) if template.checklist_items else [],
        "is_active": template.is_active,
        "created_at": template.created_at.isoformat() if template.created_at else None
    }
