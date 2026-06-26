import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RepairItem(Base):
    __tablename__ = "repair_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repair_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repairs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # part | service
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(60), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=1)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)  # cena sprzedaży brutto
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)  # cena zakupu
    vat_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=23)  # 0 | 8 | 23
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)  # quantity × unit_price (brutto)
    warranty_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    repair: Mapped["Repair"] = relationship(back_populates="items")


from app.models.repair import Repair  # noqa: E402
