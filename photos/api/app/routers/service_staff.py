import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.staff import Staff
from app.models.user import User
from app.schemas.service import StaffCreate, StaffResponse, StaffUpdate

router = APIRouter(prefix="/service/staff", tags=["service-staff"])


@router.get("", response_model=list[StaffResponse])
async def list_staff(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Staff]:
    stmt = select(Staff).order_by(Staff.name.asc())
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Staff:
    staff = Staff(name=payload.name, phone=payload.phone)
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return staff


@router.patch("/{staff_id}", response_model=StaffResponse)
async def update_staff(
    staff_id: uuid.UUID,
    payload: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Staff:
    stmt = select(Staff).where(Staff.id == staff_id)
    staff = (await db.execute(stmt)).scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pracownik nie istnieje")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(staff, key, value)
    await db.commit()
    await db.refresh(staff)
    return staff


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    stmt = select(Staff).where(Staff.id == staff_id)
    staff = (await db.execute(stmt)).scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pracownik nie istnieje")
    await db.delete(staff)
    await db.commit()
