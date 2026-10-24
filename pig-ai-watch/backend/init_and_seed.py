import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.models.pig import Pen
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

async def main():
    print(f"Initializing database at: {settings.resolved_database_url}")
    await init_db()
    print("Database tables initialized.")

    async with AsyncSessionLocal() as session:
        # Check admin
        res = await session.execute(select(User).where(User.username == "admin"))
        admin = res.scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                email="admin@pigaiwatch.com",
                hashed_password=get_password_hash("admin123"),
                full_name="Administrator",
                role="admin",
                is_active=True,
            )
            session.add(admin)
            await session.commit()
            print("Created default admin user (admin / admin123).")
        else:
            print("Admin user already exists.")

        # Check pens
        res = await session.execute(select(Pen))
        pens = res.scalars().all()
        if not pens:
            for i in range(1, 6):
                pen = Pen(
                    name=f"Pen {i}",
                    location=f"Building A - Section {i}",
                    is_active=True,
                )
                session.add(pen)
            await session.commit()
            print("Created default pens (Pen 1 - Pen 5).")
        else:
            print(f"{len(pens)} pens already exist.")

    print("Init and seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
