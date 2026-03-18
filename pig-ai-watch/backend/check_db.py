import asyncio
from sqlalchemy import text
from app.core.database import engine

async def check():
    async with engine.begin() as conn:
        result = await conn.execute(text('SELECT id, sow_id, pen_id, born_alive, stillborn, total_born, farrowing_started, farrowing_completed FROM farrowing_records ORDER BY id'))
        rows = result.fetchall()
        print(f'Farrowing records: {len(rows)}')
        for r in rows:
            print(f'  id={r[0]} sow={r[1]} pen={r[2]} alive={r[3]} still={r[4]} total={r[5]} started={r[6]} completed={r[7]}')
        
        result = await conn.execute(text("SELECT id, tag_id, status, parity, last_breeding_date, last_farrowing_date, pen_id FROM sows WHERE tag_id='SOW-T10-001'"))
        row = result.fetchone()
        if row:
            print(f'Sow: id={row[0]} tag={row[1]} status={row[2]} parity={row[3]} breeding={row[4]} farrowing={row[5]} pen={row[6]}')

asyncio.run(check())
