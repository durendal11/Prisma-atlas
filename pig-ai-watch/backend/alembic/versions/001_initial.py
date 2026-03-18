"""Initial migration

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-20 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(100), nullable=True),
        sa.Column('role', sa.String(20), nullable=True, server_default='operator'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # Create pens table
    op.create_table(
        'pens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('location', sa.String(100), nullable=True),
        sa.Column('camera_source', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Create sows table
    op.create_table(
        'sows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('breed', sa.String(50), nullable=True),
        sa.Column('birth_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('parity', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('status', sa.String(20), nullable=True, server_default='active'),
        sa.Column('current_litter_size', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('expected_farrowing_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_farrowing_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pen_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sows_tag_id', 'sows', ['tag_id'], unique=True)
    
    # Create alerts table
    op.create_table(
        'alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('sow_id', sa.Integer(), nullable=True),
        sa.Column('pen_id', sa.Integer(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('is_resolved', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(), nullable=True),
        sa.Column('detection_data', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['sow_id'], ['sows.id'], ),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id'], ),
        sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create events table
    op.create_table(
        'events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('sow_id', sa.Integer(), nullable=True),
        sa.Column('pen_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('metadata', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['sow_id'], ['sows.id'], ),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create detections table
    op.create_table(
        'detections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pen_id', sa.Integer(), nullable=False),
        sa.Column('piglet_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('sow_posture', sa.String(20), nullable=True),
        sa.Column('crushing_risk', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('bounding_boxes', sa.Text(), nullable=True),
        sa.Column('confidence_scores', sa.Text(), nullable=True),
        sa.Column('frame_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_time_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('detections')
    op.drop_table('events')
    op.drop_table('alerts')
    op.drop_index('ix_sows_tag_id', table_name='sows')
    op.drop_table('sows')
    op.drop_table('pens')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_table('users')
