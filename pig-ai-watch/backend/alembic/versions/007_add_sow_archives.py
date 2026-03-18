"""Add archive fields for sows and behavior logs

Revision ID: 007
Revises: 006
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa


revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in ('sows', 'behavior_logs'):
        if not inspector.has_table(table_name):
            continue

        columns = {column['name'] for column in inspector.get_columns(table_name)}
        if 'is_archived' not in columns:
            op.add_column(table_name, sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.false()))
        if 'archived_at' not in columns:
            op.add_column(table_name, sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in ('behavior_logs', 'sows'):
        if not inspector.has_table(table_name):
            continue

        columns = {column['name'] for column in inspector.get_columns(table_name)}
        if 'archived_at' in columns:
            op.drop_column(table_name, 'archived_at')
        if 'is_archived' in columns:
            op.drop_column(table_name, 'is_archived')