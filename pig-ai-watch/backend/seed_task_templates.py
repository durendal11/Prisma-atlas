"""
Seed task templates for farrowing care workflow
"""
import asyncio
import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.pig import TaskTemplate, WorkflowRule


TASK_TEMPLATES = [
    # Pre-farrowing (3 days before)
    {
        "name": "Prepare Farrowing Pen",
        "description": "Clean and prepare the farrowing pen before sow moves in",
        "category": "farrowing",
        "priority": "high",
        "checklist_items": json.dumps([
            "Clean and disinfect pen thoroughly",
            "Check heating lamp functionality",
            "Install creep area guard rails",
            "Check water nipples and feed dispensers",
            "Add fresh bedding material",
            "Verify camera feed working"
        ]),
        "estimated_duration_minutes": 45,
        "trigger_type": "days_before_farrowing",
        "trigger_days_offset": -3,
        "is_active": True
    },
    {
        "name": "Pre-Farrowing Sow Health Check",
        "description": "Health check and vaccination before farrowing",
        "category": "health",
        "priority": "high",
        "checklist_items": json.dumps([
            "Check sow temperature",
            "Inspect udder for swelling/mastitis",
            "Check vulva for discharge",
            "Verify feed intake is normal",
            "Administer vitamin injection if needed",
            "Record body condition score"
        ]),
        "estimated_duration_minutes": 20,
        "trigger_type": "days_before_farrowing",
        "trigger_days_offset": -2,
        "is_active": True
    },
    # Day of farrowing
    {
        "name": "Monitor Farrowing Progress",
        "description": "Active monitoring during farrowing",
        "category": "farrowing",
        "priority": "critical",
        "checklist_items": json.dumps([
            "Check sow every 30 minutes during active labor",
            "Assist if piglet stuck for >30 minutes",
            "Keep piglets warm under heat lamp",
            "Ensure piglets nursing within 1 hour",
            "Remove membranes from piglet noses",
            "Record birth time of each piglet",
            "Monitor sow for exhaustion"
        ]),
        "estimated_duration_minutes": 240,
        "trigger_type": "day_of_farrowing",
        "trigger_days_offset": 0,
        "is_active": True
    },
    # Day 1 after farrowing
    {
        "name": "Day 1 Piglet Care",
        "description": "First day care for newborn piglets",
        "category": "farrowing",
        "priority": "critical",
        "checklist_items": json.dumps([
            "Count and record total piglets",
            "Weigh each piglet",
            "Check all piglets are nursing",
            "Clip needle teeth if necessary",
            "Identify weak piglets for special care",
            "Check sow milk production",
            "Cross-foster if litter size uneven",
            "Record piglet deaths if any"
        ]),
        "estimated_duration_minutes": 60,
        "trigger_type": "days_after_farrowing",
        "trigger_days_offset": 1,
        "is_active": True
    },
    # Day 3 processing
    {
        "name": "Day 3 Piglet Processing",
        "description": "Standard piglet processing procedures",
        "category": "processing",
        "priority": "high",
        "checklist_items": json.dumps([
            "Administer iron injection",
            "Clip needle teeth",
            "Dock tails",
            "Apply ear tags/notches",
            "Castrate male piglets",
            "Record all procedures",
            "Check for hernias or abnormalities"
        ]),
        "estimated_duration_minutes": 90,
        "trigger_type": "days_after_farrowing",
        "trigger_days_offset": 3,
        "is_active": True
    },
    # Weekly tasks
    {
        "name": "Weekly Piglet Weight Check",
        "description": "Monitor piglet growth and identify runts",
        "category": "weighing",
        "priority": "medium",
        "checklist_items": json.dumps([
            "Weigh all piglets",
            "Calculate average daily gain",
            "Identify underweight piglets",
            "Check for signs of illness",
            "Record weights in system"
        ]),
        "estimated_duration_minutes": 30,
        "trigger_type": "days_after_farrowing",
        "trigger_days_offset": 7,
        "is_active": True
    },
    # General health tasks
    {
        "name": "Sow Health Check",
        "description": "Routine health check for lactating sow",
        "category": "health",
        "priority": "medium",
        "checklist_items": json.dumps([
            "Check temperature",
            "Inspect udder for mastitis",
            "Check appetite and water intake",
            "Assess body condition",
            "Check for lameness",
            "Monitor lactation behavior"
        ]),
        "estimated_duration_minutes": 15,
        "trigger_type": "manual",
        "trigger_days_offset": None,
        "is_active": True
    },
    # Cleaning tasks
    {
        "name": "Daily Pen Cleaning",
        "description": "Daily cleaning and maintenance of farrowing pen",
        "category": "cleaning",
        "priority": "medium",
        "checklist_items": json.dumps([
            "Remove soiled bedding",
            "Check and clean water nipples",
            "Remove uneaten feed",
            "Check creep area condition",
            "Verify heating lamp working"
        ]),
        "estimated_duration_minutes": 15,
        "trigger_type": "manual",
        "trigger_days_offset": None,
        "is_active": True
    }
]

WORKFLOW_RULES = [
    {
        "name": "Auto-generate pre-farrowing tasks",
        "description": "Automatically create tasks 3 days before expected farrowing",
        "trigger_event": "sow_due_date_approaching",
        "trigger_conditions": json.dumps({"days_before": 3}),
        "action_type": "create_tasks_from_template",
        "action_config": json.dumps({"template_trigger_type": "days_before_farrowing"}),
        "priority": 1,
        "is_active": True
    },
    {
        "name": "Create day 1 tasks after farrowing",
        "description": "Create piglet care tasks after farrowing is recorded",
        "trigger_event": "farrowing_completed",
        "trigger_conditions": json.dumps({}),
        "action_type": "create_tasks_from_template",
        "action_config": json.dumps({"template_trigger_type": "days_after_farrowing", "trigger_offset": 1}),
        "priority": 1,
        "is_active": True
    },
    {
        "name": "Create processing tasks",
        "description": "Create day 3 processing tasks",
        "trigger_event": "farrowing_completed",
        "trigger_conditions": json.dumps({}),
        "action_type": "create_tasks_from_template",
        "action_config": json.dumps({"template_trigger_type": "days_after_farrowing", "trigger_offset": 3}),
        "priority": 2,
        "is_active": True
    },
    {
        "name": "Alert on crushing detected",
        "description": "Create high-priority alert when AI detects potential crushing",
        "trigger_event": "crushing_detected",
        "trigger_conditions": json.dumps({"confidence": 0.8}),
        "action_type": "create_alert",
        "action_config": json.dumps({"severity": "critical", "type": "crushing_risk"}),
        "priority": 0,
        "is_active": True
    }
]


async def seed_task_templates():
    """Seed task templates into database"""
    async with AsyncSessionLocal() as db:
        # Check if templates already exist
        result = await db.execute(select(TaskTemplate).limit(1))
        existing = result.scalar_one_or_none()
        
        if existing:
            print("Task templates already seeded. Skipping...")
            return
        
        print("Seeding task templates...")
        
        for template_data in TASK_TEMPLATES:
            template = TaskTemplate(**template_data)
            db.add(template)
            print(f"  Added template: {template_data['name']}")
        
        await db.commit()
        print(f"Seeded {len(TASK_TEMPLATES)} task templates")
        
        # Seed workflow rules
        print("\nSeeding workflow rules...")
        for rule_data in WORKFLOW_RULES:
            rule = WorkflowRule(**rule_data)
            db.add(rule)
            print(f"  Added rule: {rule_data['name']}")
        
        await db.commit()
        print(f"Seeded {len(WORKFLOW_RULES)} workflow rules")


if __name__ == "__main__":
    asyncio.run(seed_task_templates())
