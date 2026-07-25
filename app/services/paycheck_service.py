from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterator, NamedTuple
import calendar
from app.models import Paycheck, PaycheckSchedule, RecurringPayment, Transaction, BalanceAnchor, User
from app.models.paycheck_schedule import PaycheckFrequency
from app.models.category import Category
from app.schemas import CreatePaycheckSchedule, UpdatePaycheckSchedule, UpdatePaycheckAmount, SetBalanceAnchor
from app.schemas.paycheck import SetSpendingReserve

# "Recurring expenses" for the spendable surplus calc - categories that represent
# money going out. INCOME, TIPS, and REIMBURSEMENT are inflows, not expenses.
EXPENSE_CATEGORIES = {Category.EXPENSE, Category.BILL, Category.SUBSCRIPTION, Category.SAVINGS, Category.DEBT}
INCOME_CATEGORIES = {Category.INCOME, Category.REIMBURSEMENT, Category.TIPS}

# Estimated-savings spend/obligation categories exclude SAVINGS: money moved into
# savings is saving, not spending, and is surfaced separately as "saved so far".
NON_SAVINGS_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES - {Category.SAVINGS}

# Full completed calendar months of spending history required before we'll project
# a savings estimate, and the window the discretionary-spend average covers.
SAVINGS_HISTORY_MONTHS = 3


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _next_occurrence(day_of_month: int, from_date: date) -> date:
    last_day = calendar.monthrange(from_date.year, from_date.month)[1]
    candidate = from_date.replace(day=min(day_of_month, last_day))
    if candidate >= from_date:
        return candidate

    next_month = _add_months(from_date.replace(day=1), 1)
    last_day = calendar.monthrange(next_month.year, next_month.month)[1]
    return next_month.replace(day=min(day_of_month, last_day))


def _iter_pay_dates(schedule: PaycheckSchedule) -> Iterator[date]:
    """Yield a schedule's pay dates in ascending order, indefinitely.

    SEMI_MONTHLY is modeled as two pay dates 15 days apart per month, anchored
    to start_date's day-of-month, rather than fixed calendar dates - the issue
    doesn't specify a convention, so this is a reasonable default.
    """
    start = schedule.start_date

    if schedule.frequency == PaycheckFrequency.WEEKLY:
        current = start
        while True:
            yield current
            current += timedelta(days=7)
    elif schedule.frequency == PaycheckFrequency.BIWEEKLY:
        current = start
        while True:
            yield current
            current += timedelta(days=14)
    elif schedule.frequency == PaycheckFrequency.MONTHLY:
        months = 0
        while True:
            yield _add_months(start, months)
            months += 1
    elif schedule.frequency == PaycheckFrequency.SEMI_MONTHLY:
        months = 0
        while True:
            anchor = _add_months(start, months)
            yield anchor
            yield anchor + timedelta(days=15)
            months += 1
    else:
        raise ValueError(f"Unsupported frequency: {schedule.frequency}")


def _next_month_start(today: date) -> date:
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)


class SpendableSurplusResult(NamedTuple):
    next_payday: date
    month_end: date
    spendable_surplus: Decimal
    free_to_allocate: Decimal
    bills_before_next_payday: Decimal
    next_payday_estimate: Decimal | None


def _generate_pay_dates_through(schedule: PaycheckSchedule, through: date) -> list[date]:
    dates = []
    for pay_date in _iter_pay_dates(schedule):
        dates.append(pay_date)
        if pay_date > through:
            break
    return dates


async def create_paycheck_schedule(data: CreatePaycheckSchedule, current_user: UUID, db: AsyncSession):
    schedule = PaycheckSchedule(**data.model_dump(), created_by=current_user, updated_by=current_user)

    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def get_paycheck_schedules(current_user: UUID, db: AsyncSession):
    result = await db.execute(select(PaycheckSchedule).where(
        PaycheckSchedule.created_by == current_user,
        PaycheckSchedule.active.is_(True),
    ))
    return result.scalars().all()


async def _get_owned_schedule(schedule_id: UUID, current_user: UUID, db: AsyncSession) -> PaycheckSchedule:
    result = await db.execute(select(PaycheckSchedule).where(PaycheckSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()

    if schedule is None:
        raise ValueError("Paycheck schedule not found")
    if schedule.created_by != current_user:
        raise ValueError("Paycheck schedule not found")

    return schedule


async def update_paycheck_schedule(schedule_id: UUID, data: UpdatePaycheckSchedule, current_user: UUID, db: AsyncSession):
    schedule = await _get_owned_schedule(schedule_id, current_user, db)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(schedule, key, value)
    schedule.updated_by = current_user

    # Unfilled paychecks were generated from the old frequency/start_date and
    # no longer match - drop them so the next read backfills fresh ones.
    # Paychecks with an amount already entered are real history and stay.
    await db.execute(delete(Paycheck).where(Paycheck.schedule_id == schedule_id, Paycheck.amount.is_(None)))

    await db.commit()
    await db.refresh(schedule)
    return schedule


async def delete_paycheck_schedule(schedule_id: UUID, current_user: UUID, db: AsyncSession) -> None:
    schedule = await _get_owned_schedule(schedule_id, current_user, db)

    # Soft-deactivate rather than hard delete - stops generating new paychecks,
    # but past paychecks and their linked income transactions stay untouched.
    schedule.active = False
    schedule.updated_by = current_user
    await db.commit()


async def _backfill_paychecks(schedules: list[PaycheckSchedule], current_user: UUID, db: AsyncSession, through: date | None = None) -> None:
    active = [s for s in schedules if s.active]
    if not active:
        return

    through = through or date.today()
    expected_by_schedule = {s.id: _generate_pay_dates_through(s, through) for s in active}

    # One query for every active schedule's existing dates instead of one per
    # schedule - this used to fan out with the number of schedules a user has.
    existing_rows = await db.execute(
        select(Paycheck.schedule_id, Paycheck.pay_date).where(
            Paycheck.schedule_id.in_([s.id for s in active])
        )
    )
    existing_by_schedule: dict[UUID, set[date]] = {}
    for schedule_id, pay_date in existing_rows:
        existing_by_schedule.setdefault(schedule_id, set()).add(pay_date)

    for schedule in active:
        existing_dates = existing_by_schedule.get(schedule.id, set())
        for pay_date in expected_by_schedule[schedule.id]:
            if pay_date not in existing_dates:
                db.add(Paycheck(
                    schedule_id=schedule.id,
                    pay_date=pay_date,
                    amount=None,
                    created_by=current_user,
                    updated_by=current_user,
                ))


async def _average_recent_amounts(schedule_id: UUID, db: AsyncSession, limit: int = 3) -> Decimal | None:
    amounts = (await db.scalars(
        select(Paycheck.amount)
        .where(Paycheck.schedule_id == schedule_id, Paycheck.amount.is_not(None))
        .order_by(Paycheck.pay_date.desc())
        .limit(limit)
    )).all()
    if not amounts:
        return None
    return sum(amounts, start=Decimal("0")) / Decimal(len(amounts))


async def _average_recent_amounts_by_schedule(schedule_ids: list[UUID], db: AsyncSession, limit: int = 3) -> dict[UUID, Decimal]:
    """Same result as calling _average_recent_amounts per schedule, in one query.

    Rows come back ordered by schedule_id then pay_date desc, so the first
    `limit` rows seen for each schedule_id are already its most recent - no
    window function needed at this data volume.
    """
    if not schedule_ids:
        return {}

    rows = await db.execute(
        select(Paycheck.schedule_id, Paycheck.amount)
        .where(Paycheck.schedule_id.in_(schedule_ids), Paycheck.amount.is_not(None))
        .order_by(Paycheck.schedule_id, Paycheck.pay_date.desc())
    )
    recent_by_schedule: dict[UUID, list[Decimal]] = {}
    for schedule_id, amount in rows:
        bucket = recent_by_schedule.setdefault(schedule_id, [])
        if len(bucket) < limit:
            bucket.append(amount)

    return {
        schedule_id: sum(amounts, start=Decimal("0")) / Decimal(len(amounts))
        for schedule_id, amounts in recent_by_schedule.items()
    }


async def get_paychecks(current_user: UUID, db: AsyncSession):
    # All schedules (active or not) so deactivated schedules' history still lists -
    # only active ones get new rows backfilled.
    schedules = (await db.scalars(select(PaycheckSchedule).where(PaycheckSchedule.created_by == current_user))).all()

    await _backfill_paychecks(schedules, current_user, db)
    await db.commit()

    schedule_ids = [schedule.id for schedule in schedules]
    schedule_names = {schedule.id: schedule.name for schedule in schedules}
    result = await db.scalars(
        select(Paycheck).where(Paycheck.schedule_id.in_(schedule_ids)).order_by(Paycheck.pay_date.desc())
    )
    paychecks = result.all()

    today = date.today()
    pending = [p for p in paychecks if p.pay_date <= today and p.amount is None]

    # Guessed amount for still-unfilled paychecks, based on recent entries for
    # that schedule - purely informational, never used in the spendable-surplus
    # math (which only counts money actually received). One batched query
    # instead of one per schedule that still needs a guess.
    unfilled_schedule_ids = list({p.schedule_id for p in paychecks if p.amount is None})
    estimates = await _average_recent_amounts_by_schedule(unfilled_schedule_ids, db)

    for p in paychecks:
        p.schedule_name = schedule_names.get(p.schedule_id)
        p.estimated_amount = estimates.get(p.schedule_id) if p.amount is None else None

    return paychecks, pending


async def update_paycheck_amount(paycheck_id: UUID, data: UpdatePaycheckAmount, current_user: UUID, db: AsyncSession):
    result = await db.execute(select(Paycheck).where(Paycheck.id == paycheck_id))
    paycheck = result.scalar_one_or_none()

    if paycheck is None:
        raise ValueError("Paycheck not found")
    if paycheck.created_by != current_user:
        raise ValueError("Paycheck not found")

    paycheck.amount = data.amount
    paycheck.updated_by = current_user

    result = await db.execute(select(Transaction).where(Transaction.paycheck_id == paycheck_id))
    linked = result.scalar_one_or_none()
    if linked:
        linked.amount = data.amount
        linked.transaction_date = paycheck.pay_date
        linked.updated_by = current_user
    else:
        db.add(Transaction(
            name="Paycheck",
            amount=data.amount,
            transaction_date=paycheck.pay_date,
            category=Category.INCOME,
            paycheck_id=paycheck.id,
            created_by=current_user,
            updated_by=current_user,
        ))

    await db.commit()
    await db.refresh(paycheck)
    return paycheck


async def get_balance_anchor(current_user: UUID, db: AsyncSession) -> BalanceAnchor | None:
    return await db.scalar(select(BalanceAnchor).where(BalanceAnchor.created_by == current_user))


async def set_balance_anchor(data: SetBalanceAnchor, current_user: UUID, db: AsyncSession) -> BalanceAnchor:
    anchor = await get_balance_anchor(current_user, db)

    if anchor is None:
        anchor = BalanceAnchor(**data.model_dump(), created_by=current_user, updated_by=current_user)
        db.add(anchor)
    else:
        anchor.current_balance = data.current_balance
        anchor.as_of_date = data.as_of_date
        anchor.updated_by = current_user

    await db.commit()
    await db.refresh(anchor)
    return anchor


async def _get_running_balance(current_user: UUID, db: AsyncSession) -> Decimal | None:
    anchor = await get_balance_anchor(current_user, db)
    if anchor is None:
        return None

    # Bounded to today - an already-entered future-dated paycheck transaction
    # must not inflate the *current* running balance. Future income is instead
    # surfaced explicitly via the projected-income sum in get_spendable_surplus.
    transactions = (await db.scalars(select(Transaction).where(
        Transaction.created_by == current_user,
        Transaction.transaction_date >= anchor.as_of_date,
        Transaction.transaction_date <= date.today(),
    ))).all()

    net = sum(
        (t.amount if t.category in INCOME_CATEGORIES else -t.amount for t in transactions),
        start=Decimal("0"),
    )
    return anchor.current_balance + net


class RunningBalanceResult(NamedTuple):
    balance: Decimal
    as_of_date: date


async def get_running_balance(current_user: UUID, db: AsyncSession) -> RunningBalanceResult:
    anchor = await get_balance_anchor(current_user, db)
    if anchor is None:
        raise ValueError("No starting balance set")

    balance = await _get_running_balance(current_user, db)
    return RunningBalanceResult(balance=balance, as_of_date=anchor.as_of_date)


def _committed_before(recurring_payments: list[RecurringPayment], today: date, horizon: date) -> Decimal:
    total = Decimal("0")
    for rp in recurring_payments:
        if rp.day_of_month is None:
            # Estimate with no fixed due date - count it in full. Conservative:
            # under-reporting surplus is safer than over-reporting it.
            total += rp.amount
        elif _next_occurrence(rp.day_of_month, today) <= horizon:
            total += rp.amount
    return total


async def _projected_income_before(schedules: list[PaycheckSchedule], today: date, month_end: date, current_user: UUID, db: AsyncSession) -> Decimal:
    """Sum every future paycheck landing before month_end, across all active schedules.

    Actual amount if already entered, else that schedule's average estimate.
    Paychecks with pay_date <= today are excluded - they're either already
    reflected in the running balance (amount entered -> linked Transaction) or
    still pending entry, not a projection.
    """
    schedule_ids = [s.id for s in schedules]
    if not schedule_ids:
        return Decimal("0")

    # Backfilling through month_end (rather than just today) guarantees a row
    # exists for every payday in the window we're about to sum, including ones
    # further out than the immediate next check (e.g. two biweekly paydays
    # landing in the same month).
    await _backfill_paychecks(schedules, current_user, db, through=month_end)
    await db.commit()

    future_paychecks = (await db.scalars(
        select(Paycheck).where(
            Paycheck.schedule_id.in_(schedule_ids),
            Paycheck.pay_date > today,
            Paycheck.pay_date < month_end,
        )
    )).all()

    estimates_by_schedule = await _average_recent_amounts_by_schedule(schedule_ids, db)

    return sum(
        (p.amount if p.amount is not None else estimates_by_schedule.get(p.schedule_id) or Decimal("0") for p in future_paychecks),
        start=Decimal("0"),
    )


async def get_spendable_surplus(current_user: UUID, spending_reserve: Decimal, db: AsyncSession) -> SpendableSurplusResult:
    today = date.today()

    running_balance = await _get_running_balance(current_user, db)
    if running_balance is None:
        raise ValueError("No starting balance set")

    schedules = (await db.scalars(select(PaycheckSchedule).where(
        PaycheckSchedule.created_by == current_user,
        PaycheckSchedule.active.is_(True),
    ))).all()
    if not schedules:
        raise ValueError("No active paycheck schedule found")

    next_payday, next_schedule = min(
        ((next(pay_date for pay_date in _iter_pay_dates(schedule) if pay_date >= today), schedule) for schedule in schedules),
        key=lambda pair: pair[0],
    )
    next_payday_estimate = await _average_recent_amounts(next_schedule.id, db)
    month_end = _next_month_start(today)

    recurring_payments = (await db.scalars(
        select(RecurringPayment).where(
            RecurringPayment.created_by == current_user,
            RecurringPayment.active.is_(True),
            RecurringPayment.category.in_(EXPENSE_CATEGORIES),
        )
    )).all()

    # Primary number: what's actually free to spend/save before bills reset at
    # the start of next month. Secondary: how much of that is already spoken
    # for before the next paycheck lands, shown separately for context.
    bills_before_month_end = _committed_before(recurring_payments, today, month_end)
    bills_before_next_payday = _committed_before(recurring_payments, today, next_payday)

    projected_income = await _projected_income_before(schedules, today, month_end, current_user, db)

    spendable_surplus = running_balance + projected_income - bills_before_month_end
    free_to_allocate = spendable_surplus - spending_reserve

    return SpendableSurplusResult(
        next_payday=next_payday,
        month_end=month_end,
        spendable_surplus=spendable_surplus,
        free_to_allocate=free_to_allocate,
        bills_before_next_payday=bills_before_next_payday,
        next_payday_estimate=next_payday_estimate,
    )


async def get_spending_reserve(current_user: User) -> Decimal:
    return current_user.spending_reserve or Decimal("0")


async def set_spending_reserve(data: SetSpendingReserve, current_user: User, db: AsyncSession) -> Decimal:
    current_user.spending_reserve = data.spending_reserve
    await db.commit()
    await db.refresh(current_user)
    return current_user.spending_reserve


class EstimatedSavingsResult(NamedTuple):
    month_start: date
    month_end: date
    estimated_savings: Decimal
    saved_so_far: Decimal
    projected_income: Decimal
    projected_spending: Decimal
    committed_recurring: Decimal


async def _full_month_income(schedules: list[PaycheckSchedule], month_start: date, month_end: date, current_user: UUID, db: AsyncSession) -> Decimal:
    """Sum every paycheck landing in [month_start, month_end), across all active schedules.

    Unlike _projected_income_before this counts the whole calendar month (received
    + upcoming), not just future paydays - the savings estimate is a stable
    "this month" figure that shouldn't shrink as paydays pass. Actual amount if
    entered, else that schedule's recent average.
    """
    schedule_ids = [s.id for s in schedules]
    if not schedule_ids:
        return Decimal("0")

    await _backfill_paychecks(schedules, current_user, db, through=month_end)
    await db.commit()

    paychecks = (await db.scalars(
        select(Paycheck).where(
            Paycheck.schedule_id.in_(schedule_ids),
            Paycheck.pay_date >= month_start,
            Paycheck.pay_date < month_end,
        )
    )).all()

    estimates_by_schedule = await _average_recent_amounts_by_schedule(schedule_ids, db)

    return sum(
        (p.amount if p.amount is not None else estimates_by_schedule.get(p.schedule_id) or Decimal("0") for p in paychecks),
        start=Decimal("0"),
    )


async def get_estimated_savings(current_user: UUID, db: AsyncSession) -> EstimatedSavingsResult:
    """How much can realistically be saved this month: full-month income minus
    average discretionary spend minus this month's fixed obligations.

    Deliberately independent of the balance anchor - it's a flow calc, so it works
    for users who never set a starting balance. Two prerequisite gates raise
    ValueError: no active schedule, or fewer than SAVINGS_HISTORY_MONTHS completed
    months of discretionary spending to average.
    """
    today = date.today()
    month_start = today.replace(day=1)
    month_end = _next_month_start(today)

    schedules = (await db.scalars(select(PaycheckSchedule).where(
        PaycheckSchedule.created_by == current_user,
        PaycheckSchedule.active.is_(True),
    ))).all()
    if not schedules:
        raise ValueError("No active paycheck schedule found")

    # Without a known income figure the estimate is meaningless, so a schedule
    # whose checks have no amounts entered (and no history to average from) is
    # treated as not-ready rather than projecting $0.
    projected_income = await _full_month_income(schedules, month_start, month_end, current_user, db)
    if projected_income <= 0:
        raise ValueError("No paycheck amounts yet")

    # Discretionary spend average over the completed months before this one.
    # SAVINGS excluded (it's saving, surfaced separately) and recurring-linked
    # transactions excluded (fixed bills are added back as committed_recurring,
    # so counting them here too would double-count).
    history_start = _add_months(month_start, -SAVINGS_HISTORY_MONTHS)
    spend_rows = (await db.execute(
        select(Transaction.transaction_date, Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category.in_(NON_SAVINGS_EXPENSE_CATEGORIES),
            Transaction.recurring_payment_id.is_(None),
            Transaction.transaction_date >= history_start,
            Transaction.transaction_date < month_start,
        )
    )).all()

    totals_by_month: dict[str, Decimal] = {}
    for txn_date, amount in spend_rows:
        key = txn_date.strftime("%Y-%m")
        totals_by_month[key] = totals_by_month.get(key, Decimal("0")) + amount

    expected_months = {_add_months(month_start, -n).strftime("%Y-%m") for n in range(1, SAVINGS_HISTORY_MONTHS + 1)}
    if not expected_months.issubset(totals_by_month.keys()):
        raise ValueError("Not enough spending history")

    projected_spending = _cents(sum(totals_by_month.values(), start=Decimal("0")) / Decimal(SAVINGS_HISTORY_MONTHS))

    # Fixed obligations for the month. is_estimate recurring (e.g. a grocery
    # forecast) are excluded: they never hit the ledger, so the spend they model
    # is already captured in the discretionary average above.
    recurring = (await db.scalars(
        select(RecurringPayment).where(
            RecurringPayment.created_by == current_user,
            RecurringPayment.active.is_(True),
            RecurringPayment.is_estimate.is_(False),
            RecurringPayment.category.in_(NON_SAVINGS_EXPENSE_CATEGORIES),
        )
    )).all()
    committed_recurring = sum((rp.amount for rp in recurring), start=Decimal("0"))

    saved_rows = (await db.scalars(
        select(Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category == Category.SAVINGS,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date < month_end,
        )
    )).all()
    saved_so_far = sum(saved_rows, start=Decimal("0"))

    raw = projected_income - projected_spending - committed_recurring
    estimated_savings = _cents(raw) if raw > 0 else Decimal("0.00")

    return EstimatedSavingsResult(
        month_start=month_start,
        month_end=month_end,
        estimated_savings=estimated_savings,
        saved_so_far=saved_so_far,
        projected_income=projected_income,
        projected_spending=projected_spending,
        committed_recurring=committed_recurring,
    )
