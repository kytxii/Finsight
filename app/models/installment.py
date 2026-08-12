from sqlalchemy import String, Numeric, Integer, Boolean, DateTime, UUID, Enum as CategoryEnum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from decimal import Decimal
from app.models.category import Category
from app.database import Base
import uuid


class Installment(Base):
    """A fixed-term payment obligation - anything from a student loan to a small
    purchase paid off over a few months. Kept as its own table rather than
    living purely in the transactions feed since it needs term/progress
    bookkeeping (period_months, payments_made) a plain transaction has no
    concept of - see day_of_month below for how the two stay in sync.

    period_months is genuinely optional: a user can log an installment before
    deciding how long they'll take to pay it off. monthly_payment is a computed
    snapshot (flat total_amount / period_months, refreshed at create/update time)
    and stays null until a period is set. category is always DEBT - installments
    are inherently money owed, paid off over time - and isn't user-editable;
    stored mainly for consistency with the rest of the app's category-tagged
    financial records rather than surfaced in the UI.

    day_of_month drives auto-posting once both it and a term are set: once the
    due day for the current month has passed, installment_service.apply_installments
    creates a linked Transaction (see Transaction.installment_id), same
    opportunistic on-access pattern as RecurringPayment's apply mechanism.
    payments_made / last_applied_month are that mechanism's bookkeeping -
    unlike a recurring payment (which repeats forever), auto-posting stops once
    payments_made reaches period_months, i.e. the installment is paid off."""

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
