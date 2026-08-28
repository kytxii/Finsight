from sqlalchemy import String, Numeric, Integer, Boolean, DateTime, UUID, Enum as CategoryEnum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from decimal import Decimal
from app.models.category import Category
from app.database import Base
import uuid


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    period_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_payment: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[Category] = mapped_column(CategoryEnum(Category), nullable=False, default=Category.DEBT)
    payments_made: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_applied_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
