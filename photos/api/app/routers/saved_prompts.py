import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.saved_prompt import SavedPrompt
from app.models.user import User
from app.schemas.saved_prompt import SavedPromptCreate, SavedPromptResponse, SavedPromptUpdate

router = APIRouter(prefix="/prompts", tags=["prompts"])


async def _get_user_prompt(
    prompt_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> SavedPrompt:
    result = await db.execute(
        select(SavedPrompt).where(
            SavedPrompt.id == prompt_id,
            SavedPrompt.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt nie znaleziony")
    return entry


@router.get("", response_model=list[SavedPromptResponse])
async def list_saved_prompts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SavedPrompt]:
    result = await db.execute(
        select(SavedPrompt)
        .where(SavedPrompt.user_id == current_user.id)
        .order_by(SavedPrompt.updated_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=SavedPromptResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_prompt(
    payload: SavedPromptCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedPrompt:
    entry = SavedPrompt(
        user_id=current_user.id,
        name=payload.name.strip(),
        prompt_text=payload.prompt_text.strip(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch("/{prompt_id}", response_model=SavedPromptResponse)
async def update_saved_prompt(
    prompt_id: uuid.UUID,
    payload: SavedPromptUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedPrompt:
    entry = await _get_user_prompt(prompt_id, current_user, db)

    if payload.name is not None:
        entry.name = payload.name.strip()
    if payload.prompt_text is not None:
        entry.prompt_text = payload.prompt_text.strip()

    if payload.name is None and payload.prompt_text is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brak pól do aktualizacji")

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_prompt(
    prompt_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    entry = await _get_user_prompt(prompt_id, current_user, db)
    await db.delete(entry)
    await db.commit()
