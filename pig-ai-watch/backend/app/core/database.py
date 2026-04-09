import logging

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# Check if using SQLite for different engine configuration
is_sqlite = settings.resolved_database_url.startswith("sqlite")

engine_kwargs = {
    "echo": settings.DEBUG,
}

if not is_sqlite:
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20
    })

engine = create_async_engine(
    settings.resolved_database_url,
    **engine_kwargs
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


Base = declarative_base()
logger = logging.getLogger(__name__)

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

@event.listens_for(Session, "do_orm_execute")
def _add_tenant_filter(execute_state):
    # Skip if not an ORM statement
    if not execute_state.is_orm_statement or execute_state.execution_options.get('ignore_tenant'):
        return
        
    # Get tenant_id from execution_options
    tenant_id = execute_state.session.info.get("tenant_id")
    if tenant_id is not None:
        try:
            # We import here to avoid circular imports
            from app.models.pig import TenantAware
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    TenantAware,
                    lambda cls: cls.owner_id == tenant_id,
                    include_aliases=True
                )
            )
        except ImportError:
            pass




async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_archive_columns)


def _ensure_archive_columns(sync_conn):
    inspector = inspect(sync_conn)

    table_column_patches = {
        "sows": {
            "is_archived": "BOOLEAN NOT NULL DEFAULT FALSE",
            "archived_at": "TIMESTAMP",
        },
        "behavior_logs": {
            "is_archived": "BOOLEAN NOT NULL DEFAULT FALSE",
            "archived_at": "TIMESTAMP",
        },
        # Auth/runtime compatibility guard for environments that missed migrations.
        "users": {
            "google_sub": "VARCHAR(255)",
            "auth_provider": "VARCHAR(50) DEFAULT 'local'",
            "fcm_token": "VARCHAR(255)",
            "language": "VARCHAR(10) DEFAULT 'en'",
        },
    }

    for table_name, column_map in table_column_patches.items():
        if not inspector.has_table(table_name):
            continue

        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_ddl in column_map.items():
            if column_name not in existing_columns:
                try:
                    sync_conn.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_ddl}"
                    )
                    logger.warning(
                        "Added missing runtime DB column %s.%s via startup compatibility patch",
                        table_name,
                        column_name,
                    )
                except Exception as exc:
                    logger.warning(
                        "Failed adding startup compatibility column %s.%s: %s",
                        table_name,
                        column_name,
                        exc,
                    )

from sqlalchemy.orm import Mapper

@event.listens_for(Session, "before_flush")
def _receive_before_flush(session, flush_context, instances):
    tenant_id = session.info.get("tenant_id")
    if tenant_id is None:
        return
        
    for obj in session.new:
        try:
            from app.models.pig import TenantAware
            if isinstance(obj, TenantAware):
                obj.owner_id = tenant_id
        except ImportError:
            pass
