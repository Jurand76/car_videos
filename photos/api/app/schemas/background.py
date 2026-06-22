from datetime import datetime

from pydantic import BaseModel, Field


class SavedBackgroundResponse(BaseModel):
    id: str
    filename: str
    created_at: datetime


class SelectBackgroundRequest(BaseModel):
    background_id: str = Field(..., min_length=1, max_length=200)
