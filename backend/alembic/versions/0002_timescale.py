"""Convert sampled metrics to a TimescaleDB hypertable when the extension is available."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    available = connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='timescaledb')")
    )
    if available:
        op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
        op.execute(
            "SELECT create_hypertable('movement_metrics', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE)"
        )


def downgrade():
    # Keep the existing data and hypertable: removing the extension would be destructive.
    pass
