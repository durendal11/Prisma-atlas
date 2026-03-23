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


def _has_table(inspector: sa.Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(idx.get('name') == index_name for idx in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, 'detections') and not _has_index(inspector, 'detections', 'ix_detections_pen_created_desc'):
        op.create_index(
            'ix_detections_pen_created_desc',
            'detections',
            ['pen_id', sa.text('created_at DESC')],
            unique=False,
        )

    if _has_table(inspector, 'detections') and not _has_index(inspector, 'detections', 'ix_detections_frame_timestamp'):
        op.create_index(
            'ix_detections_frame_timestamp',
            'detections',
            ['frame_timestamp'],
            unique=False,
        )

    if _has_table(inspector, 'events') and not _has_index(inspector, 'events', 'ix_events_pen_created_desc'):
        op.create_index(
            'ix_events_pen_created_desc',
            'events',
            ['pen_id', sa.text('created_at DESC')],
            unique=False,
        )

    if _has_table(inspector, 'alerts') and not _has_index(inspector, 'alerts', 'ix_alerts_resolved_created_desc'):
        op.create_index(
            'ix_alerts_resolved_created_desc',
            'alerts',
            ['is_resolved', sa.text('created_at DESC')],
            unique=False,
        )

    if _has_table(inspector, 'behavior_logs') and not _has_index(inspector, 'behavior_logs', 'ix_behavior_logs_pen_logged_archived'):
        op.create_index(
            'ix_behavior_logs_pen_logged_archived',
            'behavior_logs',
            ['pen_id', sa.text('logged_at DESC'), 'is_archived'],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, 'behavior_logs') and _has_index(inspector, 'behavior_logs', 'ix_behavior_logs_pen_logged_archived'):
        op.drop_index('ix_behavior_logs_pen_logged_archived', table_name='behavior_logs')
    if _has_table(inspector, 'alerts') and _has_index(inspector, 'alerts', 'ix_alerts_resolved_created_desc'):
        op.drop_index('ix_alerts_resolved_created_desc', table_name='alerts')
    if _has_table(inspector, 'events') and _has_index(inspector, 'events', 'ix_events_pen_created_desc'):
        op.drop_index('ix_events_pen_created_desc', table_name='events')
    if _has_table(inspector, 'detections') and _has_index(inspector, 'detections', 'ix_detections_frame_timestamp'):
        op.drop_index('ix_detections_frame_timestamp', table_name='detections')
    if _has_table(inspector, 'detections') and _has_index(inspector, 'detections', 'ix_detections_pen_created_desc'):
        op.drop_index('ix_detections_pen_created_desc', table_name='detections')
