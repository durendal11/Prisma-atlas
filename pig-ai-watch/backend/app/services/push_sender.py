import asyncio
import importlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import cast, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.pig import NotificationLog, NotificationSubscription


logger = logging.getLogger(__name__)

_FCM_SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]


def _is_in_quiet_hours(now_local_time, quiet_start, quiet_end) -> bool:
    if quiet_start is None or quiet_end is None:
        return False
    if quiet_start == quiet_end:
        return True
    if quiet_start < quiet_end:
        return quiet_start <= now_local_time < quiet_end
    return now_local_time >= quiet_start or now_local_time < quiet_end


def _get_fcm_access_token() -> str:
    if not settings.FCM_SERVICE_ACCOUNT_JSON:
        raise RuntimeError("FCM_SERVICE_ACCOUNT_JSON is not configured")

    service_account = importlib.import_module("google.oauth2.service_account")
    google_requests = importlib.import_module("google.auth.transport.requests")

    credentials = service_account.Credentials.from_service_account_file(
        settings.FCM_SERVICE_ACCOUNT_JSON,
        scopes=_FCM_SCOPES,
    )
    credentials.refresh(google_requests.Request())
    if not credentials.token:
        raise RuntimeError("Unable to generate FCM access token")
    return credentials.token


async def _get_fcm_access_token_async() -> str:
    return await asyncio.to_thread(_get_fcm_access_token)


async def send_push_notification(pen_id: int, alert: dict[str, Any], db: AsyncSession):
    """Send alert push notifications to subscribed devices and log each attempt."""
    priority = str(alert.get("priority", "ROUTINE")).upper()
    alert_type = str(alert.get("alert_type", "unknown"))
    push_title = str(alert.get("push_title", "Pig AI Alert"))
    push_body = str(alert.get("push_body", "New alert"))
    suppress_until_minutes = int(alert.get("suppress_until_minutes", 0) or 0)

    # ROUTINE alerts are digest-only and not sent as immediate pushes.
    if priority == "ROUTINE":
        return

    # Suppress repeat MEDIUM alerts for the same pen and type within the cooldown window.
    if priority == "MEDIUM" and suppress_until_minutes > 0:
        cutoff = datetime.utcnow() - timedelta(minutes=suppress_until_minutes)
        result = await db.execute(
            select(NotificationLog.id).where(
                NotificationLog.pen_id == pen_id,
                NotificationLog.alert_type == alert_type,
                NotificationLog.sent_at >= cutoff,
            ).limit(1)
        )
        previous = result.scalar_one_or_none()
        if previous is not None:
            return

    stmt = select(NotificationSubscription)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        stmt = stmt.where(cast(NotificationSubscription.pen_ids, JSONB).contains([pen_id]))

    result = await db.execute(stmt)
    subscriptions = result.scalars().all()

    # Keep only subscribers whose configured pen_ids include this pen.
    subscriptions = [s for s in subscriptions if isinstance(s.pen_ids, list) and pen_id in s.pen_ids]
    if not subscriptions:
        return

    project_id = settings.FCM_PROJECT_ID
    if not project_id:
        raise RuntimeError("FCM_PROJECT_ID is not configured")

    access_token = await _get_fcm_access_token_async()
    now_time = datetime.now().time()

    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    httpx = importlib.import_module("httpx")
    async with httpx.AsyncClient(timeout=20.0) as client:
        for subscription in subscriptions:
            if _is_in_quiet_hours(now_time, subscription.quiet_start, subscription.quiet_end):
                continue

            payload = {
                "message": {
                    "token": subscription.device_token,
                    "notification": {
                        "title": push_title,
                        "body": push_body,
                    },
                    "data": {
                        "pen_id": str(pen_id),
                        "priority": priority,
                        "alert_type": alert_type,
                    },
                    "android": {"priority": "high"},
                    "apns": {"headers": {"apns-priority": "10"}},
                }
            }

            delivered = False
            try:
                response = await client.post(url, headers=headers, content=json.dumps(payload))
                delivered = response.status_code < 300
                if not delivered:
                    logger.warning(
                        "FCM send failed for token %s: %s %s",
                        subscription.device_token,
                        response.status_code,
                        response.text,
                    )
            except Exception:
                logger.exception("FCM send raised for token %s", subscription.device_token)

            db.add(
                NotificationLog(
                    pen_id=pen_id,
                    device_token=subscription.device_token,
                    alert_type=alert_type,
                    priority=priority,
                    push_title=push_title,
                    push_body=push_body,
                    delivered=delivered,
                )
            )

    await db.commit()
