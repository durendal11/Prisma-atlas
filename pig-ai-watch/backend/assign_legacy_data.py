import asyncio
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.pig import TenantAware

async def run():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).order_by(User.id).limit(1))
        root_user = result.scalar_one_or_none()
        if not root_user:
            return
            
        print(f"Assigning legacy data to User {root_user.id} ({root_user.username})")
        
        classes = TenantAware.__subclasses__()
        for cls in classes:
            await session.execute(update(cls).where(cls.owner_id == None).values(owner_id=root_user.id))
            
        await session.commit()
        print("Done.")

asyncio.run(run())
