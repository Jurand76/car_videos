from typing import Any

from pydantic import ValidationError

from app.schemas.project import AiImageConfig


def parse_ai_config(raw: dict[str, Any] | None) -> AiImageConfig:
    if not raw:
        return AiImageConfig()
    nested = raw.get("ai_config")
    if not isinstance(nested, dict):
        return AiImageConfig()
    try:
        return AiImageConfig.model_validate(nested)
    except ValidationError:
        return AiImageConfig()


def result_extension(output_format: str) -> str:
    if output_format == "jpeg":
        return ".jpg"
    if output_format == "webp":
        return ".webp"
    return ".png"
