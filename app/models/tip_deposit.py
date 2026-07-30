from sqlalchemy import Numeric, Date, DateTime, UUID
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date, timezone
from decimal import Decimal
from app.database import Base
import uuid


class TipDeposit(Base):
    """A lump-sum cash deposit into checking. Deposits are their own log, not
    tied to individual tip entries - real deposits rarely match a single tip.
    Cash on hand = total tips earned - total deposited; each deposit credits the
    checking running balance as a transfer (not new income)."""

    __tablename__ = "tip_deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    deposit_date: Mapped[date] = mapped_column(Date, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
