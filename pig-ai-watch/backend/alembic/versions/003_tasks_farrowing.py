"""Add task management and farrowing tables

Revision ID: 003_tasks_farrowing
Revises: 001_initial
Create Date: 2024-01-15

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_tasks_farrowing'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create task_templates table
    op.create_table(
        'task_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=False, server_default='general'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('checklist_items', sa.Text(), nullable=True),
        sa.Column('estimated_duration', sa.Integer(), nullable=True),
        sa.Column('trigger_type', sa.String(50), nullable=True),
        sa.Column('trigger_days_offset', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_templates_category', 'task_templates', ['category'])
    op.create_index('ix_task_templates_trigger_type', 'task_templates', ['trigger_type'])
    
    # Create tasks table
    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=False, server_default='general'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('assigned_to', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('sow_id', sa.Integer(), nullable=True),
        sa.Column('pen_id', sa.Integer(), nullable=True),
        sa.Column('checklist_items', sa.Text(), nullable=True),
        sa.Column('checklist_progress', sa.Text(), nullable=True),
        sa.Column('completion_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['template_id'], ['task_templates.id']),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['sow_id'], ['sows.id']),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tasks_status', 'tasks', ['status'])
    op.create_index('ix_tasks_category', 'tasks', ['category'])
    op.create_index('ix_tasks_due_date', 'tasks', ['due_date'])
    op.create_index('ix_tasks_assigned_to', 'tasks', ['assigned_to'])
    
    # Create farrowing_records table
    op.create_table(
        'farrowing_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sow_id', sa.Integer(), nullable=False),
        sa.Column('pen_id', sa.Integer(), nullable=True),
        sa.Column('farrowing_started', sa.DateTime(), nullable=True),
        sa.Column('farrowing_completed', sa.DateTime(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('total_born', sa.Integer(), nullable=True),
        sa.Column('born_alive', sa.Integer(), nullable=True),
        sa.Column('stillborn', sa.Integer(), nullable=True),
        sa.Column('mummified', sa.Integer(), nullable=True),
        sa.Column('piglet_weights', sa.Text(), nullable=True),
        sa.Column('avg_birth_weight', sa.Float(), nullable=True),
        sa.Column('cross_fostered_in', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('cross_fostered_out', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('current_litter_size', sa.Integer(), nullable=True),
        sa.Column('sow_condition', sa.String(20), nullable=True, server_default='good'),
        sa.Column('intervention_required', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('intervention_notes', sa.Text(), nullable=True),
        sa.Column('ai_detected', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('crushing_incidents', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('attended_by', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['sow_id'], ['sows.id']),
        sa.ForeignKeyConstraint(['pen_id'], ['pens.id']),
        sa.ForeignKeyConstraint(['attended_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_farrowing_records_sow_id', 'farrowing_records', ['sow_id'])
    op.create_index('ix_farrowing_records_farrowing_started', 'farrowing_records', ['farrowing_started'])
    
    # Create piglet_records table
    op.create_table(
        'piglet_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('farrowing_record_id', sa.Integer(), nullable=False),
        sa.Column('sow_id', sa.Integer(), nullable=False),
        sa.Column('nurse_sow_id', sa.Integer(), nullable=True),
        sa.Column('ear_tag', sa.String(50), nullable=True),
        sa.Column('temp_id', sa.String(50), nullable=True),
        sa.Column('birth_order', sa.Integer(), nullable=True),
        sa.Column('birth_weight', sa.Float(), nullable=True),
        sa.Column('birth_time', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='alive'),
        sa.Column('death_date', sa.DateTime(), nullable=True),
        sa.Column('death_cause', sa.String(100), nullable=True),
        sa.Column('processed_date', sa.DateTime(), nullable=True),
        sa.Column('iron_given', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('teeth_clipped', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('tail_docked', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('castrated', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('health_score', sa.Integer(), nullable=True),
        sa.Column('health_notes', sa.Text(), nullable=True),
        sa.Column('weight_history', sa.Text(), nullable=True),
        sa.Column('current_weight', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['farrowing_record_id'], ['farrowing_records.id']),
        sa.ForeignKeyConstraint(['sow_id'], ['sows.id']),
        sa.ForeignKeyConstraint(['nurse_sow_id'], ['sows.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_piglet_records_farrowing_record_id', 'piglet_records', ['farrowing_record_id'])
    op.create_index('ix_piglet_records_ear_tag', 'piglet_records', ['ear_tag'])
    op.create_index('ix_piglet_records_status', 'piglet_records', ['status'])
    
    # Create workflow_rules table
    op.create_table(
        'workflow_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('trigger_event', sa.String(50), nullable=False),
        sa.Column('conditions', sa.Text(), nullable=True),
        sa.Column('action_type', sa.String(50), nullable=False),
        sa.Column('action_config', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_workflow_rules_trigger_event', 'workflow_rules', ['trigger_event'])


def downgrade() -> None:
    op.drop_index('ix_workflow_rules_trigger_event', 'workflow_rules')
    op.drop_table('workflow_rules')
    
    op.drop_index('ix_piglet_records_status', 'piglet_records')
    op.drop_index('ix_piglet_records_ear_tag', 'piglet_records')
    op.drop_index('ix_piglet_records_farrowing_record_id', 'piglet_records')
    op.drop_table('piglet_records')
    
    op.drop_index('ix_farrowing_records_farrowing_started', 'farrowing_records')
    op.drop_index('ix_farrowing_records_sow_id', 'farrowing_records')
    op.drop_table('farrowing_records')
    
    op.drop_index('ix_tasks_assigned_to', 'tasks')
    op.drop_index('ix_tasks_due_date', 'tasks')
    op.drop_index('ix_tasks_category', 'tasks')
    op.drop_index('ix_tasks_status', 'tasks')
    op.drop_table('tasks')
    
    op.drop_index('ix_task_templates_trigger_type', 'task_templates')
    op.drop_index('ix_task_templates_category', 'task_templates')
    op.drop_table('task_templates')
