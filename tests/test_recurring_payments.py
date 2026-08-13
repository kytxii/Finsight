import pytest                                                                            
from httpx import AsyncClient                             

def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_recurring_payment(test_user: dict, client: AsyncClient):
    res = await client.post("/recurring-payments/", json={
        "name": "Netflix",
        "amount": "14.99",
        "day_of_month": 1,
        "category": "SUBSCRIPTION",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    tx = res.json()

    yield tx

    await client.delete(f"/recurring-payments/{tx['id']}", headers=auth_headers(test_user["token"]))


async def test_create_recurring_payment(test_user: dict, client: AsyncClient):
    res = await client.post("/recurring-payments/", json={
        "name": "Rent",
        "amount": "1000.00",
        "day_of_month": 1,
        "category": "BILL",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Rent"
    assert data["category"] == "BILL"
    assert "id" in data

    await client.delete(f"/recurring-payments/{data['id']}", headers=auth_headers(test_user["token"]))


async def test_get_recurring_payments(test_user: dict, test_recurring_payment: dict, client: AsyncClient):
    res = await client.get("/recurring-payments/", headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    ids = [t["id"] for t in res.json()]
    assert test_recurring_payment["id"] in ids


async def test_update_recurring_payment(test_user: dict, test_recurring_payment: dict, client: AsyncClient):
    res = await client.patch(f"/recurring-payments/{test_recurring_payment['id']}", json={
        "name": "Updated Rent",
        "amount": "800.00",
        "day_of_month": 1,
        "category": "BILL",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Rent"


async def test_delete_recurring_payment(test_user: dict, client: AsyncClient):
    res = await client.post("/recurring-payments/", json={
        "name": "To Delete",
        "amount": "1.00",
        "day_of_month": 1,
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    tx_id = res.json()["id"]

    res = await client.delete(f"/recurring-payments/{tx_id}", headers=auth_headers(test_user["token"]))
    assert res.status_code == 204

    res = await client.get("/recurring-payments/", headers=auth_headers(test_user["token"]))
    assert tx_id not in [t["id"] for t in res.json()]


async def test_unauthenticated_request(client: AsyncClient):
    res = await client.get("/recurring-payments/")
    assert res.status_code == 401


async def test_fixed_payment_without_day_of_month_is_now_allowed(test_user: dict, client: AsyncClient):
    # #58: day_of_month is independent of is_estimate - no longer required for
    # non-estimate rows. Rare in practice, but no longer rejected.
    res = await client.post("/recurring-payments/", json={
        "name": "Rare fixed no-date line",
        "amount": "50.00",
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["day_of_month"] is None

    await client.delete(f"/recurring-payments/{data['id']}", headers=auth_headers(test_user["token"]))


@pytest.mark.parametrize("category", ["INCOME", "TIPS"])
async def test_income_and_tips_rejected_on_create(test_user: dict, client: AsyncClient, category: str):
    res = await client.post("/recurring-payments/", json={
        "name": "Should be rejected",
        "amount": "50.00",
        "day_of_month": 1,
        "category": category,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 422


@pytest.mark.parametrize("category", ["INCOME", "TIPS"])
async def test_income_and_tips_rejected_on_update(test_user: dict, test_recurring_payment: dict, client: AsyncClient, category: str):
    res = await client.patch(f"/recurring-payments/{test_recurring_payment['id']}", json={
        "category": category,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 422