from sqlalchemy import String, Numeric, Date, DateTime, Enum as CategoryEnum, UUID, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date, timezone
from decimal import Decimal
from app.models.category import Category
from app.database import Base
import uuid

class Transaction(Base):
    __tablename__ =  "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[Category] = mapped_column(CategoryEnum(Category), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    recurring_payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recurring_payments.id", ondelete="SET NULL"), nullable=True)
    paycheck_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("paychecks.id", ondelete="SET NULL"), nullable=True)
    installment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("installments.id", ondelete="SET NULL"), nullable=True)