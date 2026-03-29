import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app.core.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import update

async def clear_tokens():
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).values(fcm_token=None))
        await db.commit()
        print("✅ Cleared all stale FCM tokens from the database.")

if __name__ == "__main__":
    asyncio.run(clear_tokens())
