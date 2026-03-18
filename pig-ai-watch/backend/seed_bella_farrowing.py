"""Seed Bella's farrowing data: 9 piglets born alive on January 31, 2026."""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def seed():
    async with engine.begin() as conn:
        # Get Bella's sow ID
        r = await conn.execute(text("SELECT id, parity, status FROM sows WHERE tag_id='SOW-T10-001'"))
        row = r.fetchone()
        if not row:
            print("ERROR: Sow Bella (SOW-T10-001) not found. Run seed_pen10.py first.")
            return
        sow_id = row[0]
        print(f"Found Bella: id={sow_id}, parity={row[1]}, status={row[2]}")

        # Clean any existing farrowing records for this sow
        await conn.execute(text("DELETE FROM farrowing_records WHERE sow_id = :sid"), {"sid": sow_id})
        print("Cleaned existing farrowing records")

        # Create farrowing record: 9 piglets born alive, Jan 31 2026
        await conn.execute(text("""
            INSERT INTO farrowing_records 
                (sow_id, pen_id, farrowing_started, farrowing_completed, total_born, born_alive, stillborn, mummified, sow_condition, notes)
            VALUES 
                (:sid, 10, '2026-01-31T08:00:00', '2026-01-31T12:00:00', 9, 9, 0, 0, 'good', 
                 'Normal farrowing. All 9 piglets healthy. Sow in good condition.')
        """), {"sid": sow_id})
        print("Farrowing record created: 9 piglets born alive, Jan 31, 2026")

        # Update Bella: status=lactating, parity=3, litter_size=9, last_farrowing_date
        await conn.execute(text("""
            UPDATE sows SET 
                status = 'lactating',
                parity = 3,
                current_litter_size = 9,
                last_farrowing_date = '2026-01-31T12:00:00',
                expected_farrowing_date = NULL,
                last_breeding_date = NULL
            WHERE id = :sid
        """), {"sid": sow_id})
        print("Bella updated: lactating, parity=3, litter_size=9")

    # Verify
    async with engine.connect() as conn:
        r = await conn.execute(text(
            "SELECT id, name, status, parity, current_litter_size, last_farrowing_date FROM sows WHERE tag_id='SOW-T10-001'"
        ))
        row = r.fetchone()
        print(f"\nVerify Bella: id={row[0]}, name={row[1]}, status={row[2]}, parity={row[3]}, litter={row[4]}, last_farrowing={row[5]}")

        r = await conn.execute(text(
            "SELECT id, born_alive, total_born, farrowing_started, farrowing_completed, sow_condition FROM farrowing_records WHERE sow_id = :sid"
        ), {"sid": row[0]})
        rec = r.fetchone()
        print(f"Verify record: id={rec[0]}, alive={rec[1]}, total={rec[2]}, started={rec[3]}, completed={rec[4]}, condition={rec[5]}")


if __name__ == "__main__":
    asyncio.run(seed())
