"""Add missing detections columns used by ORM

Revision ID: 011_missing_detection_cols
Revises: 010_fix_task_schema
Create Date: 2026-03-23

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '011_missing_detection_cols'
down_revision = '010_fix_task_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Some production DBs were created before these ORM fields existed.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='detections' AND column_name='sow_count'
            ) THEN
                ALTER TABLE detections ADD COLUMN sow_count INTEGER DEFAULT 1;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='detections' AND column_name='class_names'
            ) THEN
                ALTER TABLE detections ADD COLUMN class_names TEXT;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='detections' AND column_name='class_names'
            ) THEN
                ALTER TABLE detections DROP COLUMN class_names;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='detections' AND column_name='sow_count'
            ) THEN
                ALTER TABLE detections DROP COLUMN sow_count;
            END IF;
        END $$;
        """
    )
