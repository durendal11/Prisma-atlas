from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Time, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Pen(Base):
    __tablename__ = "pens"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    location = Column(String(100))
    camera_source = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Environment tracking - updated by cleaning tasks
    cleanliness_score = Column(Float, default=1.0)  # 0 (dirty) to 1 (clean)
    wetness_score = Column(Float, default=0.0)      # 0 (dry) to 1 (very wet)
    last_cleaned_at = Column(DateTime(timezone=True))  # When pen was last cleaned
    next_cleaning_due = Column(DateTime(timezone=True))  # Scheduled next cleaning
    cleaning_interval_hours = Column(Integer, default=24)  # Default cleaning interval
    
    sows = relationship("Sow", back_populates="pen")
    events = relationship("Event", back_populates="pen")


class Sow(Base):
    __tablename__ = "sows"
    
    id = Column(Integer, primary_key=True, index=True)
    tag_id = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100))
    breed = Column(String(50))
    birth_date = Column(DateTime(timezone=True))
    weight = Column(Float)
    parity = Column(Integer, default=0)  # Number of times given birth
    status = Column(String(20), default="active")  # active, pregnant, farrowing, lactating, weaned, inactive
    current_litter_size = Column(Integer, default=0)
    last_breeding_date = Column(DateTime(timezone=True))  # Date sow was bred/inseminated
    expected_farrowing_date = Column(DateTime(timezone=True))
    last_farrowing_date = Column(DateTime(timezone=True))
    pen_id = Column(Integer, ForeignKey("pens.id"))
    notes = Column(Text)
    is_archived = Column(Boolean, default=False, nullable=False)
    archived_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    pen = relationship("Pen", back_populates="sows")
    alerts = relationship("Alert", back_populates="sow")
    events = relationship("Event", back_populates="sow")


class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)  # crushing_risk, posture_change, piglet_count_change, system
    severity = Column(String(20), nullable=False)  # low, medium, high, critical
    title = Column(String(200), nullable=False)
    message = Column(Text)
    sow_id = Column(Integer, ForeignKey("sows.id"))
    pen_id = Column(Integer, ForeignKey("pens.id"))
    is_read = Column(Boolean, default=False)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))
    resolved_by = Column(Integer, ForeignKey("users.id"))
    detection_data = Column(Text)  # JSON string with detection details
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    sow = relationship("Sow", back_populates="alerts")


class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)  # detection, posture_change, farrowing, feeding, system
    category = Column(String(50))  # ai_detection, manual_entry, automated
    description = Column(Text)
    sow_id = Column(Integer, ForeignKey("sows.id"))
    pen_id = Column(Integer, ForeignKey("pens.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    event_metadata = Column('metadata', Text)  # JSON string with additional data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    sow = relationship("Sow", back_populates="events")
    pen = relationship("Pen", back_populates="events")


class Detection(Base):
    __tablename__ = "detections"
    
    id = Column(Integer, primary_key=True, index=True)
    pen_id = Column(Integer, ForeignKey("pens.id"), nullable=False)
    piglet_count = Column(Integer, default=0)
    sow_count = Column(Integer, default=1)
    sow_posture = Column(String(30))  # standing, sitting, sleeping, lactating, feeding
    crushing_risk = Column(Float, default=0.0)  # 0.0 to 1.0
    bounding_boxes = Column(Text)  # JSON array of bboxes
    confidence_scores = Column(Text)  # JSON array of confidence scores
    class_names = Column(Text)  # JSON array of class names detected
    frame_timestamp = Column(DateTime(timezone=True))
    processing_time_ms = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BehaviorLog(Base):
    """Logs sow behavior every 12 seconds for analytics and health monitoring"""
    __tablename__ = "behavior_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    pen_id = Column(Integer, ForeignKey("pens.id"), nullable=False)
    sow_id = Column(Integer, ForeignKey("sows.id"), nullable=True)
    
    # Detection counts
    piglet_count = Column(Integer, default=0)
    sow_count = Column(Integer, default=0)
    total_detections = Column(Integer, default=0)
    
    # Posture and behavior
    sow_posture = Column(String(30))  # standing, sitting, sleeping, lactating, feeding
    posture_confidence = Column(Float, default=0.0)
    is_nursing = Column(Boolean, default=False)
    is_feeding = Column(Boolean, default=False)
    is_sleeping = Column(Boolean, default=False)
    activity_level = Column(String(20))  # resting, active, feeding, lactating
    
    # Risk and health metrics
    crushing_risk = Column(Float, default=0.0)
    health_score = Column(Float, default=70.0)  # 0-100
    
    # Analytics
    avg_confidence = Column(Float, default=0.0)
    detection_density = Column(Float, default=0.0)
    movement_level = Column(String(20))  # stationary, low, moderate, high
    
    # Raw detection data for reference
    detection_data = Column(Text)  # JSON with full detection details
    is_archived = Column(Boolean, default=False, nullable=False)
    archived_at = Column(DateTime(timezone=True))

    # Environment scores
    cleanliness_score = Column(Float, default=0.0)  # 0 (dirty) to 1 (clean)
    wetness_score = Column(Float, default=0.0)      # 0 (dry) to 1 (very wet)
    
    # Timestamps
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================================
# TASK MANAGEMENT & WORKFLOW AUTOMATION
# ============================================================================

class TaskTemplate(Base):
    """Predefined task templates for common farm operations"""
    __tablename__ = "task_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    category = Column(String(50), nullable=False)  # farrowing, health, feeding, cleaning, processing
    priority = Column(String(20), default="medium")  # low, medium, high, critical
    estimated_duration_minutes = Column(Integer, default=30)
    
    # Automation triggers
    trigger_type = Column(String(50))  # days_before_farrowing, days_after_farrowing, manual, recurring
    trigger_days_offset = Column(Integer)  # e.g., -3 for 3 days before, +1 for 1 day after
    
    # Checklist items (JSON array of steps)
    checklist_items = Column(Text)  # JSON: [{"step": "Check water", "required": true}, ...]
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    tasks = relationship("Task", back_populates="template")


class Task(Base):
    """Individual tasks assigned to workers"""
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(50), nullable=False)  # farrowing, health, feeding, cleaning, processing
    priority = Column(String(20), default="medium")  # low, medium, high, critical
    status = Column(String(20), default="pending")  # pending, in_progress, completed, cancelled, overdue
    
    # Relationships
    template_id = Column(Integer, ForeignKey("task_templates.id"), nullable=True)
    sow_id = Column(Integer, ForeignKey("sows.id"), nullable=True)
    pen_id = Column(Integer, ForeignKey("pens.id"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timing
    due_date = Column(DateTime(timezone=True))
    scheduled_date = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    
    # Checklist progress (JSON)
    checklist_items = Column(Text)  # JSON with completion status
    checklist_progress = Column(Float, default=0.0)  # 0-100%
    
    # Notes and feedback
    notes = Column(Text)
    completion_notes = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    template = relationship("TaskTemplate", back_populates="tasks")
    sow = relationship("Sow")
    pen = relationship("Pen")


class FarrowingRecord(Base):
    """Detailed farrowing event records"""
    __tablename__ = "farrowing_records"
    
    id = Column(Integer, primary_key=True, index=True)
    sow_id = Column(Integer, ForeignKey("sows.id"), nullable=False)
    pen_id = Column(Integer, ForeignKey("pens.id"), nullable=False)
    
    # Farrowing details
    farrowing_started = Column(DateTime(timezone=True))
    farrowing_completed = Column(DateTime(timezone=True))
    duration_minutes = Column(Integer)
    
    # Litter details
    total_born = Column(Integer, default=0)
    born_alive = Column(Integer, default=0)
    stillborn = Column(Integer, default=0)
    mummified = Column(Integer, default=0)
    
    # Piglet weights (JSON array)
    piglet_weights = Column(Text)  # JSON: [1.2, 1.4, 1.1, ...]
    avg_birth_weight = Column(Float)
    
    # Care tracking
    cross_fostered_in = Column(Integer, default=0)
    cross_fostered_out = Column(Integer, default=0)
    current_litter_size = Column(Integer, default=0)
    
    # Health indicators
    sow_condition = Column(String(50))  # excellent, good, fair, poor
    intervention_required = Column(Boolean, default=False)
    intervention_notes = Column(Text)
    
    # AI detection during farrowing
    ai_detected = Column(Boolean, default=False)
    crushing_incidents = Column(Integer, default=0)
    
    # Staff
    attended_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    sow = relationship("Sow")
    pen = relationship("Pen")


class PigletRecord(Base):
    """Individual piglet tracking"""
    __tablename__ = "piglet_records"
    
    id = Column(Integer, primary_key=True, index=True)
    farrowing_record_id = Column(Integer, ForeignKey("farrowing_records.id"), nullable=False)
    sow_id = Column(Integer, ForeignKey("sows.id"), nullable=False)  # Birth mother
    nurse_sow_id = Column(Integer, ForeignKey("sows.id"), nullable=True)  # Cross-fostered to
    
    # Identification
    ear_tag = Column(String(50), unique=True, nullable=True)
    temp_id = Column(String(20))  # Temporary ID before tagging
    
    # Birth details
    birth_order = Column(Integer)
    birth_weight = Column(Float)
    birth_time = Column(DateTime(timezone=True))
    
    # Status
    status = Column(String(30), default="alive")  # alive, deceased, sold, transferred
    death_date = Column(DateTime(timezone=True))
    death_cause = Column(String(100))  # crushing, starvation, disease, etc.
    
    # Processing tracking
    processed_date = Column(DateTime(timezone=True))
    iron_given = Column(Boolean, default=False)
    teeth_clipped = Column(Boolean, default=False)
    tail_docked = Column(Boolean, default=False)
    castrated = Column(Boolean, default=False)  # For males
    
    # Health
    health_score = Column(Float, default=100.0)
    health_notes = Column(Text)
    
    # Growth tracking (JSON array of weight records)
    weight_history = Column(Text)  # JSON: [{"date": "...", "weight": 1.5}, ...]
    current_weight = Column(Float)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    farrowing_record = relationship("FarrowingRecord")


class WorkflowRule(Base):
    """Automated workflow rules for task generation"""
    __tablename__ = "workflow_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # Trigger conditions
    trigger_event = Column(String(50), nullable=False)  # farrowing_due, farrowing_started, crushing_alert, etc.
    trigger_conditions = Column(Text)  # JSON conditions
    
    # Actions
    action_type = Column(String(50), nullable=False)  # create_task, send_alert, update_status
    action_config = Column(Text)  # JSON configuration
    
    # Template to use for task creation
    task_template_id = Column(Integer, ForeignKey("task_templates.id"), nullable=True)
    
    # Timing
    delay_minutes = Column(Integer, default=0)  # Delay before executing action
    
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # Execution priority
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    task_template = relationship("TaskTemplate")


class NotificationSubscription(Base):
    __tablename__ = "notification_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "device_token", name="uq_notification_subscriptions_user_device"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    device_token = Column(Text, nullable=False)
    platform = Column(String(20), default="electron", nullable=False)
    pen_ids = Column(JSON, nullable=False, default=list)
    quiet_start = Column(Time, nullable=True)
    quiet_end = Column(Time, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id = Column(Integer, primary_key=True, index=True)
    pen_id = Column(Integer, nullable=True)
    device_token = Column(Text, nullable=True)
    alert_type = Column(String(50), nullable=True)
    priority = Column(String(20), nullable=True)
    push_title = Column(Text, nullable=True)
    push_body = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    delivered = Column(Boolean, default=False, nullable=False)
