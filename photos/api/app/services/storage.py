import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings

settings = get_settings()


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
