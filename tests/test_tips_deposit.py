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


async def _add_tip(client: AsyncClient, token: str, amount: str, transaction_date: date | None = None):
    res = await client.post("/transactions/", json={
        "name": "Cash", "amount": amount, "transaction_date": (transaction_date or date.today()).isoformat(), "category": "TIPS",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


async def _add_deposit(client: AsyncClient, token: str, amount: str, deposit_date: date | None = None) -> dict:
    res = await client.post("/tip-deposits/", json={
        "amount": amount, "deposit_date": (deposit_date or date.today()).isoformat(),
    }, headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


async def _cash_on_hand(client: AsyncClient, token: str, year: int | None = None, month: int | None = None) -> dict:
    params = {k: v for k, v in {"year": year, "month": month}.items() if v is not None}
    res = await client.get("/tip-deposits/cash-on-hand", params=params, headers=auth_headers(token))
    assert res.status_code == 200
    return res.json()


async def test_tip_never_counts_toward_checking(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")
    assert await _running_balance(client, token) == 1000.0

    # A tip is cash on hand, not money in checking.
    await _add_tip(client, token, "150.00")
    assert await _running_balance(client, token) == 1000.0


async def test_cash_funded_expense_never_counts_toward_checking(test_user: dict, client: AsyncClient, clean_finance):
    """#151: an expense paid with cash on hand never touched checking, so it
    shouldn't reduce the running balance either - same reasoning as a cash
    tip never adding to it above."""
    token = test_user["token"]
    await _set_balance(client, token, "1000.00")

    res = await client.post("/transactions/", json={
        "name": "Cash Lunch", "amount": "40.00", "transaction_date": date.today().isoformat(),
        "category": "EXPENSE", "paid_with_cash": True,
    }, headers=auth_headers(token))
    assert res.status_code == 201
    assert await _running_balance(client, token) == 1000.0

    # A normal (bank-paid) expense still reduces it as usual.
    res = await client.post("/transactions/", json={
        "name": "Card Lunch", "amount": "40.00", "transaction_date": date.today().isoformat(),
        "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    assert await _running_balance(client, token) == 960.0


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


async def test_cash_on_hand_is_tips_earned_not_net_of_deposits(test_user: dict, client: AsyncClient, clean_finance):
    """cash_on_hand is this month's earned cash tips, full stop - not earned
    minus deposited. A deposit isn't tied to the month its cash was earned, so
    netting the two would make cash_on_hand go negative whenever a prior
    month's undeposited cash gets deposited this month."""
    token = test_user["token"]
    await _add_tip(client, token, "150.00")
    await _add_tip(client, token, "100.00")
    await _add_deposit(client, token, "200.00")

    coh = await _cash_on_hand(client, token)
    assert float(coh["tips_earned"]) == 250.0
    assert float(coh["tips_deposited"]) == 200.0
    assert float(coh["cash_on_hand"]) == 250.0


async def test_cash_on_hand_does_not_go_negative_on_prior_month_deposit(test_user: dict, client: AsyncClient, clean_finance):
    """The bug this guards against: last month's undeposited cash gets
    deposited this month, after this month's own (smaller) cash tips."""
    token = test_user["token"]
    last_month_day = date.today().replace(day=1) - timedelta(days=1)

    await _add_tip(client, token, "300.00", transaction_date=last_month_day)
    await _add_tip(client, token, "50.00")
    await _add_deposit(client, token, "300.00")

    coh = await _cash_on_hand(client, token)
    assert float(coh["tips_earned"]) == 50.0
    assert float(coh["tips_deposited"]) == 300.0
    assert float(coh["cash_on_hand"]) == 50.0


async def test_cash_on_hand_is_scoped_to_the_month_not_all_time(test_user: dict, client: AsyncClient, clean_finance):
    """#157: a tip earned or deposited last month must not bleed into this
    month's figure - it used to sum all-time, which read as wrong sitting next
    to the this-month figures shown alongside it."""
    token = test_user["token"]
    last_month_day = date.today().replace(day=1) - timedelta(days=1)

    await _add_tip(client, token, "80.00", transaction_date=last_month_day)
    await _add_deposit(client, token, "80.00", deposit_date=last_month_day)
    await _add_tip(client, token, "150.00")
    await _add_tip(client, token, "100.00")
    await _add_deposit(client, token, "200.00")

    coh = await _cash_on_hand(client, token)
    assert float(coh["tips_earned"]) == 250.0
    assert float(coh["tips_deposited"]) == 200.0
    assert float(coh["cash_on_hand"]) == 250.0

    coh_last_month = await _cash_on_hand(client, token, year=last_month_day.year, month=last_month_day.month)
    assert float(coh_last_month["tips_earned"]) == 80.0
    assert float(coh_last_month["tips_deposited"]) == 80.0
    assert float(coh_last_month["cash_on_hand"]) == 80.0


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


async def test_convert_tip_to_deposit_and_back(test_user: dict, client: AsyncClient, clean_finance):
    """#156: a quality-of-life correction, not a persistent link - the
    transaction/deposit is gone once converted, nothing ties the result back
    to what it came from."""
    token = test_user["token"]
    tip = await _add_tip(client, token, "45.00")

    res = await client.post(f"/transactions/{tip['id']}/convert-to-tip-deposit", headers=auth_headers(token))
    assert res.status_code == 200
    deposit = res.json()
    assert float(deposit["amount"]) == 45.0
    assert deposit["deposit_date"] == tip["transaction_date"]

    # The original transaction is gone.
    res = await client.get(f"/transactions/{tip['id']}", headers=auth_headers(token))
    assert res.status_code == 404

    res = await client.post(f"/tip-deposits/{deposit['id']}/convert-to-transaction", headers=auth_headers(token))
    assert res.status_code == 200
    back = res.json()
    assert float(back["amount"]) == 45.0
    assert back["category"] == "TIPS"
    assert back["transaction_date"] == deposit["deposit_date"]

    # The deposit is gone in turn.
    res = await client.patch(f"/tip-deposits/{deposit['id']}", json={"amount": "1.00"}, headers=auth_headers(token))
    assert res.status_code == 404


async def test_convert_non_tip_transaction_is_rejected(test_user: dict, client: AsyncClient, clean_finance):
    token = test_user["token"]
    res = await client.post("/transactions/", json={
        "name": "Groceries", "amount": "30.00", "transaction_date": date.today().isoformat(), "category": "EXPENSE",
    }, headers=auth_headers(token))
    expense = res.json()

    res = await client.post(f"/transactions/{expense['id']}/convert-to-tip-deposit", headers=auth_headers(token))
    assert res.status_code == 400
