import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.car import Car
from app.models.customer import Customer
from app.models.user import User
from app.schemas.service import CarCreate, CarListItem, CarResponse, CarUpdate

router = APIRouter(prefix="/service/cars", tags=["service-cars"])


@router.get("", response_model=list[CarListItem])
async def list_cars(
    q: str | None = Query(default=None),
    customer_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CarListItem]:
    stmt = select(Car).order_by(Car.created_at.desc())
    if customer_id is not None:
        stmt = stmt.where(Car.customer_id == customer_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Car.make.ilike(like),
                Car.model.ilike(like),
                Car.plate.ilike(like),
                Car.vin.ilike(like),
            )
        )
    rows = (await db.execute(stmt)).scalars().all()
    return [CarListItem.model_validate(c) for c in rows]


@router.post("", response_model=CarResponse, status_code=status.HTTP_201_CREATED)
async def create_car(
    payload: CarCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Car:
    await _ensure_customer_exists(db, payload.customer_id)
    car = Car(
        customer_id=payload.customer_id,
        make=payload.make,
        model=payload.model,
        year=payload.year,
        vin=payload.vin,
        plate=payload.plate,
        color=payload.color,
        mileage=payload.mileage,
        notes=payload.notes,
    )
    db.add(car)
    await db.commit()
    await db.refresh(car)
    await db.refresh(car, attribute_names=["repairs"])
    return car


@router.get("/{car_id}", response_model=CarResponse)
async def get_car(
    car_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Car:
    stmt = (
        select(Car)
        .options(selectinload(Car.repairs))
        .where(Car.id == car_id)
    )
    car = (await db.execute(stmt)).scalar_one_or_none()
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pojazd nie istnieje")
    return car


@router.patch("/{car_id}", response_model=CarResponse)
async def update_car(
    car_id: uuid.UUID,
    payload: CarUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Car:
    stmt = (
        select(Car)
        .options(selectinload(Car.repairs))
        .where(Car.id == car_id)
    )
    car = (await db.execute(stmt)).scalar_one_or_none()
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pojazd nie istnieje")
    if payload.customer_id is not None and payload.customer_id != car.customer_id:
        await _ensure_customer_exists(db, payload.customer_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(car, key, value)
    await db.commit()
    await db.refresh(car)
    await db.refresh(car, attribute_names=["repairs"])
    return car


@router.delete("/{car_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_car(
    car_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    stmt = select(Car).where(Car.id == car_id)
    car = (await db.execute(stmt)).scalar_one_or_none()
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pojazd nie istnieje")
    await db.delete(car)
    await db.commit()


async def _ensure_customer_exists(db: AsyncSession, customer_id: uuid.UUID) -> None:
    exists = (
        await db.execute(select(Customer).where(Customer.id == customer_id))
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klient nie istnieje")
