"""Seed Pen 10 and Sow Bella for TestPenPage."""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def seed():
    async with engine.begin() as conn:
        # Insert Pen 10
        await conn.execute(text(
            "INSERT INTO pens (id, name, location, is_active, cleanliness_score, wetness_score, cleaning_interval_hours) "
            "VALUES (10, 'Pen 10', 'Test Pen - Upload Detection', true, 85, 15, 24) "
            "ON CONFLICT (id) DO NOTHING"
        ))
        print("Pen 10 inserted")

        # Reset sequence so future auto-increments don't collide
        await conn.execute(text(
            "SELECT setval('pens_id_seq', GREATEST((SELECT MAX(id) FROM pens), 10))"
        ))
        print("pens_id_seq reset")

        # Insert Bella sow
        await conn.execute(text(
            "INSERT INTO sows (tag_id, name, breed, parity, status, current_litter_size, pen_id) "
            "VALUES ('SOW-T10-001', 'Bella', 'Large White', 2, 'active', 0, 10) "
            "ON CONFLICT (tag_id) DO NOTHING"
        ))
        print("Sow Bella inserted")

    # Verify
    async with engine.connect() as conn:
        r = await conn.execute(text("SELECT id, name FROM pens WHERE id=10"))
        print(f"Verify pen: {r.fetchone()}")
        r = await conn.execute(text("SELECT id, name, pen_id FROM sows WHERE tag_id='SOW-T10-001'"))
        print(f"Verify sow: {r.fetchone()}")


if __name__ == "__main__":
    asyncio.run(seed())
