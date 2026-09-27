from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _with_connect_timeout(url: str) -> str:
    """Fail fast on unreachable databases instead of hanging deploys."""
    if url.startswith("postgresql") and "connect_timeout" not in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}connect_timeout=10"
    return url


engine = create_engine(
    _with_connect_timeout(settings.database_url),
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db
