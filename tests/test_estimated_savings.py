import pytest
from uuid import UUID
from datetime import date
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import Transaction, Paycheck, PaycheckSchedule, BalanceAnchor
from app.services.paycheck_service import _add_months


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def clean_finance(test_user: dict, db: AsyncSession):
    """Hard-delete every finance row this user creates, so tests don't accumulate
    schedules/paychecks/transactions in the shared test database."""
    yield
    uid = UUID(test_user["id"])
    for model in (Transaction, Paycheck, PaycheckSchedule, BalanceAnchor):
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


async def test_savings_happy_path(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    today = date.today()
    month_start = today.replace(day=1)

    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "5000.00")

    # One discretionary (non-recurring, non-savings) expense in each of the three
    # completed months before this one, so the history gate passes and the
    # average is a clean 300.
    for n in (1, 2, 3):
        d = _add_months(month_start, -n).replace(day=15)
        res = await client.post("/transactions/", json={
            "name": "Groceries",
            "amount": "300.00",
            "transaction_date": d.isoformat(),
            "category": "EXPENSE",
        }, headers=auth_headers(token))
        assert res.status_code == 201

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
    assert float(data["projected_income"]) == 5000.0
    assert float(data["projected_spending"]) == 300.0
    assert float(data["committed_recurring"]) == 0.0
    assert float(data["estimated_savings"]) == 4700.0
    assert float(data["saved_so_far"]) == 200.0
