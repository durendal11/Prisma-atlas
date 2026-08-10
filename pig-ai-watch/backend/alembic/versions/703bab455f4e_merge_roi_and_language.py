"""merge_roi_and_language

Revision ID: 703bab455f4e
Revises: 013_add_roi_points, 9999
Create Date: 2026-08-10 15:28:46.597679

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '703bab455f4e'
down_revision: Union[str, None] = ('013_add_roi_points', '9999')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
