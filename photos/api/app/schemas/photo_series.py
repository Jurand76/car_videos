import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.project import AiImageConfig

SECTION_CATEGORY_RE = re.compile(r"^[a-z][a-z0-9_]{0,19}$")


def validate_section_category(value: str) -> str:
    if not SECTION_CATEGORY_RE.fullmatch(value):
        raise ValueError("Nieprawidłowy identyfikator sekcji")
    return value


class PhotoSeriesItemResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    category: str
    sort_order: int
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SeriesSectionConfig(BaseModel):
    id: str
    prompt: str = Field(default="", max_length=4000)

    @field_validator("id")
    @classmethod
    def validate_section_id(cls, value: str) -> str:
        return validate_section_category(value)


class SeriesGenerateRequest(BaseModel):
    sections: list[SeriesSectionConfig] | None = None
    section_prompts: dict[str, str] | None = None
    exterior_prompt: str | None = Field(default=None, max_length=4000)
    interior_prompt: str | None = Field(default=None, max_length=4000)
    ai_config: AiImageConfig | None = None
    section_ai_configs: dict[str, AiImageConfig] | None = None

    @field_validator("section_prompts")
    @classmethod
    def validate_section_prompts(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        for key in value:
            validate_section_category(key)
        return value

    @field_validator("section_ai_configs")
    @classmethod
    def validate_section_ai_configs(
        cls,
        value: dict[str, AiImageConfig] | None,
    ) -> dict[str, AiImageConfig] | None:
        if value is None:
            return None
        for key in value:
            validate_section_category(key)
        return value
