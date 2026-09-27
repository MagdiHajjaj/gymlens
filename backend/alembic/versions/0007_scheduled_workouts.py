"""Scheduled workouts planned on the training calendar."""

from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scheduled_workouts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=True),
        sa.Column("exercises", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("scheduled_workouts")
