from sqlalchemy import select, delete, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterator, NamedTuple
import calendar
from app.models import Paycheck, PaycheckSchedule, RecurringPayment, Transaction, BalanceAnchor, User, TipDeposit
from app.models.paycheck_schedule import PaycheckFrequency
from app.models.category import Category
from app.schemas import CreatePaycheckSchedule, UpdatePaycheckSchedule, UpdatePaycheckAmount, SetBalanceAnchor
from app.schemas.paycheck import SetSpendingReserve

# "Recurring expenses" for the spendable surplus calc - categories that represent
# money going out. INCOME, TIPS, and REIMBURSEMENT are inflows, not expenses.
EXPENSE_CATEGORIES = {Category.EXPENSE, Category.BILL, Category.SUBSCRIPTION, Category.SAVINGS, Category.DEBT}
INCOME_CATEGORIES = {Category.INCOME, Category.REIMBURSEMENT, Category.TIPS}

# Categories that count as money actually arriving. Narrower than
# INCOME_CATEGORIES, which is a sign/direction test (is this row a "+"?) and so
# includes TIPS. A cash tip is tracked, not banked - it becomes income only when
# it lands in checking as a TipDeposit, the same rule _balance_delta already
# applies to the running balance. (#131)
MONEY_IN_CATEGORIES = {Category.INCOME, Category.REIMBURSEMENT}

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


class BillItem(NamedTuple):
    name: str
    amount: Decimal
    day_of_month: int | None
    due_date: date | None  # None for no-fixed-date estimates
    category: Category


class SpendableSurplusResult(NamedTuple):
    next_payday: date
    spendable_surplus: Decimal
    free_to_allocate: Decimal
    bills_before_next_payday: Decimal
    next_payday_estimate: Decimal | None
    # Decomposition, surfaced so the client can explain the headline number.
    running_balance: Decimal
    bills_breakdown: list[BillItem]  # the bills making up bills_before_next_payday


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

    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(schedule, key, value)
    schedule.updated_by = current_user

    # Unfilled paychecks were generated from the old frequency/start_date and
    # no longer match - drop them so the next read backfills fresh ones.
    # Paychecks with an amount already entered are real history and stay.
    await db.execute(delete(Paycheck).where(Paycheck.schedule_id == schedule_id, Paycheck.amount.is_(None)))

    # A rename has to reach transactions already posted under this schedule
    # (#97). They're named from the schedule at the moment their paycheck gets
    # an amount, so without this they'd keep the old name forever - the
    # Paychecks list would show the new name while Activity and the Income
    # category page still showed the old one. Same idea as
    # recurring_payment_service.update_recurring_payment mirroring a rename
    # onto its linked transaction, just across every paycheck in the schedule
    # instead of a single current-month row.
    if "name" in changes:
        await db.execute(
            update(Transaction)
            .where(Transaction.paycheck_id.in_(
                select(Paycheck.id).where(Paycheck.schedule_id == schedule_id)
            ))
            .values(name=changes["name"], updated_by=current_user)
            .execution_options(synchronize_session=False)
        )

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

    rows = [
        {"schedule_id": schedule.id, "pay_date": pay_date, "amount": None, "created_by": current_user, "updated_by": current_user}
        for schedule in active
        for pay_date in expected_by_schedule[schedule.id]
        if pay_date not in existing_by_schedule.get(schedule.id, set())
    ]
    if not rows:
        return

    # The existing_dates check above is only an optimization to skip re-sending
    # rows we already know about - it's not itself race-safe (two concurrent
    # calls can both see a date as missing and both try to insert it). The
    # uq_paychecks_schedule_id_pay_date constraint plus ON CONFLICT DO NOTHING
    # is what actually prevents the duplicate, whichever request loses the race.
    await db.execute(
        pg_insert(Paycheck).on_conflict_do_nothing(index_elements=["schedule_id", "pay_date"]),
        rows,
    )


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
        # Name the transaction after its schedule rather than a literal
        # "Paycheck" (#97). Deliberately only on creation - an existing row's
        # name is left alone here so an amount edit can't clobber a rename the
        # user made by hand. Schedule renames propagate separately, in
        # update_paycheck_schedule.
        schedule_name = await db.scalar(
            select(PaycheckSchedule.name).where(PaycheckSchedule.id == paycheck.schedule_id)
        )
        db.add(Transaction(
            name=schedule_name or "Paycheck",
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


def _balance_delta(t: Transaction) -> Decimal:
    """Signed contribution of a transaction to the checking running balance.

    Tips are cash on hand, not money in checking, so they never count here -
    cash reaches checking only via a TipDeposit. Other income adds, expenses
    subtract.

    A settled CreditCardCharge (t.credit_card_charge_id set) is also 0: it's a
    re-categorized breakdown of money that already left checking once, via its
    CreditCardPayment's own anchor transaction. Counting it again here would
    double the cash impact of a single real payment (#54).
    """
    if t.category == Category.TIPS or t.credit_card_charge_id is not None:
        return Decimal("0")
    return t.amount if t.category in INCOME_CATEGORIES else -t.amount


async def _get_running_balance(current_user: UUID, db: AsyncSession) -> Decimal | None:
    anchor = await get_balance_anchor(current_user, db)
    if anchor is None:
        return None

    # Strictly after as_of_date - current_balance is treated as already
    # inclusive of that day's activity (it's the real balance the user read
    # off their bank), so replaying same-day transactions on top would
    # double-count them. Bounded to today - an already-entered future-dated
    # paycheck transaction must not inflate the *current* running balance.
    # Future income is instead surfaced explicitly via the projected-income
    # sum in get_spendable_surplus.
    transactions = (await db.scalars(select(Transaction).where(
        Transaction.created_by == current_user,
        Transaction.transaction_date > anchor.as_of_date,
        Transaction.transaction_date <= date.today(),
    ))).all()
    net = sum((_balance_delta(t) for t in transactions), start=Decimal("0"))

    # Cash deposits credit checking as transfers-in, over the same window.
    deposits = (await db.scalars(select(TipDeposit).where(
        TipDeposit.created_by == current_user,
        TipDeposit.deposit_date > anchor.as_of_date,
        TipDeposit.deposit_date <= date.today(),
    ))).all()
    deposit_total = sum((d.amount for d in deposits), start=Decimal("0"))

    return anchor.current_balance + net + deposit_total


class RunningBalanceResult(NamedTuple):
    balance: Decimal
    as_of_date: date


async def get_running_balance(current_user: UUID, db: AsyncSession) -> RunningBalanceResult:
    anchor = await get_balance_anchor(current_user, db)
    if anchor is None:
        raise ValueError("No starting balance set")

    balance = await _get_running_balance(current_user, db)
    return RunningBalanceResult(balance=balance, as_of_date=anchor.as_of_date)


def _committed_items(recurring_payments: list[RecurringPayment], today: date, horizon: date) -> tuple[Decimal, list[BillItem]]:
    """Bills committed before `horizon`, as (total, itemized list).

    Fixed-date bills count when their next occurrence is on/before horizon;
    estimates with no fixed due date count in full (due_date None). Conservative:
    under-reporting surplus is safer than over-reporting it. Items are sorted by
    due date, with no-fixed-date estimates last.
    """
    total = Decimal("0")
    items: list[BillItem] = []
    for rp in recurring_payments:
        if rp.day_of_month is None:
            total += rp.amount
            items.append(BillItem(rp.name, rp.amount, None, None, rp.category))
        else:
            occurrence = _next_occurrence(rp.day_of_month, today)
            if occurrence <= horizon:
                total += rp.amount
                items.append(BillItem(rp.name, rp.amount, rp.day_of_month, occurrence, rp.category))
    items.sort(key=lambda b: (b.due_date is None, b.due_date or date.max))
    return total, items


async def _next_payday_amount(next_schedule: PaycheckSchedule, next_payday: date, current_user: UUID, db: AsyncSession) -> Decimal | None:
    """Amount to project for the very next paycheck.

    Prefers the actual amount already entered for that specific pay date -
    consistent with how a landed paycheck stops being a projection everywhere
    else in this file - and falls back to the schedule's recent average only
    when nothing's been entered yet. Backfills through next_payday first so a
    row exists to check (it may not otherwise, since nothing else guarantees
    one this far out).
    """
    await _backfill_paychecks([next_schedule], current_user, db, through=next_payday)
    await db.commit()

    paycheck = await db.scalar(
        select(Paycheck).where(
            Paycheck.schedule_id == next_schedule.id,
            Paycheck.pay_date == next_payday,
        )
    )
    if paycheck is not None and paycheck.amount is not None:
        return paycheck.amount

    return await _average_recent_amounts(next_schedule.id, db)


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
    next_payday_estimate = await _next_payday_amount(next_schedule, next_payday, current_user, db)

    recurring_payments = (await db.scalars(
        select(RecurringPayment).where(
            RecurringPayment.created_by == current_user,
            RecurringPayment.active.is_(True),
            RecurringPayment.category.in_(EXPENSE_CATEGORIES),
        )
    )).all()

    # What's actually free to spend/save before the next paycheck lands - not
    # the whole month, so this stays "live" instead of counting paychecks that
    # haven't arrived yet. Self-corrects as paydays pass: next_payday rolls
    # forward on its own once the current one is reflected in running_balance.
    bills_before_next_payday, bills_breakdown = _committed_items(recurring_payments, today, next_payday)

    spendable_surplus = running_balance + (next_payday_estimate or Decimal("0")) - bills_before_next_payday
    free_to_allocate = spendable_surplus - spending_reserve

    return SpendableSurplusResult(
        next_payday=next_payday,
        spendable_surplus=spendable_surplus,
        free_to_allocate=free_to_allocate,
        bills_before_next_payday=bills_before_next_payday,
        next_payday_estimate=next_payday_estimate,
        running_balance=running_balance,
        bills_breakdown=bills_breakdown,
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
    whole_month_income: Decimal
    committed_recurring: Decimal
    discretionary_spent_so_far: Decimal
    discretionary_projected_remaining: Decimal


async def _whole_month_income(schedules: list[PaycheckSchedule], month_start: date, month_end: date, current_user: UUID, db: AsyncSession) -> Decimal:
    """Every dollar of income for [month_start, month_end): real INCOME and
    REIMBURSEMENT transactions already logged (paycheck-linked or not - a manual
    entry like a freelance gig counts the same as a formal paycheck), cash
    banked as TipDeposits, plus a projected amount for each active schedule's
    still-unfilled paycheck this month.

    Cash tips are deliberately absent. A TIPS transaction records cash in hand,
    which changes nothing until it's deposited - so the deposit is the income
    event, not the tip. Same rule _balance_delta applies to checking. (#131)

    Not a double count: a filled paycheck's amount already exists as a linked
    INCOME transaction (see update_paycheck_amount), so it's covered by the
    actual-transactions sum below. Only unfilled paychecks - which have no
    transaction yet - need the schedule's recent-average estimate added on top.
    """
    actual_income = sum((
        await db.scalars(select(Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category.in_(MONEY_IN_CATEGORIES),
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date < month_end,
        ))
    ).all(), start=Decimal("0"))

    actual_income += sum((
        await db.scalars(select(TipDeposit.amount).where(
            TipDeposit.created_by == current_user,
            TipDeposit.deposit_date >= month_start,
            TipDeposit.deposit_date < month_end,
        ))
    ).all(), start=Decimal("0"))

    schedule_ids = [s.id for s in schedules]
    if not schedule_ids:
        return actual_income

    await _backfill_paychecks(schedules, current_user, db, through=month_end)
    await db.commit()

    unfilled_paychecks = (await db.scalars(
        select(Paycheck).where(
            Paycheck.schedule_id.in_(schedule_ids),
            Paycheck.pay_date >= month_start,
            Paycheck.pay_date < month_end,
            Paycheck.amount.is_(None),
        )
    )).all()

    estimates_by_schedule = await _average_recent_amounts_by_schedule(schedule_ids, db)
    projected_unfilled = sum(
        (estimates_by_schedule.get(p.schedule_id) or Decimal("0") for p in unfilled_paychecks),
        start=Decimal("0"),
    )

    return actual_income + projected_unfilled


async def get_estimated_savings(current_user: UUID, db: AsyncSession) -> EstimatedSavingsResult:
    """How much can realistically be saved this month, blending real month-to-date
    results with a projection for the days still ahead.

    estimated_savings = max(whole_month_income - committed_recurring -
    discretionary_projection, 0). whole_month_income is every dollar
    of income for the month - landed or not, paycheck-schedule or a manual
    entry like a freelance gig - deliberately NOT scoped to "still to come," so
    a raise or an amount correction on an already-landed paycheck (or a
    one-off income transaction) is reflected immediately instead of vanishing
    once payday passes or being silently excluded.
    discretionary_projection blends real spending already logged this month
    with whatever's left of the historical monthly average once actual spend
    is netted out - not a full remaining-days share of the average stacked on
    top of actual spend unconditionally, which double-billed a front-loaded
    month (spend most of the average early and the model still projected a
    full average's worth for the days left, #133). A month already spending
    above its own average projects no further discretionary spend.

    The floor is 0, not saved_so_far: this figure is the ceiling the projection
    actually computed, and clamping it to whatever has already been saved threw
    that away - whenever the ceiling fell to or below saved_so_far the pair
    rendered as "$X / $X", which told the caller nothing (#130). saved_so_far is
    reported alongside and may now exceed it; beating the projection is a real
    state and callers are expected to render it as such. A negative ceiling
    means the month has no room to save at all and reports as 0.

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
    # treated as not-ready rather than projecting $0. This gate still looks at
    # the whole month (received + upcoming) rather than just what's remaining -
    # a schedule that already paid out earlier this month is still "ready".
    whole_month_income = await _whole_month_income(schedules, month_start, month_end, current_user, db)
    if whole_month_income <= 0:
        raise ValueError("No paycheck amounts yet")

    # Discretionary spend average over the completed months before this one.
    # SAVINGS excluded (it's saving, surfaced separately), recurring-linked
    # transactions excluded (fixed bills are added back separately, so
    # counting them here too would double-count), and settled credit card
    # charges excluded for the same reason - that spend is already counted via
    # its payment's anchor transaction (#54).
    history_start = _add_months(month_start, -SAVINGS_HISTORY_MONTHS)
    spend_rows = (await db.execute(
        select(Transaction.transaction_date, Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category.in_(NON_SAVINGS_EXPENSE_CATEGORIES),
            Transaction.recurring_payment_id.is_(None),
            Transaction.credit_card_charge_id.is_(None),
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

    monthly_discretionary_avg = _cents(sum(totals_by_month.values(), start=Decimal("0")) / Decimal(SAVINGS_HISTORY_MONTHS))

    saved_rows = (await db.scalars(
        select(Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category == Category.SAVINGS,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date < month_end,
        )
    )).all()
    saved_so_far = sum(saved_rows, start=Decimal("0"))

    # Fixed obligations for the whole month, regardless of whether they're
    # already paid - a paid bill isn't "back in play" just because its due
    # date passed. Dated is_estimate rows (utility-style bills with a due date,
    # see #58) count here too via their baseline amount - once confirmed they
    # post a transaction with recurring_payment_id set, which the
    # discretionary-spend query below excludes, so leaving them out here would
    # make the confirmed spend vanish from the estimate instead of counting it
    # once. Only pure budget-line estimates (is_estimate, no day_of_month, e.g.
    # a grocery forecast) are excluded: they never hit the ledger, so the
    # spend they model is already captured in the discretionary figures below.
    #
    # A dated bill explicitly skipped this month (skip_pending_bill sets
    # last_applied_month without posting a transaction) never materialized and
    # never will for this month - the money didn't leave, so it shouldn't
    # still eat room in the ceiling (#133).
    recurring = (await db.scalars(
        select(RecurringPayment).where(
            RecurringPayment.created_by == current_user,
            RecurringPayment.active.is_(True),
            RecurringPayment.category.in_(NON_SAVINGS_EXPENSE_CATEGORIES),
        )
    )).all()

    current_month = today.strftime("%Y-%m")
    linked_this_month = set((await db.scalars(
        select(Transaction.recurring_payment_id).where(
            Transaction.recurring_payment_id.in_([rp.id for rp in recurring]),
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date < month_end,
        )
    )).all())

    def _was_skipped(rp: RecurringPayment) -> bool:
        return rp.last_applied_month == current_month and rp.id not in linked_this_month

    committed_recurring = sum(
        (rp.amount for rp in recurring
         if not (rp.is_estimate and rp.day_of_month is None)
         and not _was_skipped(rp)),
        start=Decimal("0"),
    )

    # Discretionary spend, blended: what's actually posted so far this month
    # (real data, only gets more complete as the month goes on) plus whatever
    # of the historical monthly average hasn't been spent yet. This is what
    # makes the estimate "live" - a month running lighter than the 3-month
    # average shows more room immediately, instead of waiting for month-end to
    # reflect it. Flooring the remainder at 0 (rather than re-adding a full
    # remaining-days share of the average unconditionally) stops a front-
    # loaded month from being billed for the same spend twice - once for what
    # actually posted, again via a projection that assumed the average rate
    # for every day regardless of what already happened (#133).
    discretionary_spent_so_far = sum((
        await db.scalars(select(Transaction.amount).where(
            Transaction.created_by == current_user,
            Transaction.category.in_(NON_SAVINGS_EXPENSE_CATEGORIES),
            Transaction.recurring_payment_id.is_(None),
            Transaction.credit_card_charge_id.is_(None),
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        ))
    ).all(), start=Decimal("0"))

    discretionary_projected_remaining = _cents(max(monthly_discretionary_avg - discretionary_spent_so_far, Decimal("0")))

    raw_ceiling = whole_month_income - committed_recurring - discretionary_spent_so_far - discretionary_projected_remaining
    estimated_savings = _cents(max(raw_ceiling, Decimal("0")))

    return EstimatedSavingsResult(
        month_start=month_start,
        month_end=month_end,
        estimated_savings=estimated_savings,
        saved_so_far=saved_so_far,
        whole_month_income=whole_month_income,
        committed_recurring=committed_recurring,
        discretionary_spent_so_far=discretionary_spent_so_far,
        discretionary_projected_remaining=discretionary_projected_remaining,
    )
