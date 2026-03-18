"""Rename sow status 'nursing' to 'lactating'

Revision ID: 006
Revises: 005
Create Date: 2025-06-20
"""
from alembic import op

# revision identifiers
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename existing 'nursing' status to 'lactating' for all sows
    op.execute("UPDATE sows SET status = 'lactating' WHERE status = 'nursing'")


def downgrade() -> None:
    # Revert 'lactating' back to 'nursing'
    op.execute("UPDATE sows SET status = 'nursing' WHERE status = 'lactating'")
