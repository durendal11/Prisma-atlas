"""Add last_breeding_date to sows table

Revision ID: 005
Revises: 004
Create Date: 2026-02-20
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005'
down_revision = '004_pen_cleaning'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sows', sa.Column('last_breeding_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('sows', 'last_breeding_date')
