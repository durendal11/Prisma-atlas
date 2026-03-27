from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from app.core.config import settings
from app.core.database import init_db
from app.api import auth, sows, alerts, events, dashboard, stream, websocket, pens, detect, behavior, tasks, farrowing, edge, advisory, notifications, media
from app.api.websocket import detection_broadcast_loop
from app.services.yolo_detector import get_detector
from app.services.delayed_farrowing_checker import delayed_farrowing_task_loop

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting Pig AI Watch Backend...")
    
    # Initialize database
    await init_db()
    logger.info("Database initialized")
    
    # Load YOLO model (used by /api/detect and optionally local cameras)
    if settings.LOCAL_CAMERAS_ENABLED:
        detector = get_detector()
        logger.info("YOLO detector loaded (local cameras mode)")
    else:
        logger.info("LOCAL_CAMERAS_ENABLED=false — skipping YOLO load (edge device handles inference)")
    
    # Start background detection broadcast loop only when cameras are local
    broadcast_task = None
    if settings.LOCAL_CAMERAS_ENABLED:
        broadcast_task = asyncio.create_task(detection_broadcast_loop())
        logger.info("Detection broadcast loop started")
    else:
        logger.info("Detection broadcast relayed from edge device via /api/edge/detections")
        
    # Start delayed farrowing background processor
    delayed_farrowing_task = asyncio.create_task(delayed_farrowing_task_loop())
    logger.info("Delayed farrowing checker task started")
    
    # Sync camera assignments to MediaMTX proxy
    if settings.LOCAL_CAMERAS_ENABLED and settings.MEDIAMTX_ENABLED:
        from app.services import mediamtx
        synced = await mediamtx.sync_from_db()
        logger.info(f"MediaMTX sync: {synced} camera path(s) registered")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    
    if delayed_farrowing_task is not None:
        delayed_farrowing_task.cancel()
        
    if broadcast_task is not None:
        broadcast_task.cancel()
    
    # Stop all camera streams
    if settings.LOCAL_CAMERAS_ENABLED:
        from app.services.camera_stream import stream_manager
        await stream_manager.stop_all()
    
    logger.info("Pig AI Watch Backend stopped")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered pig farrowing monitoring system with YOLO integration",
    lifespan=lifespan
)

# CORS middleware - must be added before routes
allowed_origins = set(settings.CORS_ORIGINS or [])
allowed_origins.update({
    "http://localhost:5174",
    "http://127.0.0.1:5174",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(sows.router)
app.include_router(alerts.router)
app.include_router(events.router)
app.include_router(dashboard.router)
app.include_router(stream.router)
app.include_router(pens.router)
app.include_router(websocket.router)
app.include_router(detect.router)
app.include_router(behavior.router)
app.include_router(tasks.router)
app.include_router(farrowing.router)
app.include_router(edge.router)
app.include_router(advisory.router, prefix="/api/advisory", tags=["Advisory"])
app.include_router(notifications.router)
app.include_router(media.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected",
        "yolo_model": "loaded"
    }
