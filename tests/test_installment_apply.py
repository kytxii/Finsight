import pytest
from datetime import date
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Installment, Transaction
from app.schemas import UpdateInstallment
from app.services import transaction_service, installment_service

# One test_user per test function rather than per case, same reasoning as
# test_recurring_apply.py: /auth/register is rate-limited to 5/minute.


async def _make_installment(
    db: AsyncSession, user_id: UUID, *, total_amount=Decimal("1200.00"), period_months=12,
    day_of_month: int | None, payments_made: int = 0, last_applied_month: str | None = None,
) -> Installment:
    inst = Installment(
        name="Car Loan",
        total_amount=total_amount,
        period_months=period_months,
        monthly_payment=installment_service.compute_monthly_payment(total_amount, period_months) if period_months else None,
        day_of_month=day_of_month,
        payments_made=payments_made,
        last_applied_month=last_applied_month,
        active=True,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return inst


async def _posted_transaction(db: AsyncSession, installment_id: UUID) -> Transaction | None:
    return await db.scalar(select(Transaction).where(Transaction.installment_id == installment_id))


@pytest.fixture(autouse=True)
async def cleanup(test_user: dict, db: AsyncSession):
    yield
    user_id = UUID(test_user["id"])
    await db.execute(delete(Transaction).where(Transaction.created_by == user_id, Transaction.installment_id.is_not(None)))
    await db.execute(delete(Installment).where(Installment.created_by == user_id))
    await db.commit()


async def test_apply_posts_transaction_once_due_day_passed(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, day_of_month=10)

    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))

    txn = await _posted_transaction(db, inst.id)
    assert txn is not None
    assert txn.amount == Decimal("100.00")
    assert txn.category.value == "DEBT"
    assert txn.transaction_date == date(2026, 4, 10)

    await db.refresh(inst)
    assert inst.payments_made == 1
    assert inst.last_applied_month == "2026-04"


async def test_apply_skips_when_due_day_is_still_in_the_future(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, day_of_month=20)

    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))

    assert await _posted_transaction(db, inst.id) is None
    await db.refresh(inst)
    assert inst.payments_made == 0


async def test_apply_does_not_double_post_same_month(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, day_of_month=10, payments_made=1, last_applied_month="2026-04")

    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 20))

    assert await _posted_transaction(db, inst.id) is None
    await db.refresh(inst)
    assert inst.payments_made == 1


async def test_apply_stops_once_paid_off(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, period_months=12, day_of_month=10, payments_made=12)

    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))

    assert await _posted_transaction(db, inst.id) is None
    await db.refresh(inst)
    assert inst.payments_made == 12


async def test_apply_ignores_installments_missing_term_or_day(test_user: dict, db: AsyncSession):
    user_id = UUID(test_user["id"])
    no_day = await _make_installment(db, user_id, day_of_month=None)
    no_term = await _make_installment(db, user_id, period_months=None, day_of_month=10)

    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))

    assert await _posted_transaction(db, no_day.id) is None
    assert await _posted_transaction(db, no_term.id) is None


def _freeze_today(monkeypatch, fixed: date) -> None:
    """update_installment's still-due check reads date.today() directly (it
    has to know "today" independently of whatever date apply_installments was
    called with) - pin it to the same date the apply call above used, so the
    still-due/no-longer-due branch is deterministic instead of depending on
    whatever day this suite happens to run on."""
    class _Frozen(date):
        @classmethod
        def today(cls):
            return fixed
    monkeypatch.setattr(installment_service, "date", _Frozen)


async def test_edit_to_future_day_unapplies_this_months_payment(test_user: dict, db: AsyncSession, monkeypatch):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, day_of_month=10)
    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))
    assert await _posted_transaction(db, inst.id) is not None

    _freeze_today(monkeypatch, date(2026, 4, 15))
    updated = await installment_service.update_installment(inst.id, UpdateInstallment(day_of_month=20), user_id, db)

    assert updated.payments_made == 0
    assert updated.last_applied_month is None
    assert await _posted_transaction(db, inst.id) is None


async def test_edit_amount_while_still_due_mirrors_onto_linked_transaction(test_user: dict, db: AsyncSession, monkeypatch):
    user_id = UUID(test_user["id"])
    inst = await _make_installment(db, user_id, total_amount=Decimal("1200.00"), period_months=12, day_of_month=10)
    await transaction_service.apply_installments(user_id, db, today=date(2026, 4, 15))

    _freeze_today(monkeypatch, date(2026, 4, 15))
    updated = await installment_service.update_installment(
        inst.id, UpdateInstallment(total_amount=Decimal("2400.00")), user_id, db,
    )

    assert updated.monthly_payment == Decimal("200.00")
    assert updated.payments_made == 1  # still due this month - not un-applied

    txn = await _posted_transaction(db, inst.id)
    assert txn is not None
    assert txn.amount == Decimal("200.00")
