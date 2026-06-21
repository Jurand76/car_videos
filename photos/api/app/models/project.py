import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="Nowy projekt")
    project_type: Mapped[str] = mapped_column(String(20), nullable=False, default="advanced")
    car_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    background_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    result_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="projects")
    series_items: Mapped[list["PhotoSeriesItem"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


from app.models.photo_series_item import PhotoSeriesItem  # noqa: E402
from app.models.user import User  # noqa: E402
