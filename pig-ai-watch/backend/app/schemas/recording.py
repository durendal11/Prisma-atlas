from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class RecordingScheduleUpdate(BaseModel):
    schedule: List[str]

class StorageStatusReport(BaseModel):
    pen_id: Optional[int] = None
    storage_path: str
    total_bytes: int
    free_bytes: int

class RecordingClipReport(BaseModel):
    pen_id: int
    file_path: str
    start_time: datetime
    end_time: datetime
    mode: str
    file_size_bytes: int
    storage_path: str
