import re

with open("app/core/database.py", "r") as f:
    content = f.read()

injection = """
Base = declarative_base()

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

@event.listens_for(Session, "do_orm_execute")
def _add_tenant_filter(execute_state):
    # Skip if not an ORM statement
    if not execute_state.is_orm_statement:
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

"""

if "def _add_tenant_filter" not in content:
    content = content.replace("Base = declarative_base()", injection)

with open("app/core/database.py", "w") as f:
    f.write(content)

print("Patch applied to database.py")
