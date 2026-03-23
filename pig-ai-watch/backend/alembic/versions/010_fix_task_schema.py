"""Fix task schema mismatches

Revision ID: 010_fix_task_schema
Revises: 009_add_notification_tables
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010_fix_task_schema'
down_revision = '009_add_notification_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fix task_templates table
    # Rename estimated_duration to estimated_duration_minutes (if column exists)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='task_templates' AND column_name='estimated_duration'
            ) THEN
                ALTER TABLE task_templates RENAME COLUMN estimated_duration TO estimated_duration_minutes;
            END IF;
        END $$;
    """)

    # Ensure the column exists with correct type
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='task_templates' AND column_name='estimated_duration_minutes'
            ) THEN
                ALTER TABLE task_templates ADD COLUMN estimated_duration_minutes INTEGER DEFAULT 30;
            END IF;
        END $$;
    """)

    # Fix tasks table
    # Add notes column if missing
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='tasks' AND column_name='notes'
            ) THEN
                ALTER TABLE tasks ADD COLUMN notes TEXT;
            END IF;
        END $$;
    """)

    # Add scheduled_date column if missing
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='tasks' AND column_name='scheduled_date'
            ) THEN
                ALTER TABLE tasks ADD COLUMN scheduled_date TIMESTAMP WITH TIME ZONE;
            END IF;
        END $$;
    """)

    # Fix checklist_progress column type from TEXT to FLOAT
    op.execute("""
        DO $$
        BEGIN
            -- First check if the column exists and is TEXT
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='tasks'
                AND column_name='checklist_progress'
                AND data_type IN ('text', 'character varying')
            ) THEN
                -- Convert TEXT to FLOAT (handle NULL/empty values)
                ALTER TABLE tasks
                ALTER COLUMN checklist_progress
                TYPE DOUBLE PRECISION
                USING CASE
                    WHEN checklist_progress IS NULL OR checklist_progress = '' THEN 0.0
                    ELSE CAST(checklist_progress AS DOUBLE PRECISION)
                END;

                ALTER TABLE tasks
                ALTER COLUMN checklist_progress
                SET DEFAULT 0.0;
            END IF;

            -- Ensure column exists with correct type
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='tasks' AND column_name='checklist_progress'
            ) THEN
                ALTER TABLE tasks ADD COLUMN checklist_progress DOUBLE PRECISION DEFAULT 0.0;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Revert task_templates changes
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='task_templates' AND column_name='estimated_duration_minutes'
            ) THEN
                ALTER TABLE task_templates RENAME COLUMN estimated_duration_minutes TO estimated_duration;
            END IF;
        END $$;
    """)

    # Revert tasks changes (checklist_progress back to TEXT)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='tasks'
                AND column_name='checklist_progress'
                AND data_type = 'double precision'
            ) THEN
                ALTER TABLE tasks
                ALTER COLUMN checklist_progress
                TYPE TEXT
                USING CAST(checklist_progress AS TEXT);
            END IF;
        END $$;
    """)
