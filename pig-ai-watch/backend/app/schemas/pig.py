from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Pen Schemas
class PenBase(BaseModel):
    name: str
    location: Optional[str] = None
    camera_source: Optional[str] = None
    is_active: bool = True


class PenCreate(PenBase):
    cleaning_interval_hours: Optional[int] = 24


class PenUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    camera_source: Optional[str] = None
    is_active: Optional[bool] = None
    cleaning_interval_hours: Optional[int] = None


class PenResponse(PenBase):
    id: int
    created_at: datetime
    cleanliness_score: Optional[float] = None
    wetness_score: Optional[float] = None
    last_cleaned_at: Optional[datetime] = None
    next_cleaning_due: Optional[datetime] = None
    cleaning_interval_hours: Optional[int] = 24
    
    class Config:
        from_attributes = True


# Sow Schemas
class SowBase(BaseModel):
    tag_id: str
    name: Optional[str] = None
    breed: Optional[str] = None
    weight: Optional[float] = None
    parity: int = 0
    status: str = "active"
    current_litter_size: int = 0
    notes: Optional[str] = None


class SowCreate(SowBase):
    birth_date: Optional[datetime] = None
    last_breeding_date: Optional[datetime] = None
    expected_farrowing_date: Optional[datetime] = None
    pen_id: Optional[int] = None


class SowUpdate(BaseModel):
    name: Optional[str] = None
    breed: Optional[str] = None
    weight: Optional[float] = None
    parity: Optional[int] = None
    status: Optional[str] = None
    current_litter_size: Optional[int] = None
    last_breeding_date: Optional[datetime] = None
    expected_farrowing_date: Optional[datetime] = None
    pen_id: Optional[int] = None
    notes: Optional[str] = None


class SowResponse(SowBase):
    id: int
    birth_date: Optional[datetime]
    last_breeding_date: Optional[datetime]
    expected_farrowing_date: Optional[datetime]
    last_farrowing_date: Optional[datetime]
    pen_id: Optional[int]
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    detection_logs_count: int = 0
    last_detection_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True


# Alert Schemas
class AlertBase(BaseModel):
    type: str
    severity: str
    title: str
    message: Optional[str] = None


class AlertCreate(AlertBase):
    sow_id: Optional[int] = None
    pen_id: Optional[int] = None
    detection_data: Optional[str] = None


class AlertUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_resolved: Optional[bool] = None


class AlertResponse(AlertBase):
    id: int
    sow_id: Optional[int]
    pen_id: Optional[int]
    is_read: bool
    is_resolved: bool
    resolved_at: Optional[datetime]
    resolved_by: Optional[int]
    detection_data: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Event Schemas
class EventBase(BaseModel):
    type: str
    category: Optional[str] = None
    description: Optional[str] = None


class EventCreate(EventBase):
    sow_id: Optional[int] = None
    pen_id: Optional[int] = None
    event_metadata: Optional[str] = None


class EventResponse(EventBase):
    id: int
    sow_id: Optional[int]
    pen_id: Optional[int]
    user_id: Optional[int]
    event_metadata: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Detection Schemas
class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float
    label: str
    confidence: float


class DetectionBase(BaseModel):
    pen_id: int
    piglet_count: int
    sow_posture: str
    crushing_risk: float
    bounding_boxes: List[BoundingBox]


class DetectionCreate(DetectionBase):
    frame_timestamp: datetime
    processing_time_ms: float


class DetectionResponse(DetectionBase):
    id: int
    frame_timestamp: Optional[datetime]
    processing_time_ms: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True


class DetectionWebSocket(BaseModel):
    pen_id: int
    piglet_count: int
    posture: str
    risk_level: float
    bboxes: List[dict]
    timestamp: str


# Behavior Logging for Analytics
class BehaviorLogCreate(BaseModel):
    pen_id: int
    sow_id: Optional[int] = None
    piglet_count: int
    sow_count: int
    total_detections: int
    sow_posture: str
    posture_confidence: float
    is_nursing: bool
    is_feeding: bool
    is_sleeping: bool
    activity_level: str  # resting, active, feeding, lactating
    crushing_risk: float
    health_score: float
    avg_confidence: float
    detection_density: float
    movement_level: str  # stationary, low, moderate, high
    cleanliness_score: float = 0.0
    wetness_score: float = 0.0
    detection_data: Optional[str] = None  # JSON string with full details
    logged_at: Optional[datetime] = None


class BehaviorLogResponse(BaseModel):
    id: int
    pen_id: int
    sow_id: Optional[int] = None
    piglet_count: int = 0
    sow_count: int = 0
    total_detections: int = 0
    sow_posture: Optional[str] = None
    posture_confidence: float = 0.0
    is_nursing: bool = False
    is_feeding: bool = False
    is_sleeping: bool = False
    activity_level: Optional[str] = None
    crushing_risk: float = 0.0
    health_score: float = 70.0
    avg_confidence: float = 0.0
    detection_density: float = 0.0
    movement_level: Optional[str] = None
    cleanliness_score: float = 0.0
    wetness_score: float = 0.0
    detection_data: Optional[str] = None
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    logged_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BehaviorAnalytics(BaseModel):
    """Aggregated behavior analytics for health monitoring"""
    pen_id: int
    period_start: datetime
    period_end: datetime
    total_logs: int
    avg_piglet_count: float
    avg_crushing_risk: float
    avg_health_score: float
    sleeping_percentage: float
    posture_distribution: dict
    activity_distribution: dict


# Dashboard Stats
class DashboardStats(BaseModel):
    total_sows: int
    total_piglets: int
    active_alerts: int
    pens_monitored: int


class PenStatus(BaseModel):
    pen_id: int
    pen_name: str
    sow_tag: Optional[str]
    piglet_count: int
    sow_posture: str
    crushing_risk: float
    last_updated: datetime
    is_streaming: bool
