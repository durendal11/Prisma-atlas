from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os
from pathlib import Path


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8", extra="ignore")
    
    # App settings
    APP_NAME: str = "Pig AI Watch"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database - PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/pig_ai_watch"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/pig_ai_watch"
    
    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
        "http://localhost:8080"
    ]
    
    # YOLO
    YOLO_WEIGHTS_PATH: str = "app/models/pig_detection.onnx"
    YOLO_CONFIDENCE_THRESHOLD: float = 0.5
    
    # Camera settings - Environment Variables
    # Support up to 10 camera sources with flexible naming
    CAMERA_PEN_1: Optional[str] = None
    CAMERA_PEN_2: Optional[str] = None
    CAMERA_PEN_3: Optional[str] = None
    CAMERA_PEN_4: Optional[str] = None
    CAMERA_PEN_5: Optional[str] = None
    CAMERA_PEN_6: Optional[str] = None
    CAMERA_PEN_7: Optional[str] = None
    CAMERA_PEN_8: Optional[str] = None
    CAMERA_PEN_9: Optional[str] = None
    CAMERA_PEN_10: Optional[str] = None
    
    # Camera connection settings
    CAMERA_BUFFER_SIZE: int = 1  # Minimize latency for IP cameras
    CAMERA_OPEN_TIMEOUT_MS: int = 10000  # 10 seconds
    CAMERA_READ_TIMEOUT_MS: int = 3000   # 3 seconds (reduced for faster timeout)
    CAMERA_RECONNECT_ATTEMPTS: int = 3
    CAMERA_RECONNECT_DELAY_SEC: int = 2
    CAMERA_FLUSH_BUFFER: bool = True  # Flush old frames for minimal latency
    
    # Detection performance settings
    DETECTION_FRAME_SKIP: int = 2  # Process detection every N frames (1=all frames, 2=every other, 3=every third)
    
    # MediaMTX RTSP Proxy
    # When enabled, backend reads from rtsp://MEDIAMTX_URL/pen_X instead of direct camera URLs.
    # MediaMTX handles the single connection to each camera and serves many local readers.
    MEDIAMTX_ENABLED: bool = False
    MEDIAMTX_URL: str = "rtsp://127.0.0.1:8554"     # MediaMTX RTSP server address
    MEDIAMTX_API_URL: str = "http://127.0.0.1:9997"  # MediaMTX REST API (for health checks)
    
    @property
    def CAMERA_SOURCES(self) -> dict:
        """Build camera sources dictionary from environment variables."""
        sources = {}
        
        # Check all pen camera environment variables
        for i in range(1, 11):
            camera_var = getattr(self, f"CAMERA_PEN_{i}", None)
            if camera_var:
                # Convert "0" or "1" to integer for USB cameras
                if camera_var.isdigit():
                    sources[f"pen_{i}"] = int(camera_var)
                else:
                    sources[f"pen_{i}"] = camera_var
        
        # Fallback to demo mode if no cameras configured
        if not sources:
            sources = {
                "pen_1": None,  # Will use demo frame
                "pen_2": None,
                "pen_3": None,
            }
        
        return sources
    
    # Alert thresholds
    CRUSHING_RISK_THRESHOLD: float = 0.7
    PIGLET_PROXIMITY_THRESHOLD: int = 50  # pixels

    # Edge device settings
    EDGE_API_KEY: Optional[str] = None
    LOCAL_CAMERAS_ENABLED: bool = True  # False when cameras are on Pi edge device

    # LLM + Push notification settings
    ANTHROPIC_API_KEY: Optional[str] = None
    FCM_PROJECT_ID: Optional[str] = None
    FCM_SERVICE_ACCOUNT_JSON: Optional[str] = None


settings = Settings()
