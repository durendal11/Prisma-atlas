import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.firebase import send_push_notification, init_firebase

init_firebase()

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.role == "admin"))
        admin_user = result.scalars().first()
        
        if admin_user and admin_user.fcm_token:
            print(f"Sending test push to {admin_user.username}...")
            res = send_push_notification(
                token=admin_user.fcm_token,
                title="Test Push Notification",
                body="This is a test to verify Firebase Cloud Messaging is working.",
                data={"test": "true"}
            )
            print("Result:", res)
        else:
            print("Admin user does not have an FCM token yet. If you've restarted the frontend, visit the site so the FCM token gets saved.")

if __name__ == "__main__":
    asyncio.run(main())
