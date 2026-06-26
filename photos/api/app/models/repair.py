import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Repair(Base):
    __tablename__ = "repairs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    car_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cars.id", ondelete="CASCADE"), index=True, nullable=False
    )
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff.id", ondelete="SET NULL"), index=True, nullable=True
    )
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fault_desc: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="received")
    mileage_at_repair: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    car: Mapped["Car"] = relationship(back_populates="repairs")
    staff: Mapped["Staff | None"] = relationship(back_populates="repairs")
    items: Mapped[list["RepairItem"]] = relationship(
        back_populates="repair", cascade="all, delete-orphan", order_by="RepairItem.sort_order"
    )


from app.models.car import Car  # noqa: E402
from app.models.repair_item import RepairItem  # noqa: E402
from app.models.staff import Staff  # noqa: E402
