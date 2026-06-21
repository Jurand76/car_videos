"""Kompozycja studyjna przez OpenAI GPT Image (edits + multi-image)."""

import base64
import logging
import mimetypes
from pathlib import Path

from app.config import get_settings
from app.schemas.project import AiImageConfig
from app.services.ai_config import parse_ai_config

logger = logging.getLogger(__name__)

# Python w kontenerze często nie zna .webp — bez tego OpenAI dostaje application/octet-stream.
mimetypes.add_type("image/webp", ".webp")

MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

DEFAULT_PROMPT = (
    "Place the car from the first image realistically onto the studio platform or background "
    "from the second image. Match perspective, scale, lighting, and contact shadow on the floor. "
    "Professional automotive studio product photo. Keep the exact car model and color unchanged."
)


def _image_upload_tuple(path: str) -> tuple[str, bytes, str]:
    """Plik jako (nazwa, bajty, mime) — wymagane przez OpenAI dla webp i innych formatów."""
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    mime = MIME_BY_SUFFIX.get(suffix) or mimetypes.guess_type(str(file_path))[0]
    if not mime or not mime.startswith("image/"):
        raise ValueError(
            f"Nieobsługiwany format pliku: {file_path.name}. Dozwolone: JPEG, PNG, WebP."
        )
    return (file_path.name, file_path.read_bytes(), mime)


def generate_ai_render(
    car_path: str,
    background_path: str,
    output_path: str,
    prompt: str | None = None,
    ai_config: AiImageConfig | dict | None = None,
) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("Brak OPENAI_API_KEY — ustaw klucz w project.env")

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError(
            "Pakiet openai nie jest zainstalowany. Uruchom: docker compose exec api pip install openai"
        ) from exc

    client = OpenAI(api_key=settings.openai_api_key, timeout=600.0)
    user_prompt = prompt.strip() if prompt and prompt.strip() else DEFAULT_PROMPT
    if isinstance(ai_config, dict):
        config = parse_ai_config({"ai_config": ai_config})
    elif isinstance(ai_config, AiImageConfig):
        config = ai_config
    else:
        config = parse_ai_config(
            {
                "ai_config": {
                    "quality": settings.openai_image_quality,
                    "size": settings.openai_image_size,
                }
            }
        )

    edit_kwargs: dict = {
        "model": settings.openai_image_model,
        "prompt": user_prompt,
        "quality": config.quality,
        "size": config.size,
        "output_format": config.output_format,
    }
    if config.output_format in {"jpeg", "webp"}:
        edit_kwargs["output_compression"] = 100

    logger.info(
        "AI render: model=%s quality=%s size=%s format=%s car=%s bg=%s",
        settings.openai_image_model,
        config.quality,
        config.size,
        config.output_format,
        car_path,
        background_path,
    )

    car_upload = _image_upload_tuple(car_path)
    bg_upload = _image_upload_tuple(background_path)

    response = client.images.edit(
        image=[car_upload, bg_upload],
        **edit_kwargs,
    )

    if not response.data:
        raise RuntimeError("OpenAI nie zwróciło obrazu")

    item = response.data[0]
    if item.b64_json:
        image_bytes = base64.b64decode(item.b64_json)
    elif item.url:
        import httpx

        image_bytes = httpx.get(item.url, timeout=300).content
    else:
        raise RuntimeError("OpenAI nie zwróciło danych obrazu (brak b64_json i url)")
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(image_bytes)
    return str(out)
