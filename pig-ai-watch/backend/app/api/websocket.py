from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, Set, List
import asyncio
import json
from datetime import datetime
import logging
from app.services.yolo_detector import get_detector, DetectionResult
from app.services.camera_stream import stream_manager, get_demo_frame
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages WebSocket connections for real-time detection updates."""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, pen_id: str = "all"):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            if pen_id not in self.active_connections:
                self.active_connections[pen_id] = set()
            self.active_connections[pen_id].add(websocket)
        logger.info(f"WebSocket connected for pen: {pen_id}")
    
    async def disconnect(self, websocket: WebSocket, pen_id: str = "all"):
        """Remove a WebSocket connection from a specific pen group."""
        async with self._lock:
            if pen_id in self.active_connections:
                self.active_connections[pen_id].discard(websocket)
                if not self.active_connections[pen_id]:
                    del self.active_connections[pen_id]
        logger.info(f"WebSocket disconnected for pen: {pen_id}")
    
    async def disconnect_all(self, websocket: WebSocket):
        """Remove a WebSocket connection from ALL pen groups."""
        async with self._lock:
            pens_to_remove = []
            for pen_id, connections in self.active_connections.items():
                if websocket in connections:
                    connections.discard(websocket)
                    if not connections:
                        pens_to_remove.append(pen_id)
            
            # Clean up empty groups
            for pen_id in pens_to_remove:
                del self.active_connections[pen_id]
        
        logger.info(f"WebSocket disconnected from all pens")
    
    async def broadcast(self, message: dict, pen_id: str = "all"):
        """Broadcast message to all connections for a pen."""
        async with self._lock:
            connections = set()
            
            # Add connections for specific pen
            if pen_id in self.active_connections:
                connections.update(self.active_connections[pen_id])
            
            # Add connections listening to "all"
            if "all" in self.active_connections:
                connections.update(self.active_connections["all"])
        
        # Send to all connections
        disconnected = []
        for connection in connections:
            try:
                # Check if connection is still open
                if connection.client_state.name != "CONNECTED":
                    disconnected.append(connection)
                    continue
                    
                await connection.send_json(message)
            except Exception as e:
                # Only log once per unique connection to avoid spam
                if connection not in disconnected:
                    logger.debug(f"Error sending to WebSocket: {e}")
                    disconnected.append(connection)
        
        # Clean up disconnected clients from ALL groups
        if disconnected:
            async with self._lock:
                for connection in disconnected:
                    for pen_group, conns in list(self.active_connections.items()):
                        conns.discard(connection)
                        if not conns:
                            del self.active_connections[pen_group]
    
    def get_connection_count(self) -> int:
        """Get total number of active connections."""
        return sum(len(conns) for conns in self.active_connections.values())


# Global connection manager
ws_manager = ConnectionManager()


@router.websocket("/ws/detections")
async def websocket_detections(websocket: WebSocket):
    """WebSocket endpoint for real-time YOLO detection updates."""
    await ws_manager.connect(websocket, "all")
    
    try:
        while True:
            # Receive messages (for ping/pong or pen subscription)
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                
                if data.get("type") == "subscribe":
                    pen_id = data.get("pen_id", "all")
                    await ws_manager.disconnect(websocket, "all")
                    await ws_manager.connect(websocket, pen_id)
                    
                elif data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except asyncio.TimeoutError:
                pass
            
            await asyncio.sleep(0.1)
            
    except WebSocketDisconnect:
        await ws_manager.disconnect_all(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await ws_manager.disconnect_all(websocket)


@router.websocket("/ws/detections/{pen_id}")
async def websocket_pen_detections(websocket: WebSocket, pen_id: str):
    """WebSocket endpoint for real-time detections from a specific pen."""
    await ws_manager.connect(websocket, pen_id)
    
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass
            
            await asyncio.sleep(0.1)
            
    except WebSocketDisconnect:
        await ws_manager.disconnect_all(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await ws_manager.disconnect_all(websocket)


async def detection_broadcast_loop():
    """Background task that processes frames and broadcasts detections."""
    detector = get_detector()
    
    logger.info("Starting detection broadcast loop")
    
    while True:
        try:
            active_pens = stream_manager.get_active_streams()
            
            for pen_id in active_pens:
                stream = await stream_manager.get_stream(pen_id)
                
                if stream and stream.last_detection:
                    detection = stream.last_detection
                    
                    # Format for WebSocket broadcast
                    message = {
                        "type": "detection",
                        "pen_id": pen_id,
                        "data": {
                            "piglet_count": detection.piglet_count,
                            "posture": detection.sow_posture,
                            "risk_level": detection.crushing_risk,
                            "bboxes": detection.bounding_boxes,
                            "timestamp": detection.timestamp.isoformat(),
                            "processing_time_ms": detection.processing_time_ms
                        }
                    }
                    
                    await ws_manager.broadcast(message, pen_id)
                    
                    # Check for alerts
                    if detection.crushing_risk >= settings.CRUSHING_RISK_THRESHOLD:
                        alert_message = {
                            "type": "alert",
                            "pen_id": pen_id,
                            "data": {
                                "alert_type": "crushing_risk",
                                "severity": "critical" if detection.crushing_risk >= 0.8 else "high",
                                "message": f"High crushing risk detected in {pen_id}",
                                "risk_level": detection.crushing_risk,
                                "timestamp": detection.timestamp.isoformat()
                            }
                        }
                        await ws_manager.broadcast(alert_message)
            
            # If no active streams, broadcast demo data
            if not active_pens and ws_manager.get_connection_count() > 0:
                demo_detection = {
                    "type": "detection",
                    "pen_id": "demo",
                    "data": {
                        "piglet_count": 8,
                        "posture": "lactating",
                        "risk_level": 0.15,
                        "bboxes": [],
                        "timestamp": datetime.utcnow().isoformat(),
                        "processing_time_ms": 45.2
                    }
                }
                await ws_manager.broadcast(demo_detection)
            
            await asyncio.sleep(0.5)  # Broadcast every 500ms
            
        except Exception as e:
            logger.error(f"Error in detection broadcast loop: {e}")
            await asyncio.sleep(1)


def get_ws_manager() -> ConnectionManager:
    """Get the WebSocket connection manager."""
    return ws_manager
