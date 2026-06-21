from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GeneratedFileResponse(BaseModel):
    id: UUID
    project_id: UUID | None
    project_name: str
    project_type: str
    series_category: str | None
    source_item_id: UUID | None
    label: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
