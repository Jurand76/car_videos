from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.billing import OpenAiBillingResponse
from app.services.openai_billing import get_openai_billing_snapshot

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/openai", response_model=OpenAiBillingResponse)
async def get_openai_billing(
    _: User = Depends(get_current_user),
    fresh: bool = Query(False, description="Pomiń cache — do pomiaru kosztu generowania"),
) -> OpenAiBillingResponse:
    data = await get_openai_billing_snapshot(fresh=fresh)
    return OpenAiBillingResponse(**data)
