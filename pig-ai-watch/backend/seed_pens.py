#!/usr/bin/env python3
"""Seed script to create default pens."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/pig_ai_watch"
)

async def seed_pens():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check if pens exist
        result = await session.execute(text("SELECT COUNT(*) FROM pens"))
        count = result.scalar()
        
        if count > 0:
            print(f'Pens already exist ({count} pens)')
            await engine.dispose()
            return
        
        # Create default pens
        pens = [
            {'name': 'Pen 1', 'location': 'Building A - Section 1', 'is_active': True},
            {'name': 'Pen 2', 'location': 'Building A - Section 2', 'is_active': True},
            {'name': 'Pen 3', 'location': 'Building A - Section 3', 'is_active': True},
            {'name': 'Pen 4', 'location': 'Building B - Section 1', 'is_active': True},
            {'name': 'Pen 5', 'location': 'Building B - Section 2', 'is_active': True},
        ]
        
        for pen in pens:
            await session.execute(text('''
                INSERT INTO pens (name, location, is_active)
                VALUES (:name, :location, :is_active)
            '''), pen)
        
        await session.commit()
        print(f'✅ Created {len(pens)} pens!')
        for pen in pens:
            print(f'   - {pen["name"]} ({pen["location"]})')
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_pens())
