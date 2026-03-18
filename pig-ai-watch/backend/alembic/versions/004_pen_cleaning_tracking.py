"""Add pen environment tracking columns for cleaning task integration

Revision ID: 004_pen_cleaning
Revises: 003_tasks_farrowing
Create Date: 2026-01-30 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '004_pen_cleaning'
down_revision: Union[str, None] = '003_tasks_farrowing'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add environment tracking columns to pens table
    op.add_column('pens', sa.Column('cleanliness_score', sa.Float(), nullable=True, server_default='1.0'))
    op.add_column('pens', sa.Column('wetness_score', sa.Float(), nullable=True, server_default='0.0'))
    op.add_column('pens', sa.Column('last_cleaned_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('pens', sa.Column('next_cleaning_due', sa.DateTime(timezone=True), nullable=True))
    op.add_column('pens', sa.Column('cleaning_interval_hours', sa.Integer(), nullable=True, server_default='24'))


def downgrade() -> None:
    op.drop_column('pens', 'cleaning_interval_hours')
    op.drop_column('pens', 'next_cleaning_due')
    op.drop_column('pens', 'last_cleaned_at')
    op.drop_column('pens', 'wetness_score')
    op.drop_column('pens', 'cleanliness_score')
