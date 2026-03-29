import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.firebase import send_push_notification, init_firebase
import asyncio
from sqlalchemy import select

async def test_push():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.fcm_token.isnot(None)))
        users = result.scalars().all()
        if not users:
            print("❌ No users found with a registered FCM token in the database!")
            print("Please log into the web UI first and allow notifications.")
            return

        user = users[0]
        print(f"📡 Found user '{user.username}' with an FCM token. Attempting to send push...")
        
        response = send_push_notification(
            token=user.fcm_token,
            title="Oink Oink! 🐷 Test Alert",
            body="This is a direct test notification triggered from the backend debug script.",
            data={"type": "test_alert", "url": "/dashboard"}
        )
        
        if response.get("success"):
            print("✅ Success! Notification sent.")
        else:
            print(f"❌ Failed to send: {response.get('error')}")

if __name__ == "__main__":
    init_firebase()
    asyncio.run(test_push())
