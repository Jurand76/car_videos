import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.customer import Customer
from app.models.user import User
from app.schemas.service import CustomerCreate, CustomerListItem, CustomerResponse, CustomerUpdate

router = APIRouter(prefix="/service/customers", tags=["service-customers"])


@router.get("", response_model=list[CustomerListItem])
async def list_customers(
    q: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CustomerListItem]:
    stmt = (
        select(Customer)
        .options(selectinload(Customer.cars))
        .order_by(Customer.created_at.desc())
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Customer.first_name.ilike(like),
                Customer.last_name.ilike(like),
                Customer.company_name.ilike(like),
                Customer.phone.ilike(like),
                Customer.tax_id.ilike(like),
                Customer.email.ilike(like),
            )
        )
    rows = (await db.execute(stmt)).scalars().unique().all()
    result: list[CustomerListItem] = []
    for c in rows:
        item = CustomerListItem.model_validate(c)
        item.cars_count = len(c.cars)
        result.append(item)
    return result


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Customer:
    _validate_customer_payload(payload)
    customer = Customer(
        kind=payload.kind,
        first_name=payload.first_name,
        last_name=payload.last_name,
        company_name=payload.company_name,
        tax_id=payload.tax_id,
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        address=payload.address,
        notes=payload.notes,
    )
    db.add(customer)
    await db.commit()
    stmt = (
        select(Customer)
        .options(selectinload(Customer.cars))
        .where(Customer.id == customer.id)
    )
    customer = (await db.execute(stmt)).scalar_one()
    return customer


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Customer:
    stmt = select(Customer).options(selectinload(Customer.cars)).where(Customer.id == customer_id)
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klient nie istnieje")
    return customer


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Customer:
    stmt = select(Customer).options(selectinload(Customer.cars)).where(Customer.id == customer_id)
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klient nie istnieje")
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] is not None:
        data["email"] = str(data["email"])
    for key, value in data.items():
        setattr(customer, key, value)
    await db.commit()
    stmt = (
        select(Customer)
        .options(selectinload(Customer.cars))
        .where(Customer.id == customer.id)
    )
    customer = (await db.execute(stmt)).scalar_one()
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    stmt = select(Customer).where(Customer.id == customer_id)
    customer = (await db.execute(stmt)).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klient nie istnieje")
    await db.delete(customer)
    await db.commit()


def _validate_customer_payload(payload: CustomerCreate | CustomerUpdate) -> None:
    if payload.kind == "person":
        if not (payload.first_name or payload.last_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dla osoby prywatnej podaj imię lub nazwisko",
            )
    elif payload.kind == "company" and not payload.company_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dla firmy podaj nazwę firmy",
        )
