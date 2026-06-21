import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

MAX_GENERATED_FILES_PER_USER = 20
MAX_SERIES_CATALOGS_PER_USER = 5
# Zachowane dla kompatybilności importów — limit plików wynika z liczby katalogów.
MAX_SERIES_GENERATED_FILES_PER_USER = 200


class GeneratedFile(Base):
    __tablename__ = "generated_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True, nullable=True
    )
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    project_type: Mapped[str] = mapped_column(String(20), nullable=False, default="advanced")
    series_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("photo_series_items.id", ondelete="SET NULL"), nullable=True
    )
    source_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="generated_files")


from app.models.user import User  # noqa: E402
