import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


ProjectType = Literal["advanced", "photo_series"]


class ProjectCreate(BaseModel):
    name: str = Field(default="Nowy projekt", max_length=200)
    project_type: ProjectType = "advanced"


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    settings: dict[str, Any] | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    project_type: str
    car_image_path: str | None
    background_image_path: str | None
    result_image_path: str | None
    settings: dict[str, Any] | None
    status: str
    created_at: datetime
    updated_at: datetime
    preview_series_item_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


AI_SIZE_PRESETS = frozenset(
    {
        "auto",
        "1024x1024",
        "1536x1024",
        "1024x1536",
        "2048x1536",
        "2048x2048",
        "2560x1440",
        "2560x1088",
        "1440x2560",
        "2816x2816",
        "3840x2160",
        "2160x3840",
    }
)


class AiImageConfig(BaseModel):
    quality: Literal["auto", "low", "medium", "high"] = "low"
    size: str = "auto"
    output_format: Literal["png", "jpeg", "webp"] = "png"
    output_compression: int = Field(default=100, ge=0, le=100)

    @field_validator("size")
    @classmethod
    def validate_size(cls, value: str) -> str:
        if value not in AI_SIZE_PRESETS:
            raise ValueError(f"Nieobsługiwany rozmiar: {value}")
        return value


class AiGenerateRequest(BaseModel):
    prompt: str | None = Field(default=None, max_length=4000)
    ai_config: AiImageConfig | None = None
