import pytest
from decimal import Decimal
from uuid import UUID
from datetime import date
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import Transaction, Paycheck, PaycheckSchedule, BalanceAnchor, TipDeposit
from app.services.paycheck_service import _add_months, _cents


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def clean_finance(test_user: dict, db: AsyncSession):
    """Hard-delete every finance row this user creates, so tests don't accumulate
    schedules/paychecks/transactions in the shared test database."""
    yield
    uid = UUID(test_user["id"])
    for model in (Transaction, Paycheck, PaycheckSchedule, BalanceAnchor, TipDeposit):
        await db.execute(delete(model).where(model.created_by == uid))
    await db.commit()


async def _create_monthly_schedule(client: AsyncClient, token: str, start: date):
    res = await client.post("/paychecks/schedules", json={
        "name": "Test Job",
        "frequency": "MONTHLY",
        "start_date": start.isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


async def _set_current_month_amount(client: AsyncClient, token: str, month_start: date, amount: str):
    res = await client.get("/paychecks/", headers=auth_headers(token))
    assert res.status_code == 200
    prefix = month_start.strftime("%Y-%m")
    paycheck = next(p for p in res.json()["paychecks"] if p["pay_date"].startswith(prefix))
    res = await client.patch(f"/paychecks/{paycheck['id']}", json={"amount": amount}, headers=auth_headers(token))
    assert res.status_code == 200


async def test_savings_no_schedule(test_user: dict, client: AsyncClient, clean_finance):
    res = await client.get("/paychecks/savings", headers=auth_headers(test_user["token"]))
    assert res.status_code == 404
    assert res.json()["detail"] == "No active paycheck schedule found"


async def test_savings_no_amounts(test_user: dict, client: AsyncClient, clean_finance):
    month_start = date.today().replace(day=1)
    await _create_monthly_schedule(client, test_user["token"], _add_months(month_start, -6))

    res = await client.get("/paychecks/savings", headers=auth_headers(test_user["token"]))
    assert res.status_code == 404
    assert res.json()["detail"] == "No paycheck amounts yet"


async def test_savings_insufficient_history(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    month_start = date.today().replace(day=1)
    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 404
    assert res.json()["detail"] == "Not enough spending history"


async def _seed_discretionary_history(client: AsyncClient, token: str, month_start: date, amount: str = "300.00"):
    """One discretionary (non-recurring, non-savings) expense in each of the
    three completed months before this one, so the history gate passes and
    the daily-rate average is a clean, known figure."""
    for n in (1, 2, 3):
        d = _add_months(month_start, -n).replace(day=15)
        res = await client.post("/transactions/", json={
            "name": "Groceries",
            "amount": amount,
            "transaction_date": d.isoformat(),
            "category": "EXPENSE",
        }, headers=auth_headers(token))
        assert res.status_code == 201


async def test_savings_happy_path(test_user: dict, client: AsyncClient, clean_finance):
    """estimated_savings = max(whole_month_income - committed_recurring -
    discretionary_spent_so_far - discretionary_projected_remaining, 0).
    whole_month_income counts the paycheck regardless of whether it's already
    landed this month (#85)."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")
    await _seed_discretionary_history(client, token, month_start)

    # A savings transfer this month feeds saved_so_far, not the spend average.
    res = await client.post("/transactions/", json={
        "name": "Savings",
        "amount": "200.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "SAVINGS",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    # No discretionary spend posted yet this month, so the full historical
    # average is still ahead of it.
    expected_remaining = _cents(Decimal("300.00"))
    expected_ceiling = _cents(Decimal("5000.00") - expected_remaining)

    assert float(data["whole_month_income"]) == 5000.0
    assert float(data["committed_recurring"]) == 0.0
    assert float(data["discretionary_spent_so_far"]) == 0.0
    assert float(data["discretionary_projected_remaining"]) == float(expected_remaining)
    assert float(data["saved_so_far"]) == 200.0
    assert float(data["estimated_savings"]) == float(expected_ceiling)
    # The four reported inputs reconcile to the headline figure - they did not
    # while the estimate was floored at saved_so_far (#130).
    assert float(data["estimated_savings"]) == pytest.approx(
        float(data["whole_month_income"])
        - float(data["committed_recurring"])
        - float(data["discretionary_spent_so_far"])
        - float(data["discretionary_projected_remaining"])
    )


async def test_savings_reports_zero_ceiling_when_income_is_exhausted(test_user: dict, client: AsyncClient, clean_finance):
    """When committed bills and actual month-to-date spending have more than
    accounted for the month's income, there is no room left to save. That
    reports as 0 - the ceiling clamps at zero, not at saved_so_far, which used
    to render the pair as an uninformative "$200 / $200" (#130)."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "250.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/transactions/", json={
        "name": "Savings",
        "amount": "200.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "SAVINGS",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    # Already spent more this month than the $250 income covers, so the raw
    # ceiling goes negative regardless of what day the suite runs on.
    res = await client.post("/transactions/", json={
        "name": "Big Purchase",
        "amount": "400.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    # What was actually put aside still stands on its own.
    assert float(data["saved_so_far"]) == 200.0
    assert float(data["estimated_savings"]) == 0.0


async def test_savings_allows_saved_to_exceed_the_ceiling(test_user: dict, client: AsyncClient, clean_finance):
    """Saving more than the projection said was possible is a real state, not
    one to hide behind a floor: estimated_savings keeps reporting the computed
    ceiling and saved_so_far is free to sit above it (#130)."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "1000.00")
    await _seed_discretionary_history(client, token, month_start)

    # Well past any ceiling $1000 of income could support.
    res = await client.post("/transactions/", json={
        "name": "Savings",
        "amount": "900.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "SAVINGS",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.post("/transactions/", json={
        "name": "Big Purchase",
        "amount": "500.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    assert float(data["saved_so_far"]) == 900.0
    assert float(data["estimated_savings"]) < float(data["saved_so_far"])


async def test_savings_counts_manual_income_transactions(test_user: dict, client: AsyncClient, clean_finance):
    """A manual INCOME transaction not tied to any paycheck schedule (e.g. a
    freelance gig) should still count toward whole_month_income - it's real
    money regardless of whether it came from a formal paycheck."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "3000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/transactions/", json={
        "name": "Freelance",
        "amount": "500.00",
        "transaction_date": month_start.replace(day=min(today.day, 28)).isoformat(),
        "category": "INCOME",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    # $3000 paycheck (already counted via its linked transaction) + $500
    # freelance, not double-counted.
    assert float(data["whole_month_income"]) == 3500.0


async def test_savings_counts_reimbursements_and_tip_deposits_not_cash_tips(test_user: dict, client: AsyncClient, clean_finance):
    """#131: income is money that actually arrived - INCOME, REIMBURSEMENT and
    banked TipDeposits. A TIPS transaction is cash in hand and moves nothing
    until it's deposited, so it must not reach whole_month_income."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)
    in_month = month_start.replace(day=min(today.day, 28))

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "3000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/transactions/", json={
        "name": "Work travel",
        "amount": "120.00",
        "transaction_date": in_month.isoformat(),
        "category": "REIMBURSEMENT",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    # Cash tips: tracked, never banked - must not move the figure.
    res = await client.post("/transactions/", json={
        "name": "Cash",
        "amount": "400.00",
        "transaction_date": in_month.isoformat(),
        "category": "TIPS",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.post("/tip-deposits/", json={
        "amount": "250.00",
        "deposit_date": in_month.isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200

    # $3000 paycheck + $120 reimbursement + $250 deposited. The $400 cash tip
    # is deliberately absent.
    assert float(res.json()["whole_month_income"]) == 3370.0


async def test_savings_excludes_tip_deposits_from_other_months(test_user: dict, client: AsyncClient, clean_finance):
    """Deposits are month-scoped like every other income row - banking last
    month's cash doesn't inflate this month's income."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "3000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/tip-deposits/", json={
        "amount": "500.00",
        "deposit_date": _add_months(month_start, -1).replace(day=15).isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["whole_month_income"]) == 3000.0


async def test_savings_counts_dated_variable_bill_in_committed_recurring(test_user: dict, client: AsyncClient, clean_finance):
    """#58: a variable bill with a due date (e.g. a utility) counts toward
    committed_recurring via its baseline amount, same as a fixed bill - once
    confirmed it posts a linked transaction excluded from discretionary spend,
    so leaving it uncounted here would make it vanish from the estimate."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/recurring-payments/", json={
        "name": "APS",
        "amount": "120.00",
        "day_of_month": 10,
        "category": "BILL",
        "is_estimate": True,
    }, headers=auth_headers(token))
    assert res.status_code == 201
    rp_id = res.json()["id"]

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["committed_recurring"]) == 120.0

    await client.delete(f"/recurring-payments/{rp_id}", headers=auth_headers(token))


async def test_savings_excludes_budget_line_estimate_without_due_date(test_user: dict, client: AsyncClient, clean_finance):
    """A pure budget-line estimate (no day_of_month, e.g. a grocery forecast)
    never hits the ledger, so it stays out of committed_recurring - the spend
    it models is already captured via discretionary_spent_so_far instead."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/recurring-payments/", json={
        "name": "Groceries",
        "amount": "400.00",
        "category": "EXPENSE",
        "is_estimate": True,
    }, headers=auth_headers(token))
    assert res.status_code == 201
    rp_id = res.json()["id"]

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["committed_recurring"]) == 0.0

    await client.delete(f"/recurring-payments/{rp_id}", headers=auth_headers(token))


async def test_savings_front_loaded_spend_not_double_billed(test_user: dict, client: AsyncClient, clean_finance):
    """#133: heavy spend early in the month must not also get billed again via
    a full remaining-days share of the historical average stacked on top of
    it - once actual spend meets or exceeds the average, the projected
    remainder floors at 0 instead of assuming the average rate continues
    regardless of what already happened."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")
    await _seed_discretionary_history(client, token, month_start, amount="300.00")

    # Already spent well above the $300 historical average this month.
    res = await client.post("/transactions/", json={
        "name": "Big Purchase",
        "amount": "500.00",
        "transaction_date": month_start.isoformat(),
        "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    assert float(data["discretionary_spent_so_far"]) == 500.0
    assert float(data["discretionary_projected_remaining"]) == 0.0
    assert float(data["estimated_savings"]) == 4500.0


async def test_savings_excludes_skipped_bill_from_committed_recurring(test_user: dict, client: AsyncClient, clean_finance):
    """#133: a dated bill explicitly skipped this month (skip_pending_bill)
    never posts a transaction and never will for this month - the obligation
    didn't materialize, so it shouldn't still eat room in the ceiling."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")
    await _seed_discretionary_history(client, token, month_start)

    res = await client.post("/recurring-payments/", json={
        "name": "Water Bill",
        "amount": "35.00",
        "day_of_month": 1,
        "category": "BILL",
        "is_estimate": True,
    }, headers=auth_headers(token))
    assert res.status_code == 201
    rp_id = res.json()["id"]

    # Still an unresolved obligation - counts in full.
    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["committed_recurring"]) == 35.0

    res = await client.post(f"/recurring-payments/{rp_id}/skip", headers=auth_headers(token))
    assert res.status_code == 204

    # Skipped - the money never left, so it's out of the ceiling.
    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["committed_recurring"]) == 0.0

    await client.delete(f"/recurring-payments/{rp_id}", headers=auth_headers(token))


async def test_savings_excludes_cash_funded_expenses(test_user: dict, client: AsyncClient, clean_finance):
    """#151: an expense paid_with_cash never touched a tracked balance, so it
    shouldn't reduce the estimated-savings ceiling any more than the
    undeposited cash tip that funded it increased it (#131 symmetry) -
    excluded from both the historical discretionary average and this
    month's spend-so-far."""
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")

    # History: $300 tracked + $150 cash-funded (excluded) each month - the
    # average should land on $300, not $450.
    for n in (1, 2, 3):
        d = _add_months(month_start, -n).replace(day=15)
        res = await client.post("/transactions/", json={
            "name": "Groceries", "amount": "300.00",
            "transaction_date": d.isoformat(), "category": "EXPENSE",
        }, headers=auth_headers(token))
        assert res.status_code == 201
        res = await client.post("/transactions/", json={
            "name": "Cash Lunch", "amount": "150.00",
            "transaction_date": d.isoformat(), "category": "EXPENSE",
            "paid_with_cash": True,
        }, headers=auth_headers(token))
        assert res.status_code == 201

    # This month: $100 tracked + $200 cash-funded.
    res = await client.post("/transactions/", json={
        "name": "Gas", "amount": "100.00",
        "transaction_date": month_start.isoformat(), "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    res = await client.post("/transactions/", json={
        "name": "Cash Dinner", "amount": "200.00",
        "transaction_date": month_start.isoformat(), "category": "EXPENSE",
        "paid_with_cash": True,
    }, headers=auth_headers(token))
    assert res.status_code == 201

    res = await client.get("/paychecks/savings", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()

    # Only the $100 tracked expense counts as spent so far.
    assert float(data["discretionary_spent_so_far"]) == 100.0
    # Average is $300 (tracked-only history); $100 already spent -> $200 left projected.
    assert float(data["discretionary_projected_remaining"]) == 200.0
    # 5000 income - 0 committed - 100 spent - 200 projected = 4700.
    assert float(data["estimated_savings"]) == 4700.0
