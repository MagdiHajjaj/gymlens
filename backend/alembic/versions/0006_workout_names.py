"""Add athlete-visible workout names."""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workout_sessions",
        sa.Column("workout_name", sa.String(80), nullable=True),
    )


def downgrade():
    op.drop_column("workout_sessions", "workout_name")
