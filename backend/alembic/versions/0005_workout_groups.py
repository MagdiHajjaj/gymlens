"""Group exercise sessions into complete workouts."""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workout_sessions", sa.Column("workout_id", sa.String(36), nullable=True))
    op.execute("UPDATE workout_sessions SET workout_id = id WHERE workout_id IS NULL")
    with op.batch_alter_table("workout_sessions") as batch:
        batch.alter_column("workout_id", nullable=False)
    op.create_index("ix_workout_sessions_workout_id", "workout_sessions", ["workout_id"])


def downgrade():
    op.drop_index("ix_workout_sessions_workout_id", table_name="workout_sessions")
    with op.batch_alter_table("workout_sessions") as batch:
        batch.drop_column("workout_id")
