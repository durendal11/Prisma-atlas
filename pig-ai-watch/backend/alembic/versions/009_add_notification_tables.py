"""Add push notification subscription and log tables

Revision ID: 009_add_notification_tables
Revises: 008_add_demo_perf_indexes
Create Date: 2026-03-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009_add_notification_tables"
down_revision: Union[str, None] = "008_add_demo_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("device_token", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False, server_default="electron"),
        sa.Column("pen_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("quiet_start", sa.Time(), nullable=True),
        sa.Column("quiet_end", sa.Time(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_token", name="uq_notification_subscriptions_user_device"),
    )
    op.create_index("ix_notification_subscriptions_user_id", "notification_subscriptions", ["user_id"], unique=False)

    op.create_table(
        "notification_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pen_id", sa.Integer(), nullable=True),
        sa.Column("device_token", sa.Text(), nullable=True),
        sa.Column("alert_type", sa.String(length=50), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=True),
        sa.Column("push_title", sa.Text(), nullable=True),
        sa.Column("push_body", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("delivered", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_log_pen_alert_sent", "notification_log", ["pen_id", "alert_type", "sent_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notification_log_pen_alert_sent", table_name="notification_log")
    op.drop_table("notification_log")

    op.drop_index("ix_notification_subscriptions_user_id", table_name="notification_subscriptions")
    op.drop_table("notification_subscriptions")
