"""
Telegram Alert Sender — Real-time farm alert delivery via Telegram Bot API.

Sends formatted HTML alert messages (and optional snapshots) directly to
a Telegram user, group, or channel when high or critical alerts trigger.

Configuration (via .env or Settings):
    TELEGRAM_ENABLED=True
    TELEGRAM_BOT_TOKEN=8979923577:AAEyhNDQFeb34t2V_KQnWJiUFhhQTN6ZdHw
    TELEGRAM_CHAT_ID= (optional, auto-detected from /start if left empty)
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# Severity levels that trigger Telegram dispatch
TELEGRAM_ALERT_SEVERITIES = {"critical", "high", "medium"}

_cached_chat_ids: list[str] = []


async def get_or_detect_chat_ids(client: httpx.AsyncClient) -> list[str]:
    """Return configured chat IDs or auto-detect from the bot's latest updates."""
    global _cached_chat_ids

    configured = getattr(settings, "TELEGRAM_CHAT_ID", None)
    if configured:
        # Support comma-separated list of chat IDs
        ids = [cid.strip() for cid in str(configured).split(",") if cid.strip()]
        if ids:
            return ids

    if _cached_chat_ids:
        return _cached_chat_ids

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return []

    try:
        url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
        resp = await client.get(url, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("result", [])
            detected = []
            for update in reversed(results):
                msg = update.get("message") or update.get("channel_post") or update.get("my_chat_member")
                if msg and "chat" in msg and "id" in msg["chat"]:
                    cid = str(msg["chat"]["id"])
                    if cid not in detected:
                        detected.append(cid)
            if detected:
                _cached_chat_ids = detected
                logger.info(f"Auto-detected Telegram chat_ids: {detected}")
                return detected
    except Exception as e:
        logger.warning(f"Failed to auto-detect Telegram chat_id: {e}")

    return []


def _format_telegram_message(
    title: str,
    body: str,
    alert_type: str,
    pen_id: Optional[int],
    severity: str,
) -> str:
    """Format rich HTML message for Telegram."""
    sev_upper = severity.upper()
    icon = "🚨" if sev_upper == "CRITICAL" else ("⚠️" if sev_upper == "HIGH" else "ℹ️")
    timestamp = datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    pen_label = f"Pen {pen_id}" if pen_id is not None else "General / All Pens"

    return (
        f"{icon} <b>PRISMA ATLAS — {sev_upper} ALERT</b>\n\n"
        f"📍 <b>Location:</b> {pen_label}\n"
        f"🏷️ <b>Type:</b> {alert_type.replace('_', ' ').title()}\n"
        f"📋 <b>Summary:</b> {title}\n"
        f"📝 <b>Details:</b> {body}\n\n"
        f"🕒 <b>Timestamp:</b> {timestamp}\n"
        f"🔗 <a href='http://localhost:3000'>Open Live Dashboard</a>"
    )


async def send_telegram_alert(
    title: str,
    body: str,
    alert_type: str = "alert",
    pen_id: Optional[int] = None,
    severity: str = "high",
    photo_bytes: Optional[bytes] = None,
) -> bool:
    """
    Send an alert to Telegram asynchronously.
    Silently returns False if disabled or credentials missing.
    """
    if not getattr(settings, "TELEGRAM_ENABLED", True):
        return False

    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token:
        logger.debug("Telegram alert skipped: TELEGRAM_BOT_TOKEN not configured.")
        return False

    severity_lower = severity.lower()
    if severity_lower not in TELEGRAM_ALERT_SEVERITIES:
        logger.debug(f"Telegram alert skipped: severity '{severity}' not in {TELEGRAM_ALERT_SEVERITIES}")
        return False

    text = _format_telegram_message(
        title=title,
        body=body,
        alert_type=alert_type,
        pen_id=pen_id,
        severity=severity,
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            chat_ids = await get_or_detect_chat_ids(client)
            if not chat_ids:
                logger.warning(
                    "Telegram alert not sent: No TELEGRAM_CHAT_ID set and no incoming messages found on @PgBarn_bot. "
                    "Open Telegram and message /start to the bot."
                )
                return False

            delivered_any = False
            for cid in chat_ids:
                try:
                    if photo_bytes:
                        url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
                        files = {"photo": ("alert.jpg", photo_bytes, "image/jpeg")}
                        data = {"chat_id": cid, "caption": text, "parse_mode": "HTML"}
                        resp = await client.post(url, data=data, files=files)
                    else:
                        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                        payload = {
                            "chat_id": cid,
                            "text": text,
                            "parse_mode": "HTML",
                            "disable_web_page_preview": True,
                        }
                        resp = await client.post(url, json=payload)

                    if resp.status_code == 200:
                        logger.info(f"Telegram alert delivered to chat {cid}")
                        delivered_any = True
                    else:
                        logger.error(f"Telegram API error for chat {cid} ({resp.status_code}): {resp.text}")
                except Exception as ex:
                    logger.error(f"Error sending to chat {cid}: {ex}")

            return delivered_any

    except Exception as e:
        logger.error(f"Failed to dispatch Telegram alert: {e}")
        return False


async def test_telegram_connection() -> Dict[str, Any]:
    """Test the bot credentials and report connection status and detected chat IDs."""
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token:
        return {"status": "error", "message": "TELEGRAM_BOT_TOKEN not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Get Bot Info
            me_resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
            if me_resp.status_code != 200:
                return {"status": "error", "message": f"Invalid bot token ({me_resp.status_code})"}
            bot_info = me_resp.json().get("result", {})

            # 2. Check updates / chat_ids
            chat_ids = await get_or_detect_chat_ids(client)

            return {
                "status": "ok",
                "bot_id": bot_info.get("id"),
                "bot_name": bot_info.get("first_name"),
                "bot_username": bot_info.get("username"),
                "chat_ids": chat_ids,
                "ready_to_send": bool(chat_ids),
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}
