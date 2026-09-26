from datetime import datetime
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


class GeneratedFileResponse(BaseModel):
    id: UUID
    project_id: UUID | None
    project_name: str
    project_type: str
    series_category: str | None
    source_item_id: UUID | None
    label: str | None
    created_at: datetime
    file_path: str = Field(exclude=True)

    model_config = {"from_attributes": True}

    # Rozszerzenie zapisanego pliku (jpg/png/webp) — do nazwy przy pobieraniu
    @computed_field
    @property
    def file_ext(self) -> str:
        suffix = Path(self.file_path).suffix.lower().lstrip(".")
        return "jpg" if suffix == "jpeg" else (suffix or "png")
