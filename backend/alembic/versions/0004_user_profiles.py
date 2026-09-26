"""Add athlete profile fields to Auth0-backed users."""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("fitness_goal", sa.String(30), nullable=True))
    op.add_column("users", sa.Column("experience_level", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("preferred_units", sa.String(10), nullable=False, server_default="metric"))
    op.add_column("users", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("weight_kg", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("weekly_workout_target", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("profile_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for column in [
        "profile_updated_at",
        "weekly_workout_target",
        "weight_kg",
        "height_cm",
        "preferred_units",
        "experience_level",
        "fitness_goal",
    ]:
        op.drop_column("users", column)
