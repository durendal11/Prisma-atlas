import asyncio
from sqlalchemy import text
from app.core.database import engine, init_db

async def patch_db():
    print("Initializing DB...")
    await init_db()
    
    print("Patching database columns...")
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE sows ADD COLUMN IF NOT EXISTS intensified_monitoring BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE sows ADD COLUMN IF NOT EXISTS prolonged_gestation BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE sows ADD COLUMN IF NOT EXISTS overdue_acknowledged_at TIMESTAMP WITH TIME ZONE;"))
            await conn.execute(text("ALTER TABLE sows ADD COLUMN IF NOT EXISTS overdue_notes TEXT;"))
            print("Successfully padded missing columns.")
        except Exception as e:
            print(f"Error during patch: {e}")

if __name__ == "__main__":
    asyncio.run(patch_db())
