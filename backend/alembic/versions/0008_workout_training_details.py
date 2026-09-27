"""Persist exercise loads, planned volume, and completed set ranges."""

from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workout_sessions", sa.Column("weight_kg", sa.Float(), nullable=True))
    op.add_column("workout_sessions", sa.Column("target_sets", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("target_reps", sa.Integer(), nullable=True))
    op.add_column(
        "workout_sessions",
        sa.Column("set_ranges", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade():
    op.drop_column("workout_sessions", "set_ranges")
    op.drop_column("workout_sessions", "target_reps")
    op.drop_column("workout_sessions", "target_sets")
    op.drop_column("workout_sessions", "weight_kg")
