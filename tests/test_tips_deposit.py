import pytest
from uuid import UUID
from datetime import date, timedelta
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import Transaction, BalanceAnchor, TipDeposit


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def clean_finance(test_user: dict, db: AsyncSession):
    yield
    uid = UUID(test_user["id"])
    for model in (Transaction, BalanceAnchor, TipDeposit):
        await db.execute(delete(model).where(model.created_by == uid))
    await db.commit()


async def _set_balance(client: AsyncClient, token: str, amount: str, as_of_date: date | None = None):
    # Defaults to yesterday - current_balance is already inclusive of its own
    # as_of_date, so same-day transactions/deposits added within a test would
    # be excluded (not double-counted) if the anchor were dated today.
    as_of_date = as_of_date or date.today() - timedelta(days=1)
    res = await client.put("/paychecks/balance", json={
        "current_balance": amount, "as_of_date": as_of_date.isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 200


async def _running_balance(client: AsyncClient, token: str) -> float:
    res = await client.get("/paychecks/running-balance", headers=auth_headers(token))
    assert res.status_code == 200
    return float(res.json()["balance"])


async def _add_tip(client: AsyncClient, token: str, amount: str):
    res = await client.post("/transactions/", json={
        "name": "Cash", "amount": amount, "transaction_date": date.today().isoformat(), "category": "TIPS",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


async def _add_deposit(client: AsyncClient, token: str, amount: str) -> dict:
    res = await client.post("/tip-deposits/", json={
        "amount": amount, "deposit_date": date.today().isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


async def _cash_on_hand(client: AsyncClient, token: str) -> dict:
    res = await client.get("/tip-deposits/cash-on-hand", headers=auth_headers(token))
    assert res.status_code == 200
    return res.json()


async def test_tip_never_counts_toward_checking(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")
    assert await _running_balance(client, token) == 1000.0

    # A tip is cash on hand, not money in checking.
    await _add_tip(client, token, "150.00")
    assert await _running_balance(client, token) == 1000.0


async def test_deposit_adds_to_checking(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")

    await _add_deposit(client, token, "200.00")
    assert await _running_balance(client, token) == 1200.0


async def test_same_day_as_anchor_not_double_counted(test_user: dict, client: AsyncClient, clean_finance):
    # current_balance is a real-world snapshot (e.g. read off a bank app),
    # already inclusive of that day's activity - a transaction dated the
    # same day as as_of_date must not be replayed on top of it.
    token = test_user["token"]
    await _set_balance(client, token, "1000.00", as_of_date=date.today())

    await _add_deposit(client, token, "200.00")
    assert await _running_balance(client, token) == 1000.0


async def test_cash_on_hand_is_tips_minus_deposits(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _add_tip(client, token, "150.00")
    await _add_tip(client, token, "100.00")
    await _add_deposit(client, token, "200.00")

    coh = await _cash_on_hand(client, token)
    assert float(coh["tips_earned"]) == 250.0
    assert float(coh["tips_deposited"]) == 200.0
    assert float(coh["cash_on_hand"]) == 50.0


async def test_editing_a_deposit_updates_checking(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")
    deposit = await _add_deposit(client, token, "200.00")
    assert await _running_balance(client, token) == 1200.0

    res = await client.patch(f"/tip-deposits/{deposit['id']}", json={"amount": "300.00"}, headers=auth_headers(token))
    assert res.status_code == 200
    assert float(res.json()["amount"]) == 300.0
    assert await _running_balance(client, token) == 1300.0


async def test_deleting_a_deposit_pulls_it_back_out(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")
    deposit = await _add_deposit(client, token, "200.00")
    assert await _running_balance(client, token) == 1200.0

    res = await client.delete(f"/tip-deposits/{deposit['id']}", headers=auth_headers(token))
    assert res.status_code == 204
    assert await _running_balance(client, token) == 1000.0
