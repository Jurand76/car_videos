import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.car import Car
from app.models.repair import Repair
from app.models.repair_item import RepairItem
from app.models.staff import Staff
from app.models.user import User
from app.schemas.service import (
    RepairCreate,
    RepairItemCreate,
    RepairItemResponse,
    RepairItemUpdate,
    RepairListItem,
    RepairResponse,
    RepairTotals,
    RepairUpdate,
)

router = APIRouter(prefix="/service/repairs", tags=["service-repairs"])


# ─────────────────────────────────────────────
# Repairs CRUD
# ─────────────────────────────────────────────
@router.get("", response_model=list[RepairListItem])
async def list_repairs(
    car_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RepairListItem]:
    stmt = select(Repair, func.coalesce(func.sum(RepairItem.total), 0).label("grand_total")).outerjoin(
        RepairItem, RepairItem.repair_id == Repair.id
    ).group_by(Repair.id).order_by(Repair.received_at.desc())

    if car_id is not None:
        stmt = stmt.where(Repair.car_id == car_id)
    if status_filter:
        stmt = stmt.where(Repair.status == status_filter)

    rows = (await db.execute(stmt)).all()
    result: list[RepairListItem] = []
    for repair, grand_total in rows:
        item = RepairListItem.model_validate(repair)
        item.grand_total = Decimal(grand_total) if grand_total else Decimal("0")
        result.append(item)
    return result


@router.post("", response_model=RepairResponse, status_code=status.HTTP_201_CREATED)
async def create_repair(
    payload: RepairCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Repair:
    await _ensure_car_exists(db, payload.car_id)
    if payload.staff_id is not None:
        await _ensure_staff_exists(db, payload.staff_id)

    repair = Repair(
        car_id=payload.car_id,
        staff_id=payload.staff_id,
        received_at=payload.received_at,
        fault_desc=payload.fault_desc,
        work_scope=payload.work_scope,
        status=payload.status,
        mileage_at_repair=payload.mileage_at_repair,
        notes=payload.notes,
    )
    # Nadaj kolejny numer zlecenia (max + 1). Brak numerrów -> 1.
    max_no = (await db.execute(select(func.coalesce(func.max(Repair.number), 0)))).scalar_one()
    repair.number = int(max_no) + 1
    db.add(repair)
    await db.commit()
    await db.refresh(repair)
    return await _load_repair(db, repair.id)


@router.get("/{repair_id}", response_model=RepairResponse)
async def get_repair(
    repair_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Repair:
    repair = await _load_repair(db, repair_id)
    if repair is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Naprawa nie istnieje")
    return repair


@router.patch("/{repair_id}", response_model=RepairResponse)
async def update_repair(
    repair_id: uuid.UUID,
    payload: RepairUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Repair:
    repair = await _load_repair(db, repair_id)
    if repair is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Naprawa nie istnieje")
    if payload.staff_id is not None and payload.staff_id != repair.staff_id:
        await _ensure_staff_exists(db, payload.staff_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(repair, key, value)
    await db.commit()
    return await _load_repair(db, repair_id)


@router.delete("/{repair_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repair(
    repair_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    repair = await _load_repair(db, repair_id)
    if repair is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Naprawa nie istnieje")
    await db.delete(repair)
    await db.commit()


# ─────────────────────────────────────────────
# Repair items CRUD
# ─────────────────────────────────────────────
@router.post("/{repair_id}/items", response_model=RepairItemResponse, status_code=status.HTTP_201_CREATED)
async def add_item(
    repair_id: uuid.UUID,
    payload: RepairItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RepairItem:
    await _ensure_repair_exists(db, repair_id)
    item = RepairItem(
        repair_id=repair_id,
        kind=payload.kind,
        name=payload.name,
        sku=payload.sku,
        quantity=payload.quantity,
        unit=payload.unit,
        unit_price=payload.unit_price,
        purchase_price=payload.purchase_price,
        vat_rate=payload.vat_rate,
        total=(_round_money(payload.quantity * payload.unit_price)),
        warranty_months=payload.warranty_months,
        sort_order=payload.sort_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{repair_id}/items/{item_id}", response_model=RepairItemResponse)
async def update_item(
    repair_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: RepairItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RepairItem:
    item = await _load_item(db, repair_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(item, key, value)
    # przelicz total jeśli zmieniono qty lub unit_price
    if "quantity" in data or "unit_price" in data:
        item.total = _round_money(item.quantity * item.unit_price)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{repair_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    repair_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    item = await _load_item(db, repair_id, item_id)
    await db.delete(item)
    await db.commit()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
def _round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _load_repair(db: AsyncSession, repair_id: uuid.UUID) -> Repair | None:
    stmt = (
        select(Repair)
        .options(selectinload(Repair.items), selectinload(Repair.staff))
        .where(Repair.id == repair_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _load_item(db: AsyncSession, repair_id: uuid.UUID, item_id: uuid.UUID) -> RepairItem:
    stmt = select(RepairItem).where(RepairItem.id == item_id, RepairItem.repair_id == repair_id)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pozycja nie istnieje")
    return item


async def _ensure_repair_exists(db: AsyncSession, repair_id: uuid.UUID) -> None:
    exists = (await db.execute(select(Repair.id).where(Repair.id == repair_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Naprawa nie istnieje")


async def _ensure_car_exists(db: AsyncSession, car_id: uuid.UUID) -> None:
    exists = (await db.execute(select(Car.id).where(Car.id == car_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pojazd nie istnieje")


async def _ensure_staff_exists(db: AsyncSession, staff_id: uuid.UUID) -> None:
    exists = (await db.execute(select(Staff.id).where(Staff.id == staff_id))).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pracownik nie istnieje")


# ─────────────────────────────────────────────
# Totals (liczone live)
# ─────────────────────────────────────────────
@router.get("/{repair_id}/totals", response_model=RepairTotals)
async def get_repair_totals(
    repair_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RepairTotals:
    stmt = (
        select(
            func.coalesce(
                func.sum(RepairItem.total).filter(RepairItem.kind == "part"), 0
            ).label("parts_total"),
            func.coalesce(
                func.sum(RepairItem.total).filter(RepairItem.kind == "service"), 0
            ).label("labor_total"),
            func.coalesce(func.sum(RepairItem.total), 0).label("grand_total"),
            func.coalesce(
                func.sum(RepairItem.purchase_price * RepairItem.quantity)
                .filter(RepairItem.kind == "part"),
                0,
            ).label("parts_purchase_total"),
        )
        .select_from(RepairItem)
        .where(RepairItem.repair_id == repair_id)
    )
    row = (await db.execute(stmt)).one()
    return RepairTotals(
        parts_total=_round_money(Decimal(row.parts_total)),
        labor_total=_round_money(Decimal(row.labor_total)),
        grand_total=_round_money(Decimal(row.grand_total)),
        parts_purchase_total=_round_money(Decimal(row.parts_purchase_total)),
    )
