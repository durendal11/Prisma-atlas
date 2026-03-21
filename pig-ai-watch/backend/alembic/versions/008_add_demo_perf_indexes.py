"""Add demo performance composite indexes

Revision ID: 008_add_demo_perf_indexes
Revises: 007
Create Date: 2026-03-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '008_add_demo_perf_indexes'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_detections_pen_created_desc',
        'detections',
        ['pen_id', sa.text('created_at DESC')],
        unique=False,
    )
    op.create_index(
        'ix_detections_frame_timestamp',
        'detections',
        ['frame_timestamp'],
        unique=False,
    )
    op.create_index(
        'ix_events_pen_created_desc',
        'events',
        ['pen_id', sa.text('created_at DESC')],
        unique=False,
    )
    op.create_index(
        'ix_alerts_resolved_created_desc',
        'alerts',
        ['is_resolved', sa.text('created_at DESC')],
        unique=False,
    )
    op.create_index(
        'ix_behavior_logs_pen_logged_archived',
        'behavior_logs',
        ['pen_id', sa.text('logged_at DESC'), 'is_archived'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_behavior_logs_pen_logged_archived', table_name='behavior_logs')
    op.drop_index('ix_alerts_resolved_created_desc', table_name='alerts')
    op.drop_index('ix_events_pen_created_desc', table_name='events')
    op.drop_index('ix_detections_frame_timestamp', table_name='detections')
    op.drop_index('ix_detections_pen_created_desc', table_name='detections')
