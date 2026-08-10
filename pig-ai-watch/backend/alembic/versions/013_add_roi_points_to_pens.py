"""add roi_points to pens

Revision ID: 013_add_roi_points
Revises: 012_edge_cam_src
Create Date: 2026-08-10
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "013_add_roi_points"
down_revision = "012_edge_cam_src"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add roi_points column as nullable JSON.
    # Use IF NOT EXISTS for safe re-runs on already-patched DBs.
    op.execute(
        "ALTER TABLE pens ADD COLUMN IF NOT EXISTS roi_points JSON"
    )


def downgrade() -> None:
    op.drop_column("pens", "roi_points")
