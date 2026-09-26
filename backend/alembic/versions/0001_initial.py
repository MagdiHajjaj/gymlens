"""Relational workout schema. All unique metric keys include recorded_at."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("auth0_sub", sa.String(255), nullable=False, unique=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("exercise", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("total_reps", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
    )
    op.create_index("ix_workout_sessions_user_id", "workout_sessions", ["user_id"])
    op.create_table(
        "rep_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("workout_sessions.id"), nullable=False),
        sa.Column("rep_number", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("faults_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("session_id", "rep_number"),
    )
    op.create_index("ix_rep_events_session_id", "rep_events", ["session_id"])
    op.create_table(
        "movement_metrics",
        sa.Column("recorded_at", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("workout_sessions.id"), primary_key=True),
        sa.Column("metric_name", sa.String(40), primary_key=True),
        sa.Column("metric_value", sa.Float(), nullable=False),
    )
    op.create_index("ix_metrics_session_time", "movement_metrics", ["session_id", "recorded_at"])
    op.create_table(
        "session_insights",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id", sa.String(36), sa.ForeignKey("workout_sessions.id"), nullable=False, unique=True
        ),
        sa.Column("summary_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    for table in ["session_insights", "movement_metrics", "rep_events", "workout_sessions", "users"]:
        op.drop_table(table)
