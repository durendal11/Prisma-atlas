"""add edge_camera_source to pens

Revision ID: 012_edge_cam_src
Revises: 405b0069f573
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "012_edge_cam_src"
down_revision = "405b0069f573"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS to allow safe re-run when hotfix SQL was already applied.
    op.execute("ALTER TABLE pens ADD COLUMN IF NOT EXISTS edge_camera_source VARCHAR(255)")


def downgrade() -> None:
    op.drop_column("pens", "edge_camera_source")
