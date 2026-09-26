from pathlib import Path
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, inspect
from app.core.database import Base
from app import models  # noqa: F401


def test_migrations_create_the_expected_schema(tmp_path, monkeypatch):
    from app.core import database

    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    monkeypatch.setattr(database, "engine", engine)
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(config, "head")
    inspector = inspect(engine)
    assert set(Base.metadata.tables).issubset(set(inspector.get_table_names()))
    for name, table in Base.metadata.tables.items():
        assert {c["name"] for c in inspector.get_columns(name)} == set(table.columns.keys())
    assert set(inspector.get_pk_constraint("movement_metrics")["constrained_columns"]) == {
        "recorded_at",
        "session_id",
        "metric_name",
    }
    command.upgrade(config, "head")
    engine.dispose()
