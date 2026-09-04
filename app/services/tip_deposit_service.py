import calendar
from datetime import date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from decimal import Decimal
from typing import NamedTuple
from app.models import TipDeposit, Transaction
from app.models.category import Category
from app.schemas import CreateTipDeposit, UpdateTipDeposit


async def create_tip_deposit(data: CreateTipDeposit, current_user: UUID, db: AsyncSession) -> TipDeposit:
    deposit = TipDeposit(**data.model_dump(), created_by=current_user, updated_by=current_user)
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)
    return deposit


async def update_tip_deposit(deposit_id: UUID, data: UpdateTipDeposit, current_user: UUID, db: AsyncSession) -> TipDeposit:
    result = await db.execute(select(TipDeposit).where(TipDeposit.id == deposit_id))
    deposit = result.scalar_one_or_none()

    if deposit is None or deposit.created_by != current_user:
        raise ValueError("Tip deposit not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(deposit, key, value)
    deposit.updated_by = current_user

    await db.commit()
    await db.refresh(deposit)
    return deposit


async def get_tip_deposits(current_user: UUID, db: AsyncSession):
    result = await db.scalars(
        select(TipDeposit).where(TipDeposit.created_by == current_user).order_by(TipDeposit.deposit_date.desc())
    )
    return result.all()


async def delete_tip_deposit(deposit_id: UUID, current_user: UUID, db: AsyncSession) -> None:
    result = await db.execute(select(TipDeposit).where(TipDeposit.id == deposit_id))
    deposit = result.scalar_one_or_none()

    if deposit is None or deposit.created_by != current_user:
        raise ValueError("Tip deposit not found")

    await db.delete(deposit)
    await db.commit()


async def convert_transaction_to_tip_deposit(transaction_id: UUID, current_user: UUID, db: AsyncSession) -> TipDeposit:
    """#156: a quality-of-life correction for a misentered tip, not a persistent
    link - the amount/date carry over as-is and the transaction is gone once
    this returns. Deliberately no relationship is recorded between the two;
    tips and deposits don't need to reconcile 1:1 (#155)."""
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id))
    transaction = result.scalar_one_or_none()

    if transaction is None or transaction.created_by != current_user:
        raise ValueError("Transaction not found")
    if transaction.category != Category.TIPS:
        raise ValueError("Only a Tips transaction can be converted to a deposit")

    deposit = TipDeposit(
        amount=transaction.amount,
        deposit_date=transaction.transaction_date,
        created_by=current_user,
        updated_by=current_user,
    )
    await db.delete(transaction)
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)
    return deposit


async def convert_tip_deposit_to_transaction(deposit_id: UUID, current_user: UUID, db: AsyncSession) -> Transaction:
    """The reverse of convert_transaction_to_tip_deposit - see its docstring."""
    result = await db.execute(select(TipDeposit).where(TipDeposit.id == deposit_id))
    deposit = result.scalar_one_or_none()

    if deposit is None or deposit.created_by != current_user:
        raise ValueError("Tip deposit not found")

    transaction = Transaction(
        name="Cash",
        amount=deposit.amount,
        transaction_date=deposit.deposit_date,
        category=Category.TIPS,
        created_by=current_user,
        updated_by=current_user,
    )
    await db.delete(deposit)
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction


class CashOnHandResult(NamedTuple):
    cash_on_hand: Decimal
    tips_earned: Decimal
    tips_deposited: Decimal


async def get_cash_on_hand(
    current_user: UUID, db: AsyncSession, year: int | None = None, month: int | None = None
) -> CashOnHandResult:
    """Cash on hand = cash tips earned this month. Not tips_earned minus
    tips_deposited - a deposit isn't tied to the month the underlying tip was
    earned, so depositing a prior month's undeposited cash this month would
    subtract against *this* month's earned total and go negative. tips_earned
    and tips_deposited are independent this-month totals, shown side by side,
    not netted against each other.

    Scoped to a calendar month (default: the current one) rather than all-time
    - it's shown alongside other per-month Tips figures (this month's earned,
    this month's deposited), and an all-time running balance there reads as
    wrong even though the arithmetic isn't (#157).
    """
    today = date.today()
    year = year or today.year
    month = month or today.month
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    tips_earned = (await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.created_by == current_user,
            Transaction.category == Category.TIPS,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= month_end,
        )
    )) or Decimal("0")

    tips_deposited = (await db.scalar(
        select(func.coalesce(func.sum(TipDeposit.amount), 0)).where(
            TipDeposit.created_by == current_user,
            TipDeposit.deposit_date >= month_start,
            TipDeposit.deposit_date <= month_end,
        )
    )) or Decimal("0")

    return CashOnHandResult(
        cash_on_hand=Decimal(tips_earned),
        tips_earned=Decimal(tips_earned),
        tips_deposited=Decimal(tips_deposited),
    )
