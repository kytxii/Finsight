from datetime import date
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import NamedTuple
import calendar
from app.models import Transaction, RecurringPayment, Paycheck, Installment
from app.models.category import Category
from app.schemas import CreateTransaction, UpdateTransaction
from app.services import recurring_payment_service
from app.services.recurring_payment_service import InvalidRecurringPaymentError



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


async def _average_recent_amounts_by_recurring_payment(recurring_payment_ids: list[UUID], db: AsyncSession, limit: int = 3) -> dict[UUID, Decimal]:
    """Same batched shape as paycheck_service._average_recent_amounts_by_schedule -
    one query for every recurring payment's recent linked-transaction amounts
    instead of one query per row."""
    if not recurring_payment_ids:
        return {}

    rows = await db.execute(
        select(Transaction.recurring_payment_id, Transaction.amount)
        .where(Transaction.recurring_payment_id.in_(recurring_payment_ids))
        .order_by(Transaction.recurring_payment_id, Transaction.transaction_date.desc())
    )
    recent_by_rp: dict[UUID, list[Decimal]] = {}
    for rp_id, amount in rows:
        bucket = recent_by_rp.setdefault(rp_id, [])
        if len(bucket) < limit:
            bucket.append(amount)

    return {
        rp_id: sum(amounts, start=Decimal("0")) / Decimal(len(amounts))
        for rp_id, amounts in recent_by_rp.items()
    }


class UpcomingRecurringItem(NamedTuple):
    id: UUID
    name: str
    category: Category
    due_date: date
    status: str  # "paid" | "skipped" | "pending" | "upcoming"
    is_estimate: bool
    amount: Decimal
    actual_amount: Decimal | None
    estimated_amount: Decimal | None


async def get_upcoming_recurring_payments(user_id: UUID, db: AsyncSession, today: date | None = None) -> list[UpcomingRecurringItem]:
    """Every active, dated recurring payment's occurrence for the current month,
    with a derived status. Deliberately not filtered by category - same
    convention as get_transactions returning everything and letting the client
    filter per category page. The window never shrinks (whole month, not just
    what's left) so a resolved item stays visible instead of disappearing.
    """
    today = today or date.today()

    # Fixed bills whose due day has passed must already be posted before status
    # is derived below, or they'd wrongly read as "pending" instead of "paid".
    await apply_recurring_payments(user_id, db, today=today)

    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    month_start = today.replace(day=1)
    month_end = today.replace(day=last_day_of_month)
    current_month = today.strftime("%Y-%m")

    active = (await db.scalars(
        select(RecurringPayment)
        .where(RecurringPayment.created_by == user_id)
        .where(RecurringPayment.active.is_(True))
        .where(RecurringPayment.day_of_month.is_not(None))
        .where(RecurringPayment.category.not_in([Category.INCOME, Category.TIPS]))
    )).all()
    if not active:
        return []

    rp_ids = [rp.id for rp in active]

    # One query for this month's linked transactions instead of one per row.
    linked_rows = await db.execute(
        select(Transaction.recurring_payment_id, Transaction.amount).where(
            Transaction.recurring_payment_id.in_(rp_ids),
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= month_end,
        )
    )
    linked_amount_by_rp: dict[UUID, Decimal] = {rp_id: amount for rp_id, amount in linked_rows}

    pending_ids = [
        rp.id for rp in active
        if rp.id not in linked_amount_by_rp
        and rp.last_applied_month != current_month
        and min(rp.day_of_month, last_day_of_month) <= today.day
    ]
    estimates_by_rp = await _average_recent_amounts_by_recurring_payment(pending_ids, db)

    items: list[UpcomingRecurringItem] = []
    for rp in active:
        due_date = today.replace(day=min(rp.day_of_month, last_day_of_month))
        actual_amount = linked_amount_by_rp.get(rp.id)

        if actual_amount is not None:
            status = "paid"
        elif rp.last_applied_month == current_month:
            status = "skipped"
        elif due_date <= today:
            status = "pending"
        else:
            status = "upcoming"

        items.append(UpcomingRecurringItem(
            id=rp.id,
            name=rp.name,
            category=rp.category,
            due_date=due_date,
            status=status,
            is_estimate=rp.is_estimate,
            amount=rp.amount,
            actual_amount=actual_amount,
            estimated_amount=estimates_by_rp.get(rp.id) if status == "pending" else None,
        ))

    items.sort(key=lambda i: i.due_date)
    return items


async def _get_pending_recurring_payment(recurring_payment_id: UUID, current_user: UUID, db: AsyncSession, today: date) -> tuple[RecurringPayment, date]:
    """Shared ownership + eligibility check for confirm/skip. Returns the
    recurring payment and its clamped due date for this month, or raises."""
    rp = await recurring_payment_service.get_recurring_payment_by_id(recurring_payment_id, current_user, db)

    if not rp.active or not rp.is_estimate or rp.day_of_month is None:
        raise InvalidRecurringPaymentError("Recurring payment is not a pending bill")

    last_day_of_month = calendar.monthrange(today.year, today.month)[1]
    due_date = today.replace(day=min(rp.day_of_month, last_day_of_month))
    current_month = today.strftime("%Y-%m")

    if rp.last_applied_month == current_month:
        raise InvalidRecurringPaymentError("Already resolved for this month")
    if due_date > today:
        raise InvalidRecurringPaymentError("Not due yet")

    return rp, due_date


async def confirm_pending_bill(recurring_payment_id: UUID, amount: Decimal, current_user: UUID, db: AsyncSession, today: date | None = None) -> Transaction:
    today = today or date.today()
    rp, due_date = await _get_pending_recurring_payment(recurring_payment_id, current_user, db, today)

    transaction = Transaction(
        created_by=current_user,
        updated_by=current_user,
        name=rp.name,
        amount=amount,
        category=rp.category,
        transaction_date=due_date,
        recurring_payment_id=rp.id,
    )
    db.add(transaction)
    rp.last_applied_month = today.strftime("%Y-%m")
    rp.updated_by = current_user

    await db.commit()
    await db.refresh(transaction)
    return transaction


async def skip_pending_bill(recurring_payment_id: UUID, current_user: UUID, db: AsyncSession, today: date | None = None) -> None:
    today = today or date.today()
    rp, _ = await _get_pending_recurring_payment(recurring_payment_id, current_user, db, today)

    rp.last_applied_month = today.strftime("%Y-%m")
    rp.updated_by = current_user
    await db.commit()


async def apply_installments(user_id: UUID, db: AsyncSession, today: date | None = None) -> None:
    """Same opportunistic on-access pattern as apply_recurring_payments, with
    one difference: an installment has a finite term, not an indefinite
    repeat, so posting stops once payments_made reaches period_months (the
    installment is paid off) rather than continuing forever."""
    today = today or date.today()
    last_day_of_month = calendar.monthrange(today.year, today.month)[1]

    active = await db.scalars(
        select(Installment)
        .where(Installment.created_by == user_id)
        .where(Installment.active.is_(True))
        .where(Installment.day_of_month.is_not(None))
        .where(Installment.period_months.is_not(None))
    )

    current_month = today.strftime("%Y-%m")

    for inst in active.all():
        if inst.payments_made >= inst.period_months:
            continue  # paid off - stop auto-posting
        if inst.last_applied_month == current_month:
            continue

        day = min(inst.day_of_month, last_day_of_month)
        if day > today.day:
            continue

        db.add(Transaction(
            created_by=user_id,
            updated_by=user_id,
            name=inst.name,
            amount=inst.monthly_payment,
            category=inst.category,
            transaction_date=today.replace(day=day),
            installment_id=inst.id,
        ))
        inst.last_applied_month = current_month
        inst.payments_made += 1

    await db.commit()