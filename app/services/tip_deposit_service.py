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


class CashOnHandResult(NamedTuple):
    cash_on_hand: Decimal
    tips_earned: Decimal
    tips_deposited: Decimal


async def get_cash_on_hand(current_user: UUID, db: AsyncSession) -> CashOnHandResult:
    """Undeposited cash = every tip earned minus every cash deposit (all-time)."""
    tips_earned = (await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.created_by == current_user,
            Transaction.category == Category.TIPS,
        )
    )) or Decimal("0")

    tips_deposited = (await db.scalar(
        select(func.coalesce(func.sum(TipDeposit.amount), 0)).where(
            TipDeposit.created_by == current_user,
        )
    )) or Decimal("0")

    return CashOnHandResult(
        cash_on_hand=Decimal(tips_earned) - Decimal(tips_deposited),
        tips_earned=Decimal(tips_earned),
        tips_deposited=Decimal(tips_deposited),
    )
