"""add language to users

Revision ID: 9999
Revises: ce04072dc963
Create Date: 2024-05-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9999'
down_revision = 'ce04072dc963' # Might need to link to latest
branch_labels = None
depends_on = None

def upgrade() -> None:
    # use batch_alter_table for sqlite compatibility
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('language', sa.String(length=10), server_default='en', nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('language')
