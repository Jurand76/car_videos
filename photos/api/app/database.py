import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def run_migrations() -> None:
    """Lekkie migracje idempotentne (brak Alembic w dev)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type "
                "VARCHAR(20) NOT NULL DEFAULT 'simple'"
            )
        )
        await conn.execute(
            text("ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS series_category VARCHAR(20)")
        )
        await conn.execute(
            text("ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS source_item_id UUID")
        )
        await conn.execute(
            text("ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS label VARCHAR(200)")
        )
        await conn.execute(
            text("ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS source_file_path VARCHAR(500)")
        )
    logger.info("Migracje bazy zakończone.")


async def get_db():
    async with async_session() as session:
        yield session
