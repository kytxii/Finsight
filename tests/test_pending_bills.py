import pytest
from datetime import date
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import RecurringPayment, Transaction
from app.models.category import Category
from app.services import transaction_service
from app.services.recurring_payment_service import InvalidRecurringPaymentError

# Same one-test_user-per-function convention as test_recurring_apply.py -
# /auth/register is rate-limited to 5/minute.


async def _make_bill(db: AsyncSession, user_id: UUID, *, day_of_month: int | None, is_estimate: bool, amount: str = "150.00", last_applied_month: str | None = None, active: bool = True) -> RecurringPayment:
    rp = RecurringPayment(
        name="APS",
        amount=Decimal(amount),
        day_of_month=day_of_month,
        category=Category.BILL,
        is_estimate=is_estimate,
        active=active,
        last_applied_month=last_applied_month,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(rp)
    await db.commit()
    await db.refresh(rp)
    return rp


async def _post_linked_transaction(db: AsyncSession, user_id: UUID, rp: RecurringPayment, transaction_date: date, amount: str) -> Transaction:
    txn = Transaction(
        created_by=user_id,
        updated_by=user_id,
        name=rp.name,
        amount=Decimal(amount),
        category=rp.category,
        transaction_date=transaction_date,
        recurring_payment_id=rp.id,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


@pytest.fixture(autouse=True)
async def cleanup(test_user: dict, db: AsyncSession):
    yield
    user_id = UUID(test_user["id"])
    await db.execute(delete(Transaction).where(Transaction.created_by == user_id, Transaction.recurring_payment_id.is_not(None)))
    await db.execute(delete(RecurringPayment).where(RecurringPayment.created_by == user_id))
    await db.commit()


async def test_variable_bill_with_due_date_does_not_auto_post(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)

    await transaction_service.apply_recurring_payments(user_id, db, today=date(2026, 6, 15))

    txn = await db.scalar(select(Transaction).where(Transaction.recurring_payment_id == rp.id))
    assert txn is None


async def test_upcoming_statuses(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)

    not_due_yet = await _make_bill(db, user_id, day_of_month=20, is_estimate=True)
    pending = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)
    skipped = await _make_bill(db, user_id, day_of_month=5, is_estimate=True, last_applied_month="2026-06")
    fixed_due_today = await _make_bill(db, user_id, day_of_month=15, is_estimate=False)

    items = {i.id: i for i in await transaction_service.get_upcoming_recurring_payments(user_id, db, today=today)}

    assert items[not_due_yet.id].status == "upcoming"
    assert items[pending.id].status == "pending"
    assert items[skipped.id].status == "skipped"
    # apply_recurring_payments runs first inside get_upcoming_recurring_payments,
    # so a fixed bill due today is already posted by the time status is read.
    assert items[fixed_due_today.id].status == "paid"
    assert items[fixed_due_today.id].actual_amount == Decimal("150.00")


async def test_estimated_amount_is_a_rolling_average_of_recent_linked_transactions(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)
    await _post_linked_transaction(db, user_id, rp, date(2026, 4, 10), "100.00")
    await _post_linked_transaction(db, user_id, rp, date(2026, 5, 10), "200.00")

    items = await transaction_service.get_upcoming_recurring_payments(user_id, db, today=date(2026, 6, 15))
    item = next(i for i in items if i.id == rp.id)

    assert item.status == "pending"
    assert item.estimated_amount == Decimal("150.00")


async def test_confirm_pending_bill_posts_actual_and_links(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)

    txn = await transaction_service.confirm_pending_bill(rp.id, Decimal("175.50"), user_id, db, today=today)

    assert txn.recurring_payment_id == rp.id
    assert txn.amount == Decimal("175.50")
    assert txn.transaction_date == date(2026, 6, 10)

    await db.refresh(rp)
    assert rp.last_applied_month == "2026-06"


async def test_skip_pending_bill_resolves_without_a_transaction(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)

    await transaction_service.skip_pending_bill(rp.id, user_id, db, today=today)

    await db.refresh(rp)
    assert rp.last_applied_month == "2026-06"
    txn = await db.scalar(select(Transaction).where(Transaction.recurring_payment_id == rp.id))
    assert txn is None

    items = await transaction_service.get_upcoming_recurring_payments(user_id, db, today=today)
    item = next(i for i in items if i.id == rp.id)
    assert item.status == "skipped"


async def test_cannot_resolve_the_same_bill_twice_in_one_month(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=True)

    await transaction_service.confirm_pending_bill(rp.id, Decimal("100.00"), user_id, db, today=today)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.confirm_pending_bill(rp.id, Decimal("100.00"), user_id, db, today=today)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.skip_pending_bill(rp.id, user_id, db, today=today)


async def test_cannot_confirm_or_skip_a_fixed_bill(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)
    rp = await _make_bill(db, user_id, day_of_month=10, is_estimate=False)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.confirm_pending_bill(rp.id, Decimal("100.00"), user_id, db, today=today)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.skip_pending_bill(rp.id, user_id, db, today=today)


async def test_cannot_confirm_or_skip_before_the_due_date(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    today = date(2026, 6, 15)
    rp = await _make_bill(db, user_id, day_of_month=20, is_estimate=True)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.confirm_pending_bill(rp.id, Decimal("100.00"), user_id, db, today=today)

    with pytest.raises(InvalidRecurringPaymentError):
        await transaction_service.skip_pending_bill(rp.id, user_id, db, today=today)
