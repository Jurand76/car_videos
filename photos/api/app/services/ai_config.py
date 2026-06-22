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


def parse_ai_config_value(raw: dict[str, Any] | None) -> AiImageConfig:
    if not raw:
        return AiImageConfig()
    try:
        return AiImageConfig.model_validate(raw)
    except ValidationError:
        return AiImageConfig()


def resolve_section_ai_config(
    section_id: str,
    section_ai_configs: dict[str, Any] | None,
    default: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fallback = parse_ai_config_value(default).model_dump()
    if not section_ai_configs:
        return fallback
    nested = section_ai_configs.get(section_id)
    if not isinstance(nested, dict):
        return fallback
    return parse_ai_config_value(nested).model_dump()


def result_extension(output_format: str) -> str:
    if output_format == "jpeg":
        return ".jpg"
    if output_format == "webp":
        return ".webp"
    return ".png"
