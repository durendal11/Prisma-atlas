from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from fastapi.responses import StreamingResponse, JSONResponse
from app.core.config import settings
from app.core.security import get_current_user, verify_token
from app.models.user import User
from typing import Optional
import cv2

router = APIRouter(prefix="/api/stream", tags=["Video Stream"])


async def get_user_from_token_param(token: Optional[str] = Query(None)):
    """Authenticate via query parameter token for streaming endpoints."""
    if token:
        username = verify_token(token)
        if username:
            return True
    return False


@router.get("/{pen_id}")
async def get_video_stream(
    pen_id: str,
    token: Optional[str] = Query(None)
):
    """Get MJPEG video stream for a specific pen. Pass token as query param."""
    # Verify token from query parameter
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required. Add ?token=YOUR_JWT_TOKEN to the URL"
        )
    
    username = verify_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return StreamingResponse(
        _get_mjpeg_stream(pen_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@router.post("/{pen_id}/whep")
async def whep_sdp_offer(
    pen_id: str,
    request: Request,
    token: Optional[str] = Query(None)
):
    """Proxy WebRTC WHEP SDP offer to MediaMTX for sub-second video streaming."""
    import httpx
    from fastapi import Response

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required")
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    body = await request.body()
    normalized_pen = f"pen_{pen_id}" if pen_id.isdigit() else pen_id

    mediamtx_url = f"http://127.0.0.1:8889/{normalized_pen}/whep"
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.post(
                mediamtx_url,
                content=body,
                headers={"Content-Type": "application/sdp"}
            )
            location = resp.headers.get("Location", "")
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers={
                    "Content-Type": "application/sdp",
                    "Access-Control-Allow-Origin": "*",
                    "Location": location
                }
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"MediaMTX WebRTC unavailable: {exc}")


@router.get("/{pen_id}/snapshot")
async def get_snapshot(
    pen_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single frame snapshot from a pen camera."""
    from app.services.camera_stream import stream_manager
    
    stream = await stream_manager.get_stream(pen_id)
    
    if stream and stream.last_frame is not None:
        frame = stream.last_frame
    else:
        # Return demo frame
        from app.services.camera_stream import get_demo_frame
        frame = get_demo_frame(pen_id)
    
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    
    return StreamingResponse(
        iter([buffer.tobytes()]),
        media_type="image/jpeg",
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Origin": "*"
        }
    )


def _get_mjpeg_stream(pen_id: str):
    """Lazy-import to avoid touching camera_stream when cameras are off."""
    from app.services.camera_stream import generate_mjpeg_stream
    return generate_mjpeg_stream(pen_id)


@router.get("/{pen_id}/status")
async def get_stream_status(
    pen_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get the status of a video stream with detailed connection info."""
    from app.services.camera_stream import stream_manager
    
    stream = await stream_manager.get_stream(pen_id)
    
    if stream:
        # Get camera details if capture is available
        camera_info = None
        if stream.capture and stream.is_running:
            width = stream.capture.get(cv2.CAP_PROP_FRAME_WIDTH)
            height = stream.capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
            fps = stream.capture.get(cv2.CAP_PROP_FPS)
            fourcc = int(stream.capture.get(cv2.CAP_PROP_FOURCC))
            codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
            
            camera_info = {
                "source": str(stream.source),
                "is_network_camera": stream.is_network_camera,
                "resolution": f"{int(width)}x{int(height)}",
                "fps": round(fps, 2),
                "codec": codec,
                "connection_type": "RTSP" if stream.is_network_camera else "USB/Local"
            }
        
        return {
            "pen_id": pen_id,
            "is_running": stream.is_running,
            "frame_count": stream.frame_count,
            "camera_info": camera_info,
            "has_last_detection": stream.last_detection is not None,
            "last_detection": {
                "piglet_count": stream.last_detection.piglet_count,
                "sow_posture": stream.last_detection.sow_posture,
                "crushing_risk": stream.last_detection.crushing_risk,
                "timestamp": stream.last_detection.timestamp.isoformat()
            } if stream.last_detection else None
        }
    
    # Stream not running - check if configured (env vars OR db)
    # Normalize pen_id to match CAMERA_SOURCES keys
    normalized_pen_id = f"pen_{pen_id}" if pen_id.isdigit() else pen_id
    source = settings.CAMERA_SOURCES.get(normalized_pen_id)
    
    # Fall back to DB camera_source
    if source is None:
        source = await stream_manager._get_camera_source_from_db(pen_id)
    
    return {
        "pen_id": pen_id,
        "is_running": False,
        "frame_count": 0,
        "camera_info": {
            "source": str(source) if source else "Not configured",
            "is_network_camera": isinstance(source, str) and source and "rtsp" in source.lower(),
            "status": "disconnected"
        } if source else None,
        "has_last_detection": False,
        "last_detection": None
    }


@router.post("/{pen_id}/stop")
async def stop_stream(
    pen_id: str,
    current_user: User = Depends(get_current_user)
):
    """Stop and disconnect a video stream for a pen."""
    from app.services.camera_stream import stream_manager
    await stream_manager.stop_stream(pen_id)
    return {"message": f"Stream for pen {pen_id} stopped", "pen_id": pen_id}


@router.post("/{pen_id}/restart")
async def restart_stream(
    pen_id: str,
    current_user: User = Depends(get_current_user)
):
    """Restart a video stream for a pen (re-reads camera_source from DB)."""
    from app.services.camera_stream import stream_manager
    # Stop existing stream first
    await stream_manager.stop_stream(pen_id)

    # Re-create stream (will pick up new DB camera_source)
    stream = await stream_manager.get_stream(pen_id)
    
    if stream:
        return {"message": f"Stream for pen {pen_id} restarted", "pen_id": pen_id, "is_running": True}
    else:
        return {"message": f"No camera source configured for pen {pen_id}", "pen_id": pen_id, "is_running": False}
