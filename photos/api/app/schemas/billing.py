from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class OpenAiBillingResponse(BaseModel):
    status: Literal["ok", "usage_only", "unavailable", "no_key"]
    available_usd: float | None
    granted_usd: float | None
    used_usd: float | None
    pending_usd: float | None
    month_spend_usd: float | None
    message: str
    billing_url: str
    updated_at: datetime
