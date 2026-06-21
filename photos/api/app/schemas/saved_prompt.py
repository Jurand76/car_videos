from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SavedPromptCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    prompt_text: str = Field(min_length=1, max_length=4000)


class SavedPromptUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    prompt_text: str | None = Field(default=None, min_length=1, max_length=4000)


class SavedPromptResponse(BaseModel):
    id: UUID
    name: str
    prompt_text: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
