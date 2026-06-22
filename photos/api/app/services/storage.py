import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings

settings = get_settings()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
_BACKGROUND_ID_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def ensure_upload_dir() -> Path:
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def user_upload_dir(user_id: uuid.UUID) -> Path:
    path = ensure_upload_dir() / str(user_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_upload(user_id: uuid.UUID, file: UploadFile, prefix: str) -> str:
    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{prefix}_{uuid.uuid4().hex}{suffix}"
    destination = user_upload_dir(user_id) / filename

    content = await file.read()
    destination.write_bytes(content)
    return str(destination)


def user_backgrounds_dir(user_id: uuid.UUID) -> Path:
    path = user_upload_dir(user_id) / "backgrounds"
    path.mkdir(parents=True, exist_ok=True)
    return path


@dataclass(frozen=True)
class SavedBackgroundInfo:
    id: str
    filename: str
    path: Path
    created_at: datetime


def _is_background_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def _background_entry(path: Path) -> SavedBackgroundInfo:
    stat = path.stat()
    return SavedBackgroundInfo(
        id=path.name,
        filename=path.name,
        path=path,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )


def list_user_backgrounds(user_id: uuid.UUID) -> list[SavedBackgroundInfo]:
    entries: list[SavedBackgroundInfo] = []
    seen: set[str] = set()

    bg_dir = user_backgrounds_dir(user_id)
    for path in sorted(bg_dir.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
        if not _is_background_image(path):
            continue
        entries.append(_background_entry(path))
        seen.add(path.name)

    user_dir = user_upload_dir(user_id)
    for path in sorted(user_dir.glob("background_*"), key=lambda item: item.stat().st_mtime, reverse=True):
        if path.name in seen or not _is_background_image(path):
            continue
        entries.append(_background_entry(path))
        seen.add(path.name)

    entries.sort(key=lambda item: item.created_at, reverse=True)
    return entries


def resolve_user_background(user_id: uuid.UUID, background_id: str) -> Path | None:
    if not _BACKGROUND_ID_RE.match(background_id):
        return None

    library_path = user_backgrounds_dir(user_id) / background_id
    if _is_background_image(library_path):
        return library_path

    legacy_path = user_upload_dir(user_id) / background_id
    if _is_background_image(legacy_path):
        return legacy_path

    return None


async def save_background_library(user_id: uuid.UUID, file: UploadFile) -> str:
    suffix = Path(file.filename or "background.jpg").suffix.lower()
    if suffix not in IMAGE_EXTENSIONS:
        suffix = ".jpg"
    filename = f"bg_{uuid.uuid4().hex}{suffix}"
    destination = user_backgrounds_dir(user_id) / filename

    content = await file.read()
    destination.write_bytes(content)
    return str(destination)
