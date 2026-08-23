import pytest
from uuid import UUID
from datetime import date
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import Installment
from app.services.paycheck_service import _add_months
from tests.test_estimated_savings import auth_headers, clean_finance, _create_monthly_schedule, _set_current_month_amount


@pytest.fixture
async def clean_installments(test_user: dict, db: AsyncSession):
    yield
    await db.execute(delete(Installment).where(Installment.created_by == UUID(test_user["id"])))
    await db.commit()


async def _create_installment(client: AsyncClient, token: str, total_amount: str, period_months: int = 1) -> str:
    res = await client.post("/installments/", json={
        "name": "Test Installment", "total_amount": total_amount, "period_months": period_months,
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()["id"]


async def _set_balance_anchor(client: AsyncClient, token: str, current_balance: str, as_of_date: date):
    res = await client.put("/paychecks/balance", json={
        "current_balance": current_balance, "as_of_date": as_of_date.isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 200


async def test_insights_installment_not_found(test_user: dict, client: AsyncClient):
    res = await client.get(
        "/installments/00000000-0000-0000-0000-000000000000/insights",
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 404


async def test_insights_no_term_set(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    """No monthly_payment to compare against a budget - gated before even
    touching paycheck_service, regardless of how ready the budget data is."""
    res = await client.post("/installments/", json={
        "name": "New Laptop", "total_amount": "1200.00",
    }, headers=auth_headers(test_user["token"]))
    installment_id = res.json()["id"]

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is False
    assert data["reason"] == "Set a term for this installment to see insights"
    assert data["monthly_payment"] is None


async def test_insights_no_starting_balance(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    installment_id = await _create_installment(client, test_user["token"], "600.00", 6)

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is False
    assert data["reason"] == "No starting balance set"
    assert data["monthly_payment"] == "100.00"
    assert data["available_cash"] is None
    assert data["status"] is None


async def test_insights_no_active_schedule(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    token = test_user["token"]
    installment_id = await _create_installment(client, token, "600.00", 6)
    await _set_balance_anchor(client, token, "2000.00", date.today())

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is False
    assert data["reason"] == "No active paycheck schedule found"


async def _build_ready_budget(client: AsyncClient, token: str):
    """Balance anchor + an active schedule with this month's paycheck amount set,
    enough for get_spendable_surplus to compute a real free_to_allocate figure."""
    today = date.today()
    month_start = today.replace(day=1)
    await _set_balance_anchor(client, token, "2000.00", today)
    await _create_monthly_schedule(client, token, _add_months(month_start, -6))
    await _set_current_month_amount(client, token, month_start, "3000.00")


async def test_insights_matches_spendable_surplus_endpoint(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    """installment insights shouldn't reimplement the affordability math - it
    should reuse the exact same free_to_allocate the dedicated endpoint reports."""
    token = test_user["token"]
    installment_id = await _create_installment(client, token, "600.00", 6)
    await _build_ready_budget(client, token)

    surplus_res = await client.get("/paychecks/spendable-surplus", headers=auth_headers(token))
    assert surplus_res.status_code == 200
    free_to_allocate = surplus_res.json()["free_to_allocate"]

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is True
    assert data["available_cash"] == free_to_allocate


async def test_insights_dark_green_status(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    token = test_user["token"]
    # Balance anchor alone already gives $2000 of available cash; a $50/mo
    # payment is well under the 10% dark_green cutoff regardless of income.
    installment_id = await _create_installment(client, token, "300.00", 6)
    await _build_ready_budget(client, token)

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is True
    assert data["status"] == "dark_green"


async def test_insights_red_status_exceeds_available_cash(test_user: dict, client: AsyncClient, clean_finance, clean_installments):
    token = test_user["token"]
    # $10,000/mo payment vastly exceeds any plausible available cash from a
    # $2000 anchor + $3000 income - red regardless of the exact figure.
    installment_id = await _create_installment(client, token, "10000.00", 1)
    await _build_ready_budget(client, token)

    res = await client.get(f"/installments/{installment_id}/insights", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["available"] is True
    assert data["status"] == "red"
    assert float(data["ratio"]) > 1
