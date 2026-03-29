import asyncio
from sqlalchemy import update
from app.core.database import AsyncSessionLocal
from app.models.user import User

async def run():
    async with AsyncSessionLocal() as s:
        await s.execute(update(User).values(role="admin"))
        await s.commit()

asyncio.run(run())
