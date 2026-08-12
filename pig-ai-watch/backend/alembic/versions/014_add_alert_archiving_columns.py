"""add alert archiving columns

Revision ID: 014_add_alert_archiving_columns
Revises: 9999_add_language_to_users
Create Date: 2026-08-12 00:56:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '014_add_alert_archiving_columns'
down_revision = '9999'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('alerts')]
    
    if 'is_archived' not in columns:
        op.add_column('alerts', sa.Column('is_archived', sa.Boolean(), server_default='0', nullable=False))
    if 'archived_at' not in columns:
        op.add_column('alerts', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('alerts', 'archived_at')
    op.drop_column('alerts', 'is_archived')
