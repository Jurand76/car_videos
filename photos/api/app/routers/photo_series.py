import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.dependencies import get_current_user
from app.models.photo_series_item import PhotoSeriesItem
from app.models.project import Project
from app.models.user import User
from app.schemas.photo_series import PhotoSeriesItemResponse, SeriesGenerateRequest, validate_section_category
from app.schemas.project import ProjectResponse
from app.services.ai_config import parse_ai_config
from app.services.photo_series_batch import (
    DEFAULT_EXTERIOR_PROMPT,
    DEFAULT_INTERIOR_PROMPT,
    is_active_series_batch,
    request_series_batch_cancel,
    run_photo_series_batch,
)
from app.services.storage import save_upload

router = APIRouter(tags=["photo-series"])


def _apply_series_section_settings(
    settings: dict,
    *,
    sections: list[dict[str, str]] | None = None,
    section_prompts: dict[str, str] | None = None,
) -> None:
    if sections is not None:
        settings["sections"] = sections
        settings["section_prompts"] = {row["id"]: row["prompt"] for row in sections}
        return

    if section_prompts is None:
        return

    settings["section_prompts"] = section_prompts
    existing_rows = settings.get("sections") or []
    order: list[str] = []
    prompts_by_id: dict[str, str] = {}

    for entry in existing_rows:
        if not isinstance(entry, dict):
            continue
        section_id = entry.get("id")
        if not isinstance(section_id, str) or not section_id:
            continue
        order.append(section_id)
        if isinstance(entry.get("prompt"), str):
            prompts_by_id[section_id] = entry["prompt"]

    for section_id in section_prompts:
        if section_id not in order:
            order.append(section_id)

    settings["sections"] = [
        {"id": section_id, "prompt": section_prompts.get(section_id) or prompts_by_id.get(section_id, "")}
        for section_id in order
        if section_id in section_prompts
    ]

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SERIES_FILES_PER_UPLOAD = 20


async def _get_series_project(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projekt nie znaleziony")
    if project.project_type != "photo_series":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endpoint dostępny tylko dla serii zdjęć",
        )
    return project


def _validate_image(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dozwolone formaty: JPEG, PNG, WebP",
        )


def _media_type(path: str) -> str:
    if path.endswith(".png"):
        return "image/png"
    if path.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


@router.get("/{project_id}/series-items", response_model=list[PhotoSeriesItemResponse])
async def list_series_items(
    project_id: uuid.UUID,
    category: str | None = Query(default=None, max_length=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PhotoSeriesItem]:
    await _get_series_project(project_id, current_user, db)
    if category is not None:
        validate_section_category(category)
    query = select(PhotoSeriesItem).where(PhotoSeriesItem.project_id == project_id)
    if category:
        query = query.where(PhotoSeriesItem.category == category)
    query = query.order_by(PhotoSeriesItem.category.asc(), PhotoSeriesItem.sort_order.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/{project_id}/series-items", response_model=list[PhotoSeriesItemResponse])
async def upload_series_items(
    project_id: uuid.UUID,
    category: str = Query(..., max_length=20),
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PhotoSeriesItem]:
    validate_section_category(category)
    project = await _get_series_project(project_id, current_user, db)
    if is_active_series_batch(project):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Przetwarzanie serii w toku")

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wybierz co najmniej jeden plik")
    if len(files) > MAX_SERIES_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maksymalnie {MAX_SERIES_FILES_PER_UPLOAD} plików na raz",
        )

    count_result = await db.execute(
        select(func.count())
        .select_from(PhotoSeriesItem)
        .where(PhotoSeriesItem.project_id == project_id, PhotoSeriesItem.category == category)
    )
    base_order = int(count_result.scalar() or 0)

    created: list[PhotoSeriesItem] = []
    for offset, file in enumerate(files):
        _validate_image(file)
        path = await save_upload(current_user.id, file, f"series_{category}")
        item = PhotoSeriesItem(
            project_id=project_id,
            category=category,
            file_path=path,
            sort_order=base_order + offset,
            status="pending",
        )
        db.add(item)
        created.append(item)

    project.status = "draft"
    await db.commit()
    for item in created:
        await db.refresh(item)
    return created


@router.delete("/{project_id}/series-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_series_project(project_id, current_user, db)
    if is_active_series_batch(project):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Przetwarzanie serii w toku")

    result = await db.execute(
        select(PhotoSeriesItem).where(
            PhotoSeriesItem.id == item_id,
            PhotoSeriesItem.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zdjęcie nie znalezione")

    for path in (item.file_path, item.result_file_path):
        if path and Path(path).exists():
            try:
                Path(path).unlink()
            except OSError:
                pass
    await db.delete(item)
    await db.commit()


@router.post("/{project_id}/series-generate", response_model=ProjectResponse)
async def generate_series(
    project_id: uuid.UUID,
    payload: SeriesGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await _get_series_project(project_id, current_user, db)

    if project.status == "processing":
        if is_active_series_batch(project):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Przetwarzanie serii już trwa",
            )
        settings = dict(project.settings or {})
        settings["batch_render"] = {
            "phase": "cancelled",
            "message": "Poprzednie przetwarzanie wygasło",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        project.settings = settings
        flag_modified(project, "settings")
        project.status = "draft"
        await db.commit()
        await db.refresh(project)

    if not project.background_image_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wgraj tło studyjne (platformę) przed przetwarzaniem",
        )

    items_result = await db.execute(
        select(func.count()).select_from(PhotoSeriesItem).where(PhotoSeriesItem.project_id == project_id)
    )
    if int(items_result.scalar() or 0) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wgraj zdjęcia produktu w sekcjach przed przetwarzaniem",
        )

    settings = dict(project.settings or {})
    if payload.sections is not None:
        _apply_series_section_settings(
            settings,
            sections=[{"id": section.id, "prompt": section.prompt} for section in payload.sections],
        )
    elif payload.section_prompts is not None:
        _apply_series_section_settings(settings, section_prompts=payload.section_prompts)
    if payload.exterior_prompt is not None:
        settings["exterior_prompt"] = payload.exterior_prompt
    if payload.interior_prompt is not None:
        settings["interior_prompt"] = payload.interior_prompt

    section_prompts = dict(settings.get("section_prompts") or {})
    exterior_prompt = str(settings.get("exterior_prompt") or DEFAULT_EXTERIOR_PROMPT)
    interior_prompt = str(settings.get("interior_prompt") or DEFAULT_INTERIOR_PROMPT)
    default_ai_config = (
        payload.ai_config.model_dump()
        if payload.ai_config is not None
        else parse_ai_config(settings).model_dump()
    )
    if payload.section_ai_configs is not None:
        section_ai_configs = {
            section_id: config.model_dump()
            for section_id, config in payload.section_ai_configs.items()
        }
    else:
        stored = settings.get("section_ai_configs")
        section_ai_configs = (
            {key: dict(value) for key, value in stored.items()}
            if isinstance(stored, dict)
            else {}
        )
    settings["ai_config"] = default_ai_config
    settings["section_ai_configs"] = section_ai_configs
    settings["batch_render"] = {
        "phase": "preparing",
        "message": "Przygotowuję serię zdjęć...",
        "current_index": 0,
        "total": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    project.settings = settings
    flag_modified(project, "settings")
    project.status = "processing"
    await db.commit()
    await db.refresh(project)

    asyncio.create_task(
        run_photo_series_batch(
            project_id,
            current_user.id,
            project.background_image_path,
            section_prompts,
            exterior_prompt,
            interior_prompt,
            default_ai_config,
            section_ai_configs,
        )
    )
    return project


@router.post("/{project_id}/series-cancel", response_model=ProjectResponse)
async def cancel_series(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await _get_series_project(project_id, current_user, db)

    if project.status != "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Brak aktywnego przetwarzania do zatrzymania",
        )

    if not is_active_series_batch(project):
        settings = dict(project.settings or {})
        settings["batch_render"] = {
            "phase": "cancelled",
            "message": "Przetwarzanie zatrzymane",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        project.settings = settings
        flag_modified(project, "settings")
        project.status = "draft"
        await db.commit()
        await db.refresh(project)
        return project

    await request_series_batch_cancel(project_id, current_user.id)
    await db.refresh(project)
    return project


@router.get("/{project_id}/files/series/{item_id}")
async def get_series_source_file(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    await _get_series_project(project_id, current_user, db)
    result = await db.execute(
        select(PhotoSeriesItem).where(
            PhotoSeriesItem.id == item_id,
            PhotoSeriesItem.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None or not Path(item.file_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plik nie znaleziony")
    return FileResponse(item.file_path, media_type=_media_type(item.file_path))


@router.get("/{project_id}/files/series-result/{item_id}")
async def get_series_result_file(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    await _get_series_project(project_id, current_user, db)
    result = await db.execute(
        select(PhotoSeriesItem).where(
            PhotoSeriesItem.id == item_id,
            PhotoSeriesItem.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None or not item.result_file_path or not Path(item.result_file_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wynik nie znaleziony")
    return FileResponse(item.result_file_path, media_type=_media_type(item.result_file_path))
