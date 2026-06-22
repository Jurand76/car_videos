from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.background import SavedBackgroundResponse
from app.services.storage import list_user_backgrounds, resolve_user_background

router = APIRouter(prefix="/backgrounds", tags=["backgrounds"])


def _media_type(path: Path) -> str:
    if path.suffix.lower() == ".png":
        return "image/png"
    if path.suffix.lower() == ".webp":
        return "image/webp"
    return "image/jpeg"


@router.get("", response_model=list[SavedBackgroundResponse])
async def list_saved_backgrounds(
    current_user: User = Depends(get_current_user),
) -> list[SavedBackgroundResponse]:
    return [
        SavedBackgroundResponse(
            id=item.id,
            filename=item.filename,
            created_at=item.created_at,
        )
        for item in list_user_backgrounds(current_user.id)
    ]


@router.get("/{background_id}/file")
async def get_saved_background_file(
    background_id: str,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    file_path = resolve_user_background(current_user.id, background_id)
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tło nie znalezione")

    return FileResponse(file_path, media_type=_media_type(file_path))


@router.delete("/{background_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_background(
    background_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    file_path = resolve_user_background(current_user.id, background_id)
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tło nie znalezione")

    path_str = str(file_path)
    result = await db.execute(
        select(Project).where(
            Project.user_id == current_user.id,
            Project.background_image_path == path_str,
        )
    )
    for project in result.scalars():
        project.background_image_path = None
        project.status = "draft"

    file_path.unlink(missing_ok=True)
    await db.commit()

