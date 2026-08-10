import firebase_admin
from firebase_admin import credentials, messaging
import os
import json
import logging
import asyncio
import base64

logger = logging.getLogger(__name__)

def init_firebase():
    """Initialize Firebase Admin SDK using structured env var or service account key file."""
    # First, try to load from an environment variable (best for Digital Ocean / Docker)
    env_creds_b64 = os.getenv("FIREBASE_CREDENTIALS_B64")
    env_creds = os.getenv("FIREBASE_CREDENTIALS_JSON")
    
    if env_creds_b64:
        try:
            decoded = base64.b64decode(env_creds_b64).decode('utf-8')
            cred_dict = json.loads(decoded)
            cred = credentials.Certificate(cred_dict)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully from B64 ENV var")
            return
        except Exception as e:
            logger.error(f"Failed to initialize Firebase from B64 ENV var: {e}")

    if env_creds:
        try:
            cred_dict = json.loads(env_creds)
            cred = credentials.Certificate(cred_dict)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully from ENV var")
            return
        except Exception as e:
            logger.error(f"Failed to initialize Firebase from ENV var: {e}")

    # Fallback to local file
    key_path = os.path.join(os.path.dirname(__file__), '../../../serviceAccountKey.json')
    key_path = os.path.abspath(key_path)
    
    if os.path.exists(key_path):
        try:
            cred = credentials.Certificate(key_path)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully from file")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase from file: {e}")
    else:
        logger.warning(f"Firebase service account key not found at {key_path} and FIREBASE_CREDENTIALS_JSON tracking not set. Push notifications will not work.")

def send_push_notification(token: str, title: str, body: str, data: dict = None):
    """Send a push notification to a specific device token."""
    if not firebase_admin._apps:
        logger.warning("Firebase not initialized. Cannot send notification.")
        return {"success": False, "error": "Firebase not initialized"}
        
    try:
        str_data = {k: str(v) for k, v in data.items()} if data else {}
        
        # We use a DATA-ONLY message payload here for reliable background Service Worker handling on web/desktop.
        str_data["title"] = title
        str_data["body"] = body
        
        message = messaging.Message(
            data=str_data,
            token=token,
        )
        response = messaging.send(message)
        logger.info(f"Successfully sent message: {response}")
        return {"success": True, "message_id": response}
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        return {"success": False, "error": str(e)}

async def broadcast_alert(title: str, body: str, alert_type: str = "system", pen_id: int = None, severity: str = "medium"):
    """
    Sends a push notification asynchronously to all subscribed users.
    """
    if not firebase_admin._apps:
        return
        
    async def _send():
        try:
            # We import here to avoid circular imports during startup
            from sqlalchemy import select
            from app.core.database import AsyncSessionLocal
            from app.models.user import User

            async with AsyncSessionLocal() as db:
                result = await db.execute(select(User).where(User.fcm_token.isnot(None)))
                users = result.scalars().all()
                if not users:
                    return

                for user in users:
                    if not user.fcm_token:
                        continue
                    try:
                        from app.core.i18n import translate
                        user_lang = getattr(user, "language", "en")
                        
                        user_data_payload = {
                            "title": translate(title, user_lang),
                            "body": translate(body, user_lang),
                            "type": alert_type,
                            "severity": severity,
                        }
                        if pen_id is not None:
                            user_data_payload["pen_id"] = str(pen_id)

                        user_str_data = {k: str(v) for k, v in user_data_payload.items()}
                        
                        msg = messaging.Message(
                            data=user_str_data,
                            token=user.fcm_token,
                        )
                        messaging.send(msg)
                    except Exception as e:
                        logger.error(f"Failed to send to token {user.fcm_token}: {e}")
        except Exception as e:
            logger.error(f"Error broadcasting push alert: {e}")

    # Fire and forget — Firebase push
    asyncio.create_task(_send())

    # Fire and forget — Email notification (no-ops when SMTP_ENABLED=False)
    from app.services.email_sender import send_alert_email
    asyncio.create_task(
        send_alert_email(
            title=title,
            body=body,
            alert_type=alert_type,
            pen_id=pen_id,
            severity=severity,
        )
    )
