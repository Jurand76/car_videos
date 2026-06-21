import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.generated_file import MAX_GENERATED_FILES_PER_USER, GeneratedFile
from app.models.photo_series_item import PhotoSeriesItem
from app.models.project import Project
from app.models.user import User
from app.schemas.generated_file import GeneratedFileResponse

router = APIRouter(prefix="/generated-files", tags=["generated-files"])

GalleryScope = Literal["renders", "series", "all"]


def _media_type(path: str) -> str:
    if path.endswith(".png"):
        return "image/png"
    if path.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


@router.get("", response_model=list[GeneratedFileResponse])
async def list_generated_files(
    scope: GalleryScope = Query(default="renders"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GeneratedFile]:
    query = select(GeneratedFile).where(GeneratedFile.user_id == current_user.id)

    if scope == "series":
        query = query.where(GeneratedFile.project_type == "photo_series")
    elif scope == "renders":
        query = query.where(GeneratedFile.project_type == "advanced")
        query = query.order_by(GeneratedFile.created_at.desc()).limit(MAX_GENERATED_FILES_PER_USER)
        result = await db.execute(query)
        return list(result.scalars().all())

    query = query.order_by(GeneratedFile.created_at.desc())
    if scope == "all":
        query = query.limit(MAX_GENERATED_FILES_PER_USER + 200)

    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{file_id}/file")
async def get_generated_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    result = await db.execute(
        select(GeneratedFile).where(
            GeneratedFile.id == file_id,
            GeneratedFile.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None or not Path(entry.file_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plik nie znaleziony")

    return FileResponse(entry.file_path, media_type=_media_type(entry.file_path))


@router.get("/{file_id}/source")
async def get_generated_source_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    result = await db.execute(
        select(GeneratedFile).where(
            GeneratedFile.id == file_id,
            GeneratedFile.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plik nie znaleziony")

    if entry.source_file_path and Path(entry.source_file_path).exists():
        return FileResponse(entry.source_file_path, media_type=_media_type(entry.source_file_path))

    if entry.source_item_id:
        item_result = await db.execute(
            select(PhotoSeriesItem).where(PhotoSeriesItem.id == entry.source_item_id)
        )
        item = item_result.scalar_one_or_none()
        if item and Path(item.file_path).exists():
            return FileResponse(item.file_path, media_type=_media_type(item.file_path))

    if entry.project_id:
        project_result = await db.execute(select(Project).where(Project.id == entry.project_id))
        project = project_result.scalar_one_or_none()
        if project and project.car_image_path and Path(project.car_image_path).exists():
            return FileResponse(project.car_image_path, media_type=_media_type(project.car_image_path))

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Źródło nie znalezione")
