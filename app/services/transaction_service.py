from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
import calendar
from app.models import Transaction, RecurringPayment, Paycheck
from app.schemas import CreateTransaction, UpdateTransaction



async def get_transactions(current_user: UUID, db: AsyncSession):
    result = await db.execute(select(Transaction).where(Transaction.created_by == current_user))
    return result.scalars().all()

async def get_transaction_by_id(transaction_id: UUID, current_user: UUID,db: AsyncSession):
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id))
    transaction = result.scalar_one_or_none()

    if transaction is None:
        raise ValueError("Transaction not found")
    if transaction.created_by != current_user:
        raise ValueError("Transaction not found")

    return transaction

async def create_transaction(transaction: CreateTransaction, current_user: UUID, db: AsyncSession):
    data = transaction.model_dump()
    new_transaction = Transaction(**data, created_by=current_user, updated_by=current_user)

    db.add(new_transaction)
    await db.commit()
    await db.refresh(new_transaction)
    return new_transaction

async def update_transaction(transaction_id: UUID, data: UpdateTransaction, current_user: UUID, db: AsyncSession):
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id))
    transaction = result.scalar_one_or_none()

    if transaction is None:
        raise ValueError("Transaction not found")
    if transaction.created_by != current_user:
        raise ValueError("Transaction not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(transaction, key, value)
    transaction.updated_by = current_user

    await db.commit()
    await db.refresh(transaction)
    return transaction
    

async def delete_transaction(transaction_id: UUID, current_user: UUID, db: AsyncSession):
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id))
    transaction = result.scalar_one_or_none()

    if transaction is None:
        raise ValueError("Transaction not found")
    if transaction.created_by != current_user:
        raise ValueError("Transaction not found")

    if transaction.paycheck_id is not None:
        paycheck_result = await db.execute(select(Paycheck).where(Paycheck.id == transaction.paycheck_id))
        paycheck = paycheck_result.scalar_one_or_none()
        if paycheck is not None:
            paycheck.amount = None
            paycheck.updated_by = current_user

    await db.delete(transaction)
    await db.commit()

async def apply_recurring_payments(user_id: UUID, db: AsyncSession, today: date | None = None) -> None:
    today = today or date.today()
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]

    # day_of_month is filtered here in Python rather than in the query: a bill due
    # the 31st still needs to fire in a 30-day month, clamped to that month's last
    # day, so the raw column value can't be compared against today.day directly.
    active = await db.scalars(
        select(RecurringPayment)
        .where(RecurringPayment.created_by == user_id)
        .where(RecurringPayment.active.is_(True))
        .where(RecurringPayment.day_of_month.is_not(None))
    )

    current_month = today.strftime("%Y-%m")

    for rp in active.all():
        if rp.is_estimate:
            continue  # estimates inform surplus math only - never generate ledger transactions
        if rp.last_applied_month == current_month:
            continue

        day = min(rp.day_of_month, last_day_of_month)
        if day > today.day:
            continue

        db.add(Transaction(
            created_by=user_id,
            updated_by=user_id,
            name=rp.name,
            amount=rp.amount,
            category=rp.category,
            transaction_date=today.replace(day=day),
            recurring_payment_id=rp.id,
        ))
        rp.last_applied_month = current_month

    await db.commit()