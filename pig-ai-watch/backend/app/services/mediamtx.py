"""MediaMTX RTSP Proxy Manager.

Dynamically manages MediaMTX paths via its REST API.
When a camera is added/removed in the UI, this module tells MediaMTX
to start/stop pulling from the camera's RTSP URL.

Architecture:
  Camera (192.168.5.99)  ←──  MediaMTX (localhost:8554/pen_X)  ←──  Backend
"""

import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# MediaMTX API v3 endpoints
_api = settings.MEDIAMTX_API_URL


async def is_running() -> bool:
    """Check if MediaMTX is reachable."""
    if not settings.MEDIAMTX_ENABLED:
        return False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_api}/v3/paths/list")
            return resp.status_code == 200
    except Exception:
        return False


async def add_camera(pen_name: str, rtsp_url: str) -> bool:
    """Register a camera path in MediaMTX so it pulls from the RTSP URL.
    
    Args:
        pen_name: Path name like "pen_5"
        rtsp_url: Full RTSP URL like "rtsp://user:pass@192.168.5.99:554/stream1"
    
    Returns:
        True if path was added/updated successfully.
    """
    if not settings.MEDIAMTX_ENABLED:
        logger.info(f"MediaMTX disabled — skipping add_camera for {pen_name}")
        return False

    path_config = {
        "source": rtsp_url,
        "sourceOnDemand": True,
        "sourceOnDemandStartTimeout": "15s",
        "sourceOnDemandCloseAfter": "30s",
        "rtspTransport": "tcp",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Try to add new path first
            resp = await client.post(
                f"{_api}/v3/config/paths/add/{pen_name}",
                json=path_config,
            )
            if resp.status_code == 200:
                logger.info(f"✅ MediaMTX: added path '{pen_name}' → {rtsp_url}")
                return True

            # Path might already exist — try patching instead
            if resp.status_code == 400:
                resp2 = await client.patch(
                    f"{_api}/v3/config/paths/patch/{pen_name}",
                    json=path_config,
                )
                if resp2.status_code == 200:
                    logger.info(f"✅ MediaMTX: updated path '{pen_name}' → {rtsp_url}")
                    return True
                logger.warning(f"MediaMTX patch failed for '{pen_name}': {resp2.status_code} {resp2.text}")
                return False

            logger.warning(f"MediaMTX add failed for '{pen_name}': {resp.status_code} {resp.text}")
            return False

    except Exception as e:
        logger.error(f"MediaMTX API error (add_camera '{pen_name}'): {e}")
        return False


async def remove_camera(pen_name: str) -> bool:
    """Remove a camera path from MediaMTX (stops pulling from camera).
    
    Args:
        pen_name: Path name like "pen_5"
    
    Returns:
        True if path was removed or didn't exist.
    """
    if not settings.MEDIAMTX_ENABLED:
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.delete(f"{_api}/v3/config/paths/delete/{pen_name}")
            if resp.status_code == 200:
                logger.info(f"🗑️  MediaMTX: removed path '{pen_name}'")
                return True
            if resp.status_code == 404:
                logger.info(f"MediaMTX: path '{pen_name}' already removed")
                return True
            logger.warning(f"MediaMTX delete failed for '{pen_name}': {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        logger.error(f"MediaMTX API error (remove_camera '{pen_name}'): {e}")
        return False


async def list_paths() -> list[str]:
    """List all active MediaMTX path names."""
    if not settings.MEDIAMTX_ENABLED:
        return []
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_api}/v3/paths/list")
            if resp.status_code == 200:
                data = resp.json()
                return [item["name"] for item in data.get("items", [])]
    except Exception as e:
        logger.error(f"MediaMTX API error (list_paths): {e}")
    return []


async def sync_from_db() -> int:
    """Sync all DB camera assignments to MediaMTX.
    
    Called on backend startup to ensure MediaMTX has paths for all
    pens that have cameras assigned.
    
    Returns:
        Number of paths synced.
    """
    if not settings.MEDIAMTX_ENABLED:
        return 0

    # Check MediaMTX is reachable
    if not await is_running():
        logger.warning("⚠️  MediaMTX not reachable — skipping sync. Start with: ./start_rtsp_proxy.sh --bg")
        return 0

    try:
        from app.core.database import AsyncSessionLocal
        from app.models.pig import Pen
        from sqlalchemy import select

        synced = 0
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Pen.id, Pen.camera_source).where(Pen.camera_source.isnot(None))
            )
            pens_with_cameras = result.all()

        # Get current MediaMTX paths
        current_paths = await list_paths()
        logger.info(f"📡 MediaMTX sync: {len(pens_with_cameras)} pens with cameras, {len(current_paths)} existing paths")

        # Add paths for pens with cameras
        for row in pens_with_cameras:
            pen_id = row[0]
            camera_source = row[1]
            pen_name = f"pen_{pen_id}"
            logger.info(f"  Registering pen_id={pen_id} as '{pen_name}' → {camera_source[:50]}...")
            if await add_camera(pen_name, camera_source):
                synced += 1

        # Remove stale paths (in MediaMTX but no longer in DB)
        active_pen_names = {f"pen_{row[0]}" for row in pens_with_cameras}
        for path in current_paths:
            if path.startswith("pen_") and path not in active_pen_names:
                await remove_camera(path)
                logger.info(f"🗑️  Removed stale MediaMTX path: {path}")

        logger.info(f"✅ MediaMTX sync complete: {synced} path(s) configured")
        return synced

    except Exception as e:
        logger.error(f"MediaMTX sync_from_db error: {e}", exc_info=True)
        return 0
