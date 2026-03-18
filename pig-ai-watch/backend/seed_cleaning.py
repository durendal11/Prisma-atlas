import asyncio
from datetime import datetime, timedelta
from app.core.database import engine
from app.models.pig import Pen
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select

async def seed_cleaning_data():
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        result = await db.execute(select(Pen))
        pens = result.scalars().all()
        
        now = datetime.utcnow()
        
        for i, pen in enumerate(pens):
            if i == 0:
                # Pen 1: Overdue by 2 hours
                pen.last_cleaned_at = now - timedelta(hours=26)
                pen.next_cleaning_due = now - timedelta(hours=2)
                pen.cleanliness_score = 0.4
                pen.wetness_score = 0.6
            elif i == 1:
                # Pen 2: Due in 2 hours (due soon)
                pen.last_cleaned_at = now - timedelta(hours=22)
                pen.next_cleaning_due = now + timedelta(hours=2)
                pen.cleanliness_score = 0.6
                pen.wetness_score = 0.4
            elif i == 2:
                # Pen 3: Overdue by 5 hours
                pen.last_cleaned_at = now - timedelta(hours=29)
                pen.next_cleaning_due = now - timedelta(hours=5)
                pen.cleanliness_score = 0.3
                pen.wetness_score = 0.7
            elif i == 3:
                # Pen 4: OK - cleaned 10 hours ago
                pen.last_cleaned_at = now - timedelta(hours=10)
                pen.next_cleaning_due = now + timedelta(hours=14)
                pen.cleanliness_score = 0.85
                pen.wetness_score = 0.2
            else:
                # Pen 5: Due in 3 hours (due soon)
                pen.last_cleaned_at = now - timedelta(hours=21)
                pen.next_cleaning_due = now + timedelta(hours=3)
                pen.cleanliness_score = 0.5
                pen.wetness_score = 0.5
            pen.cleaning_interval_hours = 24
        
        await db.commit()
        print(f'Updated {len(pens)} pens with cleaning data')

if __name__ == "__main__":
    asyncio.run(seed_cleaning_data())
