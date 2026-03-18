import asyncio
from sqlalchemy import text
from app.core.database import engine

async def fix():
    async with engine.begin() as conn:
        # Delete ALL farrowing records for this sow (all have bad data from pycache bug)
        await conn.execute(text("DELETE FROM farrowing_records WHERE sow_id = 4"))
        
        # Reset Bella: parity back to 2, status active, clear farrowing date
        await conn.execute(text("""
            UPDATE sows 
            SET status = 'active', 
                parity = 2, 
                last_breeding_date = NULL, 
                last_farrowing_date = NULL,
                current_litter_size = 0
            WHERE tag_id = 'SOW-T10-001'
        """))
        
        # Verify
        result = await conn.execute(text("SELECT count(*) FROM farrowing_records WHERE sow_id = 4"))
        print(f"Farrowing records for Bella: {result.scalar()}")
        
        result = await conn.execute(text("SELECT id, tag_id, status, parity, last_breeding_date, last_farrowing_date FROM sows WHERE tag_id = 'SOW-T10-001'"))
        row = result.fetchone()
        print(f"Sow: id={row[0]} tag={row[1]} status={row[2]} parity={row[3]} breeding={row[4]} farrowing={row[5]}")

asyncio.run(fix())
