import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    generated_files: Mapped[list["GeneratedFile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    saved_prompts: Mapped[list["SavedPrompt"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


from app.models.generated_file import GeneratedFile  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.saved_prompt import SavedPrompt  # noqa: E402
