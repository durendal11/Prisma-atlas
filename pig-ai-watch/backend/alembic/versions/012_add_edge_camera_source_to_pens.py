"""add edge_camera_source to pens

Revision ID: 012_add_edge_camera_source_to_pens
Revises: 405b0069f573
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "012_add_edge_camera_source_to_pens"
down_revision = "405b0069f573"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pens", sa.Column("edge_camera_source", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("pens", "edge_camera_source")
