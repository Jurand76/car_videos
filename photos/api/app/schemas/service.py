import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ─────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────
CustomerKind = Literal["person", "company"]


class CustomerCreate(BaseModel):
    kind: CustomerKind = "person"
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=200)
    tax_id: str | None = Field(default=None, max_length=30)
    phone: str = Field(..., max_length=60)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=400)
    notes: str | None = None


class CustomerUpdate(BaseModel):
    kind: CustomerKind | None = None
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=200)
    tax_id: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=60)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=400)
    notes: str | None = None


class CarBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    make: str
    model: str
    plate: str
    vin: str | None = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    first_name: str | None
    last_name: str | None
    company_name: str | None
    tax_id: str | None
    phone: str
    email: str | None
    address: str | None
    notes: str | None
    cars: list[CarBrief] = []
    created_at: datetime
    updated_at: datetime


class CustomerListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    first_name: str | None
    last_name: str | None
    company_name: str | None
    tax_id: str | None
    phone: str
    email: str | None
    cars_count: int = 0


# ─────────────────────────────────────────────
# Cars
# ─────────────────────────────────────────────
class CarCreate(BaseModel):
    customer_id: uuid.UUID
    make: str = Field(..., max_length=80)
    model: str = Field(..., max_length=120)
    year: int | None = Field(default=None, ge=1900, le=2100)
    vin: str | None = Field(default=None, max_length=17)
    plate: str = Field(..., max_length=20)
    color: str | None = Field(default=None, max_length=60)
    mileage: int | None = Field(default=None, ge=0)
    notes: str | None = None


class CarUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1900, le=2100)
    vin: str | None = Field(default=None, max_length=17)
    plate: str | None = Field(default=None, max_length=20)
    color: str | None = Field(default=None, max_length=60)
    mileage: int | None = Field(default=None, ge=0)
    notes: str | None = None


class RepairBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    received_at: datetime
    completed_at: datetime | None


class CarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    make: str
    model: str
    year: int | None
    vin: str | None
    plate: str
    color: str | None
    mileage: int | None
    notes: str | None
    repairs: list[RepairBrief] = []
    created_at: datetime
    updated_at: datetime


class CarListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    make: str
    model: str
    year: int | None
    plate: str
    vin: str | None
    color: str | None
    mileage: int | None


# ─────────────────────────────────────────────
# Staff
# ─────────────────────────────────────────────
class StaffCreate(BaseModel):
    name: str = Field(..., max_length=120)
    phone: str | None = Field(default=None, max_length=60)


class StaffUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=60)


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: str | None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────
# Repair items
# ─────────────────────────────────────────────
ItemKind = Literal["part", "service"]
VatRate = Literal[0, 8, 23]


class RepairItemCreate(BaseModel):
    kind: ItemKind
    name: str = Field(..., max_length=200)
    sku: str | None = Field(default=None, max_length=60)
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    unit: str | None = Field(default=None, max_length=20)
    unit_price: Decimal = Field(..., ge=0)  # cena sprzedaży brutto
    purchase_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: VatRate = 23
    warranty_months: int | None = Field(default=None, ge=0)
    sort_order: int = 0


class RepairItemUpdate(BaseModel):
    kind: ItemKind | None = None
    name: str | None = Field(default=None, max_length=200)
    sku: str | None = Field(default=None, max_length=60)
    quantity: Decimal | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    unit_price: Decimal | None = Field(default=None, ge=0)
    purchase_price: Decimal | None = Field(default=None, ge=0)
    vat_rate: VatRate | None = None
    warranty_months: int | None = Field(default=None, ge=0)
    sort_order: int | None = None


class RepairItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    repair_id: uuid.UUID
    kind: str
    name: str
    sku: str | None
    quantity: Decimal
    unit: str | None
    unit_price: Decimal
    purchase_price: Decimal | None
    vat_rate: int
    total: Decimal
    warranty_months: int | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────
# Repairs
# ─────────────────────────────────────────────
RepairStatus = Literal["received", "in_progress", "done", "handed_over"]


class RepairCreate(BaseModel):
    car_id: uuid.UUID
    staff_id: uuid.UUID | None = None
    received_at: datetime | None = None
    fault_desc: str | None = None
    work_scope: str | None = None
    status: RepairStatus = "received"
    mileage_at_repair: int | None = Field(default=None, ge=0)
    notes: str | None = None


class RepairUpdate(BaseModel):
    staff_id: uuid.UUID | None = None
    received_at: datetime | None = None
    completed_at: datetime | None = None
    fault_desc: str | None = None
    work_scope: str | None = None
    status: RepairStatus | None = None
    mileage_at_repair: int | None = Field(default=None, ge=0)
    notes: str | None = None


class RepairTotals(BaseModel):
    """Sumy naprawy liczone live z pozycji."""

    parts_total: Decimal = Decimal("0")
    labor_total: Decimal = Decimal("0")
    grand_total: Decimal = Decimal("0")
    parts_purchase_total: Decimal = Decimal("0")  # koszt zakupu części (marża)


class RepairResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    car_id: uuid.UUID
    staff_id: uuid.UUID | None
    received_at: datetime
    completed_at: datetime | None
    fault_desc: str | None
    work_scope: str | None
    status: str
    mileage_at_repair: int | None
    notes: str | None
    items: list[RepairItemResponse] = []
    totals: RepairTotals | None = None
    created_at: datetime
    updated_at: datetime


class RepairListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    car_id: uuid.UUID
    staff_id: uuid.UUID | None
    received_at: datetime
    completed_at: datetime | None
    status: str
    grand_total: Decimal | None = None
