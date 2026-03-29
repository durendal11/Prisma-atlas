import os
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app.core.database import AsyncSessionLocal
from app.models.user import User
from firebase_admin import messaging, _apps
import asyncio
from sqlalchemy import select
from app.core.firebase import init_firebase

async def test_push():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.fcm_token.isnot(None)))
        users = result.scalars().all()
        if not users:
            print("No users found with a registered FCM token in the database!")
            return

        user = users[0]
        print(f"📡 Found user '{user.username}' with an FCM token. Attempting to send data-only push...")
        
        # Testing a direct Data-Only message to trigger onBackgroundMessage
        message = messaging.Message(
            data={
                "title": "Oink Oink! 🐷 Background Test",
                "body": "This is a direct data-only notification triggered from backend.",
                "type": "test_alert"
            },
            token=user.fcm_token,
        )
        
        try:
            response = messaging.send(message)
            print("✅ Success! Notification sent.", response)
        except Exception as e:
            print("❌ Failed:", str(e))

if __name__ == "__main__":
    init_firebase()
    asyncio.run(test_push())