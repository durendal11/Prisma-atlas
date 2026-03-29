from sqlalchemy import select, String, Integer, Column, ForeignKey
from sqlalchemy.orm import declarative_base, with_loader_criteria
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

Base = declarative_base()

class TenantAware:
    owner_id = Column(Integer, nullable=True)

class Pen(TenantAware, Base):
    __tablename__ = "pens"
    id = Column(Integer, primary_key=True)
    name = Column(String(50))

engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession)

from sqlalchemy import event
from sqlalchemy.orm import Session

@event.listens_for(Session, "do_orm_execute")
def _add_tenant_criteria(execute_state):
    if execute_state.is_orm_statement:
        tenant_id = execute_state.session.info.get("tenant_id")
        if tenant_id is not None:
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    TenantAware,
                    lambda cls: cls.owner_id == tenant_id,
                    include_aliases=True
                )
            )

import asyncio

async def test():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSessionLocal() as session:
        session.add_all([
            Pen(id=1, name="My Pen", owner_id=1),
            Pen(id=2, name="Other Pen", owner_id=2)
        ])
        await session.commit()
        
    async with AsyncSessionLocal() as session:
        session.info["tenant_id"] = 1
        result = await session.execute(select(Pen))
        pens = result.scalars().all()
        print([p.name for p in pens])
        assert len(pens) == 1

asyncio.run(test())