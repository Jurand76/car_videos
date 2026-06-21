"""Archiwum ostatnich wygenerowanych renderów (kopia pliku + wpis w DB)."""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_file import (
    MAX_GENERATED_FILES_PER_USER,
    MAX_SERIES_CATALOGS_PER_USER,
    GeneratedFile,
)
from app.services.storage import user_upload_dir

logger = logging.getLogger(__name__)


def _archive_destination(user_id: uuid.UUID, source_path: str) -> str:
    suffix = Path(source_path).suffix or ".jpg"
    filename = f"generated_{uuid.uuid4().hex}{suffix}"
    return str(user_upload_dir(user_id) / filename)


async def _prune_old_archives(db: AsyncSession, user_id: uuid.UUID, project_type: str) -> None:
    if project_type == "photo_series":
        await _prune_old_series_catalogs(db, user_id)
        return

    result = await db.execute(
        select(GeneratedFile)
        .where(GeneratedFile.user_id == user_id, GeneratedFile.project_type == project_type)
        .order_by(GeneratedFile.created_at.desc())
        .offset(MAX_GENERATED_FILES_PER_USER)
    )
    for entry in result.scalars().all():
        for path_str in (entry.file_path, entry.source_file_path):
            if not path_str:
                continue
            path = Path(path_str)
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    logger.warning("Nie udało się usunąć archiwum: %s", path)
        await db.delete(entry)


async def _prune_old_series_catalogs(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Trzymaj max 5 katalogów serii (po project_id), od najnowszych."""
    result = await db.execute(
        select(GeneratedFile.project_id, func.max(GeneratedFile.created_at).label("latest"))
        .where(
            GeneratedFile.user_id == user_id,
            GeneratedFile.project_type == "photo_series",
            GeneratedFile.project_id.is_not(None),
        )
        .group_by(GeneratedFile.project_id)
        .order_by(func.max(GeneratedFile.created_at).desc())
    )
    rows = list(result.all())
    if len(rows) <= MAX_SERIES_CATALOGS_PER_USER:
        return

    stale_project_ids = [row.project_id for row in rows[MAX_SERIES_CATALOGS_PER_USER :]]
    stale = await db.execute(
        select(GeneratedFile).where(
            GeneratedFile.user_id == user_id,
            GeneratedFile.project_type == "photo_series",
            GeneratedFile.project_id.in_(stale_project_ids),
        )
    )
    for entry in stale.scalars().all():
        for path_str in (entry.file_path, entry.source_file_path):
            if not path_str:
                continue
            path = Path(path_str)
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    logger.warning("Nie udało się usunąć archiwum serii: %s", path)
        await db.delete(entry)


async def archive_generated_result(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    project_name: str,
    project_type: str,
    source_path: str,
    series_category: str | None = None,
    source_item_id: uuid.UUID | None = None,
    car_source_path: str | None = None,
    label: str | None = None,
) -> GeneratedFile | None:
    source = Path(source_path)
    if not source.exists():
        logger.warning("Brak pliku wyniku do archiwizacji: %s", source_path)
        return None

    archive_path = _archive_destination(user_id, source_path)
    try:
        shutil.copy2(source, archive_path)
    except OSError as exc:
        logger.exception("Błąd kopiowania do archiwum: %s", source_path)
        raise exc

    source_file_path: str | None = None
    if car_source_path:
        car_path = Path(car_source_path)
        if car_path.exists():
            source_file_path = _archive_destination(user_id, car_source_path)
            try:
                shutil.copy2(car_path, source_file_path)
            except OSError:
                logger.warning("Nie udało się skopiować źródła do archiwum: %s", car_source_path)
                source_file_path = None

    entry = GeneratedFile(
        user_id=user_id,
        project_id=project_id,
        project_name=project_name,
        project_type=project_type,
        series_category=series_category,
        source_item_id=source_item_id,
        source_file_path=source_file_path,
        label=label,
        file_path=archive_path,
    )
    db.add(entry)
    await db.flush()
    await _prune_old_archives(db, user_id, project_type)
    return entry
