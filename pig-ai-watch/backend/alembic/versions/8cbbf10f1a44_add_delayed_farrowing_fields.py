"""Add delayed farrowing fields

Revision ID: 8cbbf10f1a44
Revises: 011_missing_detection_cols
Create Date: 2026-03-26 22:27:28.380009

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8cbbf10f1a44'
down_revision: Union[str, None] = '011_missing_detection_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add delayed farrowing tracking fields
    op.add_column('sows', sa.Column('intensified_monitoring', sa.Boolean(), server_default='False', nullable=True))
    op.add_column('sows', sa.Column('prolonged_gestation', sa.Boolean(), server_default='False', nullable=True))
    op.add_column('sows', sa.Column('overdue_acknowledged_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sows', sa.Column('overdue_notes', sa.Text(), nullable=True))

def downgrade() -> None:
    op.drop_column('sows', 'overdue_notes')
    op.drop_column('sows', 'overdue_acknowledged_at')
    op.drop_column('sows', 'prolonged_gestation')
    op.drop_column('sows', 'intensified_monitoring')
