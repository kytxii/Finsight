import pytest
from datetime import date
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import RecurringPayment, Transaction
from app.models.category import Category
from app.services import transaction_service

# One test_user per test function rather than per case - /auth/register is
# rate-limited to 5/minute, and a fresh registration per case would blow past
# that once this file has more than a handful of scenarios.


async def _make_recurring_payment(db: AsyncSession, user_id: UUID, day_of_month: int, last_applied_month: str | None = None) -> RecurringPayment:
    rp = RecurringPayment(
        name="Rent",
        amount=Decimal("1400.00"),
        day_of_month=day_of_month,
        category=Category.BILL,
        is_estimate=False,
        active=True,
        last_applied_month=last_applied_month,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(rp)
    await db.commit()
    await db.refresh(rp)
    return rp


async def _posted_transaction(db: AsyncSession, rp_id: UUID) -> Transaction | None:
    return await db.scalar(select(Transaction).where(Transaction.recurring_payment_id == rp_id))


@pytest.fixture(autouse=True)
async def cleanup(test_user: dict, db: AsyncSession):
    yield
    user_id = UUID(test_user["id"])
    await db.execute(delete(Transaction).where(Transaction.created_by == user_id, Transaction.recurring_payment_id.is_not(None)))
    await db.execute(delete(RecurringPayment).where(RecurringPayment.created_by == user_id))
    await db.commit()


async def test_day_of_month_clamps_to_the_last_real_day_of_the_month(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])

    cases = [
        # (day_of_month, today, expected posted date)
        (31, date(2026, 4, 30), date(2026, 4, 30)),  # 31st in a 30-day month
        (31, date(2026, 5, 31), date(2026, 5, 31)),  # 31st in a 31-day month
        (30, date(2026, 2, 28), date(2026, 2, 28)),  # 30th in February
        (30, date(2028, 2, 29), date(2028, 2, 29)),  # 30th in a leap-year February
    ]

    for day_of_month, today, expected in cases:
        rp = await _make_recurring_payment(db, user_id, day_of_month=day_of_month)

        await transaction_service.apply_recurring_payments(user_id, db, today=today)

        txn = await _posted_transaction(db, rp.id)
        assert txn is not None, f"day_of_month={day_of_month} on {today} should have posted"
        assert txn.transaction_date == expected


async def test_does_not_post_early_or_twice(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])

    # Not yet due: clamped day (30, in a 30-day month) is still ahead of today.
    not_due_yet = await _make_recurring_payment(db, user_id, day_of_month=31)
    await transaction_service.apply_recurring_payments(user_id, db, today=date(2026, 4, 15))
    assert await _posted_transaction(db, not_due_yet.id) is None

    # Already resolved this month: last_applied_month guard should hold even
    # though the clamped due day has passed.
    already_applied = await _make_recurring_payment(db, user_id, day_of_month=31, last_applied_month="2026-04")
    await transaction_service.apply_recurring_payments(user_id, db, today=date(2026, 4, 30))
    assert await _posted_transaction(db, already_applied.id) is None
