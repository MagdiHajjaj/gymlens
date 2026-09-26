"""Add Tiger Data continuous analytics and columnstore policies."""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    installed = connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb')")
    )
    if not installed:
        return

    # A real-time continuous aggregate serves historical buckets from its
    # materialization and combines the newest, incomplete bucket from raw data.
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS movement_metrics_1m
        WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
        SELECT time_bucket(INTERVAL '1 minute', recorded_at) AS bucket,
               session_id,
               metric_name,
               avg(metric_value) AS average,
               min(metric_value) AS minimum,
               max(metric_value) AS maximum,
               count(*)::bigint AS samples
        FROM movement_metrics
        GROUP BY bucket, session_id, metric_name
        WITH NO DATA
        """
    )
    op.execute(
        """
        SELECT add_continuous_aggregate_policy(
            'movement_metrics_1m',
            start_offset => INTERVAL '30 days',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '5 minutes',
            if_not_exists => TRUE
        )
        """
    )

    # Tiger Cloud's current Hypercore API is preferred. Older TimescaleDB
    # versions fall back to the compatible compression API.
    has_columnstore = connection.scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='add_columnstore_policy')")
    )
    if has_columnstore:
        op.execute(
            "ALTER TABLE movement_metrics SET (timescaledb.enable_columnstore = true, "
            "timescaledb.segmentby = 'session_id,metric_name', timescaledb.orderby = 'recorded_at DESC')"
        )
        op.execute("CALL add_columnstore_policy('movement_metrics', after => INTERVAL '7 days', if_not_exists => TRUE)")
    else:
        op.execute(
            "ALTER TABLE movement_metrics SET (timescaledb.compress = true, "
            "timescaledb.compress_segmentby = 'session_id,metric_name', "
            "timescaledb.compress_orderby = 'recorded_at DESC')"
        )
        op.execute("SELECT add_compression_policy('movement_metrics', INTERVAL '7 days', if_not_exists => TRUE)")


def downgrade():
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    op.execute("DROP MATERIALIZED VIEW IF EXISTS movement_metrics_1m")
    # Keep columnstore settings and compressed chunks: disabling them may
    # require decompression and is intentionally not automatic.
