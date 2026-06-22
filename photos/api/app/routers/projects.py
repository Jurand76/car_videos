import asyncio
import contextlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.database import async_session, get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.background import SelectBackgroundRequest
from app.schemas.project import AiGenerateRequest, AiImageConfig, ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.ai_compositing import generate_ai_render
from app.services.ai_config import parse_ai_config, result_extension
from app.services.photo_series_batch import DEFAULT_EXTERIOR_PROMPT, DEFAULT_INTERIOR_PROMPT
from app.services.generated_files import archive_generated_result
from app.services.storage import (
    resolve_user_background,
    save_background_library,
    save_upload,
    user_upload_dir,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


AI_HEARTBEAT_STALE_SEC = 90


def _parse_ai_render_updated_at(settings: dict | None) -> datetime | None:
    if not settings:
        return None
    ai_render = settings.get("ai_render")
    if not isinstance(ai_render, dict):
        return None
    raw = ai_render.get("updated_at")
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def _is_active_ai_processing(project: Project) -> bool:
    if project.status != "processing":
        return False
    updated_at = _parse_ai_render_updated_at(project.settings)
    if updated_at is None:
        return False
    age = datetime.now(timezone.utc) - updated_at
    return age.total_seconds() < AI_HEARTBEAT_STALE_SEC


def _ai_render_progress(settings: dict, phase: str, message: str, *, error: str | None = None) -> dict:
    progress = {
        "phase": phase,
        "message": message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        progress["error"] = error
    settings["ai_render"] = progress
    return settings


async def _update_ai_render_state(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    status: str | None = None,
    result_path: str | None = None,
    settings_patch: dict | None = None,
) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return
        if status is not None:
            project.status = status
        if result_path is not None:
            project.result_image_path = result_path
        if settings_patch is not None:
            settings = dict(project.settings or {})
            settings.update(settings_patch)
            project.settings = settings
            flag_modified(project, "settings")
        await db.commit()


async def _ai_render_heartbeat(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    started_at: datetime,
) -> None:
    try:
        while True:
            await asyncio.sleep(12)
            elapsed = int((datetime.now(timezone.utc) - started_at).total_seconds())
            await _update_ai_render_state(
                project_id,
                user_id,
                settings_patch={
                    "ai_render": {
                        "phase": "openai",
                        "message": f"GPT Image 2 pracuje... ({elapsed}s)",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )
    except asyncio.CancelledError:
        raise


async def _run_ai_generate_background(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    car_path: str,
    background_path: str,
    result_path: str,
    prompt: str | None,
    ai_config: dict,
) -> None:
    started_at = datetime.now(timezone.utc)
    heartbeat: asyncio.Task | None = None
    logger.info("AI render background task started: project=%s", project_id)
    try:
        await _update_ai_render_state(
            project_id,
            user_id,
            settings_patch={
                "ai_render": {
                    "phase": "preparing",
                    "message": "Przygotowuję zdjęcia...",
                    "updated_at": started_at.isoformat(),
                }
            },
        )

        await _update_ai_render_state(
            project_id,
            user_id,
            settings_patch={
                "ai_render": {
                    "phase": "openai",
                    "message": "GPT Image 2 składa auto na platformie...",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        logger.info("AI render start: project=%s", project_id)
        heartbeat = asyncio.create_task(_ai_render_heartbeat(project_id, user_id, started_at))
        await asyncio.to_thread(
            generate_ai_render,
            car_path,
            background_path,
            result_path,
            prompt,
            ai_config,
        )

        await _update_ai_render_state(
            project_id,
            user_id,
            status="completed",
            result_path=result_path,
            settings_patch={
                "ai_render": {
                    "phase": "done",
                    "message": "Render gotowy!",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        async with async_session() as db:
            result = await db.execute(
                select(Project).where(Project.id == project_id, Project.user_id == user_id)
            )
            project = result.scalar_one_or_none()
            if project:
                await archive_generated_result(
                    db,
                    user_id=user_id,
                    project_id=project_id,
                    project_name=project.name,
                    project_type=project.project_type,
                    source_path=result_path,
                    car_source_path=car_path,
                )
                await db.commit()
        duration = (datetime.now(timezone.utc) - started_at).total_seconds()
        logger.info("AI render done: project=%s duration=%.1fs", project_id, duration)
    except Exception as exc:
        duration = (datetime.now(timezone.utc) - started_at).total_seconds()
        logger.exception("AI render failed: project=%s duration=%.1fs", project_id, duration)
        await _update_ai_render_state(
            project_id,
            user_id,
            status="failed",
            settings_patch={
                "ai_render": {
                    "phase": "failed",
                    "message": "Generowanie nie powiodło się",
                    "error": str(exc),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
    finally:
        if heartbeat is not None:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def _get_user_project(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projekt nie znaleziony")
    return project


def _validate_image(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dozwolone formaty: JPEG, PNG, WebP",
        )


def _preview_series_item_id(project: Project) -> uuid.UUID | None:
    if project.project_type != "photo_series" or not project.series_items:
        return None
    first = min(project.series_items, key=lambda item: (item.sort_order, item.created_at))
    return first.id


def _project_response(project: Project) -> ProjectResponse:
    response = ProjectResponse.model_validate(project)
    preview_id = _preview_series_item_id(project)
    if preview_id is None:
        return response
    return response.model_copy(update={"preview_series_item_id": preview_id})


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectResponse]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .options(selectinload(Project.series_items))
        .order_by(Project.updated_at.desc())
    )
    return [_project_response(project) for project in result.scalars().all()]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    if payload.project_type == "advanced":
        settings = {
            "ai_prompt": "",
            "ai_config": AiImageConfig().model_dump(),
        }
    elif payload.project_type == "photo_series":
        settings = {
            "exterior_prompt": DEFAULT_EXTERIOR_PROMPT,
            "interior_prompt": DEFAULT_INTERIOR_PROMPT,
            "ai_config": AiImageConfig().model_dump(),
        }
    else:
        settings = None

    project = Project(
        user_id=current_user.id,
        name=payload.name,
        project_type=payload.project_type,
        settings=settings,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await _get_user_project(project_id, current_user, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await _get_user_project(project_id, current_user, db)

    if payload.name is not None:
        project.name = payload.name
    if payload.settings is not None:
        project.settings = payload.settings
        flag_modified(project, "settings")

    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await _get_user_project(project_id, current_user, db)
    await db.delete(project)
    await db.commit()


@router.post("/{project_id}/car", response_model=ProjectResponse)
async def upload_car_image(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    _validate_image(file)
    project = await _get_user_project(project_id, current_user, db)
    project.car_image_path = await save_upload(current_user.id, file, "car")
    project.status = "draft"
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/{project_id}/background", response_model=ProjectResponse)
async def upload_background_image(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    _validate_image(file)
    project = await _get_user_project(project_id, current_user, db)
    project.background_image_path = await save_background_library(current_user.id, file)
    project.status = "draft"
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/{project_id}/background/select", response_model=ProjectResponse)
async def select_background_image(
    project_id: uuid.UUID,
    payload: SelectBackgroundRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    file_path = resolve_user_background(current_user.id, payload.background_id)
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono wybranego tła",
        )

    project = await _get_user_project(project_id, current_user, db)
    project.background_image_path = str(file_path)
    project.status = "draft"
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/{project_id}/ai-generate", response_model=ProjectResponse)
async def ai_generate_project(
    project_id: uuid.UUID,
    payload: AiGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await _get_user_project(project_id, current_user, db)

    if project.project_type != "advanced":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generowanie AI dostępne tylko w projekcie zaawansowanym",
        )

    if project.status == "processing":
        if _is_active_ai_processing(project):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Generowanie już trwa — poczekaj na zakończenie (zwykle 1–3 min)",
            )
        settings = dict(project.settings or {})
        settings["ai_render"] = {
            "phase": "cancelled",
            "message": "Poprzednie generowanie wygasło — startuję od nowa",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        project.settings = settings
        flag_modified(project, "settings")
        project.status = "draft"
        await db.commit()
        await db.refresh(project)

    if not project.car_image_path or not project.background_image_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wgraj zdjęcie auta i tło (platformę) przed generowaniem",
        )

    settings = dict(project.settings or {})
    prompt = payload.prompt if payload.prompt is not None else settings.get("ai_prompt")
    if payload.prompt is not None:
        settings["ai_prompt"] = payload.prompt

    ai_config = (
        payload.ai_config.model_dump()
        if payload.ai_config is not None
        else parse_ai_config(settings).model_dump()
    )
    settings["ai_config"] = ai_config
    settings = _ai_render_progress(settings, "preparing", "Przygotowuję generowanie...")
    project.settings = settings
    flag_modified(project, "settings")

    upload_dir = user_upload_dir(current_user.id)
    ext = result_extension(ai_config.get("output_format", "png"))
    result_path = str(upload_dir / f"result_{project_id}{ext}")

    project.status = "processing"
    await db.commit()
    await db.refresh(project)

    asyncio.create_task(
        _run_ai_generate_background(
            project_id,
            current_user.id,
            project.car_image_path,
            project.background_image_path,
            result_path,
            str(prompt) if prompt else None,
            ai_config,
        )
    )

    return project


@router.get("/{project_id}/files/{file_type}")
async def get_project_file(
    project_id: uuid.UUID,
    file_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    project = await _get_user_project(project_id, current_user, db)

    path_map = {
        "car": project.car_image_path,
        "background": project.background_image_path,
        "result": project.result_image_path,
    }

    file_path = path_map.get(file_type)
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plik nie znaleziony")

    if file_path.endswith(".png"):
        media_type = "image/png"
    elif file_path.endswith(".webp"):
        media_type = "image/webp"
    else:
        media_type = "image/jpeg"
    return FileResponse(file_path, media_type=media_type)
