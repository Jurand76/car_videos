"""Równoległe przetwarzanie serii zdjęć przez GPT Image 2."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.database import async_session
from app.models.photo_series_item import PhotoSeriesItem
from app.models.project import Project
from app.services.ai_compositing import generate_ai_render
from app.services.ai_config import resolve_section_ai_config, result_extension
from app.services.generated_files import archive_generated_result
from app.services.storage import user_upload_dir

logger = logging.getLogger(__name__)

DEFAULT_EXTERIOR_PROMPT = (
    "Umieść samochód z pierwszego zdjęcia realistycznie na platformie studyjnej z drugiego zdjęcia. "
    "Zdjęcie zewnętrzne — całe auto, profesjonalna fotografia produktowa. "
    "Dopasuj perspektywę, skalę, oświetlenie i cień. Zachowaj model i kolor auta."
)

DEFAULT_INTERIOR_PROMPT = (
    "Umieść wnętrze samochodu z pierwszego zdjęcia w profesjonalnej oprawie studyjnej z drugiego zdjęcia. "
    "Naturalna perspektywa, oświetlenie studyjne, fotografia produktowa wnętrza. "
    "Zachowaj realistyczne detale kokpitu, kolor i wykończenie."
)

SERIES_HEARTBEAT_STALE_SEC = 90
RATE_LIMIT_MAX_RETRIES = 6

_batch_cancel_lock = asyncio.Lock()
_batch_cancel_events: dict[uuid.UUID, asyncio.Event] = {}


async def _register_batch_cancel(project_id: uuid.UUID) -> asyncio.Event:
    event = asyncio.Event()
    async with _batch_cancel_lock:
        _batch_cancel_events[project_id] = event
    return event


async def _unregister_batch_cancel(project_id: uuid.UUID) -> None:
    async with _batch_cancel_lock:
        _batch_cancel_events.pop(project_id, None)


async def request_series_batch_cancel(project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """Sygnalizuje zatrzymanie batcha. Zwraca True, gdy batch był aktywny w pamięci."""
    async with _batch_cancel_lock:
        event = _batch_cancel_events.get(project_id)
        if event is not None:
            event.set()

    settings = dict((await _get_project_settings(project_id, user_id)) or {})
    batch = settings.get("batch_render")
    batch_dict = batch if isinstance(batch, dict) else {}
    _batch_progress(
        settings,
        phase="cancelling",
        message="Zatrzymywanie przetwarzania...",
        current_index=batch_dict.get("current_index", 0),
        total=batch_dict.get("total", 0),
        parallel_workers=batch_dict.get("parallel_workers"),
    )
    await _update_series_state(project_id, user_id, settings_patch=settings)

    if event is None:
        await _reset_processing_items(project_id)
        final = dict((await _get_project_settings(project_id, user_id)) or {})
        completed = await _count_items_by_status(project_id, "completed")
        _batch_progress(
            final,
            phase="cancelled",
            message=f"Przetwarzanie zatrzymane — {completed} zdjęć gotowych",
            current_index=completed,
            total=batch_dict.get("total", completed),
            parallel_workers=batch_dict.get("parallel_workers"),
        )
        await _update_series_state(project_id, user_id, status="draft", settings_patch=final)
        return False

    return True


async def _reset_processing_items(project_id: uuid.UUID) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(PhotoSeriesItem).where(
                PhotoSeriesItem.project_id == project_id,
                PhotoSeriesItem.status == "processing",
            )
        )
        for item in result.scalars().all():
            item.status = "pending"
            item.error_message = None
        await db.commit()


async def _count_items_by_status(project_id: uuid.UUID, status: str) -> int:
    async with async_session() as db:
        result = await db.execute(
            select(func.count())
            .select_from(PhotoSeriesItem)
            .where(PhotoSeriesItem.project_id == project_id, PhotoSeriesItem.status == status)
        )
        return int(result.scalar() or 0)


def format_series_error(exc: Exception) -> str:
    msg = str(exc)
    if "rate_limit" in msg.lower() or "429" in msg:
        return "Limit zapytań OpenAI — spróbuj ponownie za chwilę lub zmniejsz SERIES_PARALLEL_WORKERS."
    if "unsupported mimetype" in msg or "unsupported_file_mimetype" in msg:
        return "Nieobsługiwany format pliku — użyj JPEG, PNG lub WebP."
    if "Nieobsługiwany format pliku" in msg:
        return msg
    marker = "'message': "
    if marker in msg:
        start = msg.find(marker) + len(marker)
        if start < len(msg) and msg[start] in "\"'":
            quote = msg[start]
            end = msg.find(quote, start + 1)
            if end > start:
                return msg[start + 1 : end]
    return msg[:300]


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "rate_limit" in msg or "429" in msg or "too many requests" in msg


def _batch_progress(settings: dict, **kwargs) -> dict:
    progress = {
        "phase": kwargs.get("phase", "processing"),
        "message": kwargs.get("message", "Przetwarzam serię..."),
        "current_index": kwargs.get("current_index", 0),
        "total": kwargs.get("total", 0),
        "parallel_workers": kwargs.get("parallel_workers"),
        "current_item_id": kwargs.get("current_item_id"),
        "current_category": kwargs.get("current_category"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if kwargs.get("error"):
        progress["error"] = kwargs["error"]
    settings["batch_render"] = progress
    return settings


@dataclass
class _BatchCounters:
    finished: int = 0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def mark_finished(self) -> int:
        async with self.lock:
            self.finished += 1
            return self.finished


async def _update_series_state(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    status: str | None = None,
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
        if settings_patch is not None:
            settings = dict(project.settings or {})
            settings.update(settings_patch)
            project.settings = settings
            flag_modified(project, "settings")
        await db.commit()


async def _update_item(
    item_id: uuid.UUID,
    *,
    status: str | None = None,
    result_path: str | None = None,
    error_message: str | None = None,
) -> None:
    async with async_session() as db:
        result = await db.execute(select(PhotoSeriesItem).where(PhotoSeriesItem.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            return
        if status is not None:
            item.status = status
        if result_path is not None:
            item.result_file_path = result_path
        if error_message is not None:
            item.error_message = error_message
        await db.commit()


def parse_batch_updated_at(settings: dict | None) -> datetime | None:
    if not settings:
        return None
    batch = settings.get("batch_render")
    if not isinstance(batch, dict):
        return None
    raw = batch.get("updated_at")
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def is_active_series_batch(project: Project) -> bool:
    if project.status != "processing" or project.project_type != "photo_series":
        return False
    updated_at = parse_batch_updated_at(project.settings)
    if updated_at is None:
        return False
    age = datetime.now(timezone.utc) - updated_at
    return age.total_seconds() < SERIES_HEARTBEAT_STALE_SEC


async def _parallel_batch_heartbeat(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    total: int,
    workers: int,
    started_at: datetime,
    counters: _BatchCounters,
    cancel_event: asyncio.Event,
) -> None:
    try:
        while True:
            await asyncio.sleep(12)
            if cancel_event.is_set():
                finished = counters.finished
                settings = dict((await _get_project_settings(project_id, user_id)) or {})
                _batch_progress(
                    settings,
                    phase="cancelling",
                    message=f"Zatrzymywanie... {finished}/{total} gotowych",
                    current_index=finished,
                    total=total,
                    parallel_workers=workers,
                )
                await _update_series_state(project_id, user_id, settings_patch=settings)
                continue
            finished = counters.finished
            elapsed = int((datetime.now(timezone.utc) - started_at).total_seconds())
            settings = dict((await _get_project_settings(project_id, user_id)) or {})
            _batch_progress(
                settings,
                phase="processing",
                message=(
                    f"GPT Image 2: {finished}/{total} gotowych "
                    f"({workers} równolegle)... ({elapsed}s)"
                ),
                current_index=finished,
                total=total,
                parallel_workers=workers,
            )
            await _update_series_state(project_id, user_id, settings_patch=settings)
    except asyncio.CancelledError:
        pass


async def _generate_with_retry(
    car_path: str,
    background_path: str,
    result_path: str,
    prompt: str,
    ai_config: dict,
) -> None:
    last_exc: Exception | None = None
    for attempt in range(RATE_LIMIT_MAX_RETRIES):
        try:
            await asyncio.to_thread(
                generate_ai_render,
                car_path,
                background_path,
                result_path,
                prompt,
                ai_config,
            )
            return
        except Exception as exc:
            last_exc = exc
            if _is_rate_limit_error(exc) and attempt < RATE_LIMIT_MAX_RETRIES - 1:
                wait = min(60.0, (2**attempt) + random.uniform(0.5, 2.0))
                logger.warning(
                    "OpenAI rate limit — ponawiam za %.1fs (próba %s/%s)",
                    wait,
                    attempt + 1,
                    RATE_LIMIT_MAX_RETRIES,
                )
                await asyncio.sleep(wait)
                continue
            raise
    if last_exc:
        raise last_exc


async def _process_series_item(
    item: PhotoSeriesItem,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    project_name: str,
    background_path: str,
    prompt: str,
    category_label: str,
    sort_index: int,
    result_path: str,
    ai_config: dict,
    semaphore: asyncio.Semaphore,
    counters: _BatchCounters,
    total: int,
    workers: int,
    cancel_event: asyncio.Event,
) -> None:
    async with semaphore:
        if cancel_event.is_set():
            return
        await _update_item(item.id, status="processing", error_message=None)
        try:
            await _generate_with_retry(
                item.file_path,
                background_path,
                result_path,
                prompt,
                ai_config,
            )
            await _update_item(item.id, status="completed", result_path=result_path)

            async with async_session() as db:
                await archive_generated_result(
                    db,
                    user_id=user_id,
                    project_id=project_id,
                    project_name=project_name,
                    project_type="photo_series",
                    source_path=result_path,
                    series_category=item.category,
                    source_item_id=item.id,
                    label=f"{project_name} — {category_label} #{sort_index}",
                )
                await db.commit()
        except Exception as exc:
            logger.exception("Series item failed: item=%s", item.id)
            await _update_item(item.id, status="failed", error_message=format_series_error(exc))
        finally:
            finished = await counters.mark_finished()
            settings = dict((await _get_project_settings(project_id, user_id)) or {})
            _batch_progress(
                settings,
                phase="processing",
                message=f"GPT Image 2: {finished}/{total} gotowych ({workers} równolegle)...",
                current_index=finished,
                total=total,
                parallel_workers=workers,
            )
            await _update_series_state(project_id, user_id, settings_patch=settings)


def _resolve_item_prompt(
    category: str,
    section_prompts: dict[str, str],
    exterior_prompt: str,
    interior_prompt: str,
) -> str:
    prompt = section_prompts.get(category)
    if prompt:
        return prompt
    if category == "exterior":
        return exterior_prompt
    if category == "interior":
        return interior_prompt
    return DEFAULT_EXTERIOR_PROMPT


def _category_label(category: str, sort_index: int) -> str:
    if category == "exterior":
        return "zewnętrzne"
    if category == "interior":
        return "wnętrze"
    if category.startswith("s") and category[1:].isdigit():
        return f"sekcja-{category[1:]}"
    return f"sekcja-{sort_index}"


async def run_photo_series_batch(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    background_path: str,
    section_prompts: dict[str, str],
    exterior_prompt: str,
    interior_prompt: str,
    default_ai_config: dict,
    section_ai_configs: dict[str, dict] | None = None,
) -> None:
    started_at = datetime.now(timezone.utc)
    settings_cfg = get_settings()
    logger.info("Photo series batch started: project=%s", project_id)
    cancel_event = await _register_batch_cancel(project_id)

    try:
        async with async_session() as db:
            result = await db.execute(
                select(PhotoSeriesItem)
                .where(PhotoSeriesItem.project_id == project_id)
                .order_by(PhotoSeriesItem.category.asc(), PhotoSeriesItem.sort_order.asc())
            )
            items = list(result.scalars().all())
            project = await db.get(Project, project_id)
            project_name = project.name if project else "Seria"

        if not items:
            await _update_series_state(
                project_id,
                user_id,
                status="failed",
                settings_patch={
                    "batch_render": {
                        "phase": "failed",
                        "message": "Brak zdjęć w serii",
                        "error": "Brak zdjęć w serii",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )
            return

        pending_items = [item for item in items if item.status != "completed"]

        if not pending_items:
            await _update_series_state(
                project_id,
                user_id,
                status="completed",
                settings_patch={
                    "batch_render": {
                        "phase": "done",
                        "message": "Wszystkie zdjęcia w serii są już gotowe",
                        "current_index": len(items),
                        "total": len(items),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            )
            return

        for item in pending_items:
            if item.status == "failed":
                await _update_item(item.id, status="pending", error_message=None)

        total = len(pending_items)
        workers = max(1, min(settings_cfg.series_parallel_workers, total))
        upload_dir = user_upload_dir(user_id)
        section_configs = section_ai_configs or {}
        counters = _BatchCounters()
        semaphore = asyncio.Semaphore(workers)

        initial_settings = dict((await _get_project_settings(project_id, user_id)) or {})
        _batch_progress(
            initial_settings,
            phase="processing",
            message=f"GPT Image 2: start — {workers} równolegle, {total} zdjęć...",
            current_index=0,
            total=total,
            parallel_workers=workers,
        )
        await _update_series_state(project_id, user_id, settings_patch=initial_settings)

        heartbeat = asyncio.create_task(
            _parallel_batch_heartbeat(
                project_id,
                user_id,
                total=total,
                workers=workers,
                started_at=started_at,
                counters=counters,
                cancel_event=cancel_event,
            )
        )

        try:
            tasks = []
            for index, item in enumerate(pending_items, start=1):
                prompt = _resolve_item_prompt(
                    item.category,
                    section_prompts,
                    exterior_prompt,
                    interior_prompt,
                )
                category_label = _category_label(item.category, index)
                item_ai_config = resolve_section_ai_config(
                    item.category,
                    section_configs,
                    default_ai_config,
                )
                ext = result_extension(item_ai_config.get("output_format", "png"))
                result_path = str(upload_dir / f"series_result_{item.id}{ext}")
                tasks.append(
                    _process_series_item(
                        item,
                        project_id=project_id,
                        user_id=user_id,
                        project_name=project_name,
                        background_path=background_path,
                        prompt=prompt,
                        category_label=category_label,
                        sort_index=index,
                        result_path=result_path,
                        ai_config=item_ai_config,
                        semaphore=semaphore,
                        counters=counters,
                        total=total,
                        workers=workers,
                        cancel_event=cancel_event,
                    )
                )
            await asyncio.gather(*tasks)
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat

        if cancel_event.is_set():
            await _reset_processing_items(project_id)
            completed_count = await _count_items_by_status(project_id, "completed")
            final_settings = dict((await _get_project_settings(project_id, user_id)) or {})
            _batch_progress(
                final_settings,
                phase="cancelled",
                message=f"Przetwarzanie zatrzymane — {completed_count} zdjęć gotowych",
                current_index=completed_count,
                total=total,
                parallel_workers=workers,
            )
            await _update_series_state(
                project_id,
                user_id,
                status="draft",
                settings_patch=final_settings,
            )
            duration = (datetime.now(timezone.utc) - started_at).total_seconds()
            logger.info(
                "Photo series batch cancelled: project=%s completed=%s duration=%.1fs",
                project_id,
                completed_count,
                duration,
            )
            return

        async with async_session() as db:
            failed = await db.execute(
                select(func.count())
                .select_from(PhotoSeriesItem)
                .where(
                    PhotoSeriesItem.project_id == project_id,
                    PhotoSeriesItem.status == "failed",
                )
            )
            completed = await db.execute(
                select(func.count())
                .select_from(PhotoSeriesItem)
                .where(
                    PhotoSeriesItem.project_id == project_id,
                    PhotoSeriesItem.status == "completed",
                )
            )
            failed_count = int(failed.scalar() or 0)
            completed_count = int(completed.scalar() or 0)

        final_settings = dict((await _get_project_settings(project_id, user_id)) or {})
        if failed_count > 0 and completed_count > 0:
            _batch_progress(
                final_settings,
                phase="done",
                message=f"Seria częściowo gotowa — {completed_count} OK, {failed_count} błędów",
                current_index=total,
                total=total,
                parallel_workers=workers,
                error=f"{failed_count} zdjęć nie powiodło się",
            )
            await _update_series_state(project_id, user_id, status="completed", settings_patch=final_settings)
        elif failed_count > 0:
            _batch_progress(
                final_settings,
                phase="failed",
                message="Seria zakończona z błędami — część zdjęć nie powiodła się",
                current_index=total,
                total=total,
                parallel_workers=workers,
                error="Część zdjęć nie powiodła się",
            )
            await _update_series_state(project_id, user_id, status="failed", settings_patch=final_settings)
        else:
            _batch_progress(
                final_settings,
                phase="done",
                message="Seria gotowa!",
                current_index=total,
                total=total,
                parallel_workers=workers,
            )
            await _update_series_state(project_id, user_id, status="completed", settings_patch=final_settings)

        duration = (datetime.now(timezone.utc) - started_at).total_seconds()
        logger.info(
            "Photo series batch done: project=%s workers=%s duration=%.1fs",
            project_id,
            workers,
            duration,
        )
    except Exception as exc:
        logger.exception("Photo series batch failed: project=%s", project_id)
        await _update_series_state(
            project_id,
            user_id,
            status="failed",
            settings_patch={
                "batch_render": {
                    "phase": "failed",
                    "message": "Przetwarzanie serii nie powiodło się",
                    "error": str(exc),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
    finally:
        await _unregister_batch_cancel(project_id)


async def _get_project_settings(project_id: uuid.UUID, user_id: uuid.UUID) -> dict | None:
    async with async_session() as db:
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
        project = result.scalar_one_or_none()
        return dict(project.settings or {}) if project else None
