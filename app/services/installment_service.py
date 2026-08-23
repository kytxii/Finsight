from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import NamedTuple
import calendar
from app.models import Installment, Transaction, User
from app.models.category import Category
from app.schemas import CreateInstallment, UpdateInstallment
from app.services import paycheck_service

# Gauge bands, keyed off monthly_payment / available_cash. This is a cash-flow
# impact measure, not an affordability judgement - it says how much of the
# user's currently-free cash a payment consumes, not whether they can afford
# it. Five tiers by impact: very low (<=10%, "dark_green"), low (10-15%,
# "green"), moderate (15-20%, "yellow"), high (20-25%, "orange"), very high
# (25%+, "red") - red covers everything past 25%, no further tier.
#
# The cutoffs are borrowed from the commonly cited car-payment guidance, which
# was calibrated against *income*. available_cash here is a residual instead
# (balance + income due through month end, minus committed bills and the
# user's reserve floor), so the mapping is a sensible starting point rather
# than a validated one - revisit if the tiers turn out mis-tuned in practice.
_DARK_GREEN_MAX_RATIO = Decimal("0.10")
_GREEN_MAX_RATIO = Decimal("0.15")
_YELLOW_MAX_RATIO = Decimal("0.20")
_ORANGE_MAX_RATIO = Decimal("0.25")

NO_TERM_REASON = "Set a term for this installment to see insights"


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_monthly_payment(total_amount: Decimal, period_months: int) -> Decimal:
    """Flat division - total_amount / period_months, rounded to the cent."""
    return _cents(total_amount / period_months)


def compute_gauge_status(monthly_payment: Decimal, available_cash: Decimal) -> tuple[str, Decimal | None]:
    if available_cash <= 0:
        # No headroom at all - the ratio itself is meaningless here (division by
        # a non-positive number), so it's left unset rather than computed.
        return "red", None

    ratio = monthly_payment / available_cash
    if ratio <= _DARK_GREEN_MAX_RATIO:
        status = "dark_green"
    elif ratio <= _GREEN_MAX_RATIO:
        status = "green"
    elif ratio <= _YELLOW_MAX_RATIO:
        status = "yellow"
    elif ratio <= _ORANGE_MAX_RATIO:
        status = "orange"
    else:
        status = "red"
    return status, ratio


async def get_installments(current_user: UUID, db: AsyncSession):
    result = await db.execute(select(Installment).where(
        Installment.created_by == current_user,
        Installment.active.is_(True),
    ))
    return result.scalars().all()


async def _get_owned_installment(installment_id: UUID, current_user: UUID, db: AsyncSession) -> Installment:
    result = await db.execute(select(Installment).where(Installment.id == installment_id))
    installment = result.scalar_one_or_none()

    if installment is None:
        raise ValueError("Installment not found")
    if installment.created_by != current_user:
        raise ValueError("Installment not found")

    return installment


async def get_installment_by_id(installment_id: UUID, current_user: UUID, db: AsyncSession):
    return await _get_owned_installment(installment_id, current_user, db)


async def create_installment(data: CreateInstallment, current_user: UUID, db: AsyncSession):
    monthly_payment = compute_monthly_payment(data.total_amount, data.period_months) if data.period_months else None
    new_installment = Installment(
        **data.model_dump(),
        monthly_payment=monthly_payment,
        category=Category.DEBT,  # always debt - not client-settable, see model docstring
        created_by=current_user,
        updated_by=current_user,
    )

    db.add(new_installment)
    await db.commit()
    await db.refresh(new_installment)
    return new_installment


async def update_installment(installment_id: UUID, data: UpdateInstallment, current_user: UUID, db: AsyncSession):
    installment = await _get_owned_installment(installment_id, current_user, db)

    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(installment, key, value)
    installment.updated_by = current_user

    # Recompute the stored snapshot whenever either input changed - null out
    # again if the term was cleared, since there's nothing to divide by.
    if changes.keys() & {"total_amount", "period_months"}:
        installment.monthly_payment = (
            compute_monthly_payment(installment.total_amount, installment.period_months)
            if installment.period_months else None
        )

    # If this month's payment was already auto-applied (see apply_installments
    # in transaction_service.py) but the edit means it's no longer actually due
    # this month - term/day cleared, or the new day hasn't arrived yet - un-apply
    # it: delete the linked transaction and roll back the bookkeeping so the
    # apply pass picks it back up whenever it's genuinely due. If it's still
    # due, mirror the name/amount change onto the linked transaction instead,
    # same as recurring payments do.
    today = date.today()
    if installment.last_applied_month == today.strftime("%Y-%m"):
        last_day_of_month = calendar.monthrange(today.year, today.month)[1]
        still_due = (
            installment.day_of_month is not None
            and installment.period_months is not None
            and min(installment.day_of_month, last_day_of_month) <= today.day
        )

        month_start = today.replace(day=1)
        month_end = today.replace(day=last_day_of_month)
        result = await db.execute(select(Transaction).where(
            Transaction.installment_id == installment_id,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= month_end,
        ))
        linked = result.scalar_one_or_none()

        if not still_due:
            if linked:
                await db.delete(linked)
            installment.last_applied_month = None
            installment.payments_made = max(0, installment.payments_made - 1)
        elif linked:
            if "name" in changes:
                linked.name = installment.name
            if changes.keys() & {"total_amount", "period_months"}:
                linked.amount = installment.monthly_payment

    await db.commit()
    await db.refresh(installment)
    return installment


async def delete_installment(installment_id: UUID, current_user: UUID, db: AsyncSession):
    installment = await _get_owned_installment(installment_id, current_user, db)

    # Soft-deactivate rather than hard delete, consistent with recurring payments.
    installment.active = False
    installment.updated_by = current_user
    await db.commit()


class InstallmentInsightsResult(NamedTuple):
    available: bool
    reason: str | None
    monthly_payment: Decimal | None
    available_cash: Decimal | None
    ratio: Decimal | None
    status: str | None


async def get_installment_insights(installment_id: UUID, current_user: User, db: AsyncSession) -> InstallmentInsightsResult:
    installment = await _get_owned_installment(installment_id, current_user.id, db)

    # No term set yet -> nothing to compare against the budget. Gate this
    # before touching paycheck_service at all, since there's no monthly_payment
    # to reason about regardless of how ready the budget data is.
    if installment.monthly_payment is None:
        return InstallmentInsightsResult(
            available=False,
            reason=NO_TERM_REASON,
            monthly_payment=None,
            available_cash=None,
            ratio=None,
            status=None,
        )

    # "Available cash" = what's actually free to spend right now, net of the
    # user's own floor/reserve - running balance + the next paycheck, minus
    # bills due before it, minus the reserve. Deliberately not the abstract
    # "average monthly savings" figure: this is about whether the cash to cover
    # the payment is actually sitting there today, not a longer-run projection.
    reserve = current_user.spending_reserve or Decimal("0")
    try:
        surplus = await paycheck_service.get_spendable_surplus(current_user.id, reserve, db)
    except ValueError as e:
        # Not enough budget data yet (no starting balance / no active paycheck
        # schedule) - a legitimate widget state, not an error.
        return InstallmentInsightsResult(
            available=False,
            reason=str(e),
            monthly_payment=installment.monthly_payment,
            available_cash=None,
            ratio=None,
            status=None,
        )

    status, ratio = compute_gauge_status(installment.monthly_payment, surplus.free_to_allocate)
    return InstallmentInsightsResult(
        available=True,
        reason=None,
        monthly_payment=installment.monthly_payment,
        available_cash=surplus.free_to_allocate,
        ratio=ratio,
        status=status,
    )
