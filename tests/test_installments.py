import pytest
from uuid import UUID
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import User, Installment


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_installment(test_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "Car Exhaust", "total_amount": "600.00", "period_months": 6,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    installment = res.json()
    yield installment
    await client.delete(f"/installments/{installment['id']}", headers=auth_headers(test_user["token"]))


async def test_create_installment_flat_division(test_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "Student Loan", "total_amount": "6000.00", "period_months": 12,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Student Loan"
    assert data["monthly_payment"] == "500.00"
    assert data["active"] is True
    assert "id" in data
    await client.delete(f"/installments/{data['id']}", headers=auth_headers(test_user["token"]))


async def test_create_installment_always_debt_category(test_user: dict, client: AsyncClient):
    """category isn't client-settable - every installment is DEBT, no exceptions."""
    res = await client.post("/installments/", json={
        "name": "Car Exhaust", "total_amount": "600.00", "period_months": 6, "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["category"] == "DEBT"
    await client.delete(f"/installments/{data['id']}", headers=auth_headers(test_user["token"]))


async def test_create_installment_with_day_of_month(test_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "Car Loan", "total_amount": "1200.00", "period_months": 12, "day_of_month": 15,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["day_of_month"] == 15
    await client.delete(f"/installments/{data['id']}", headers=auth_headers(test_user["token"]))


async def test_create_installment_without_day_of_month(test_user: dict, client: AsyncClient):
    """day_of_month is optional, same as period_months."""
    res = await client.post("/installments/", json={
        "name": "Car Exhaust", "total_amount": "600.00", "period_months": 6,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    assert res.json()["day_of_month"] is None
    await client.delete(f"/installments/{res.json()['id']}", headers=auth_headers(test_user["token"]))


async def test_update_installment_day_of_month(test_user: dict, test_installment: dict, client: AsyncClient):
    res = await client.patch(f"/installments/{test_installment['id']}", json={
        "day_of_month": 5,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    assert res.json()["day_of_month"] == 5


async def test_create_installment_without_term(test_user: dict, client: AsyncClient):
    """period_months is genuinely optional - a user can log an installment before
    deciding how long they'll take to pay it off."""
    res = await client.post("/installments/", json={
        "name": "New Laptop", "total_amount": "1200.00",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    data = res.json()
    assert data["period_months"] is None
    assert data["monthly_payment"] is None
    await client.delete(f"/installments/{data['id']}", headers=auth_headers(test_user["token"]))


async def test_update_installment_adds_term_later(test_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "New Laptop", "total_amount": "1200.00",
    }, headers=auth_headers(test_user["token"]))
    installment_id = res.json()["id"]

    res = await client.patch(f"/installments/{installment_id}", json={
        "period_months": 12,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["period_months"] == 12
    assert data["monthly_payment"] == "100.00"

    await client.delete(f"/installments/{installment_id}", headers=auth_headers(test_user["token"]))


async def test_update_installment_clears_term(test_user: dict, test_installment: dict, client: AsyncClient):
    res = await client.patch(f"/installments/{test_installment['id']}", json={
        "period_months": None,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["period_months"] is None
    assert data["monthly_payment"] is None


async def test_get_installments(test_user: dict, test_installment: dict, client: AsyncClient):
    res = await client.get("/installments/", headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    ids = [i["id"] for i in res.json()]
    assert test_installment["id"] in ids


async def test_get_installment_by_id_not_found(test_user: dict, client: AsyncClient):
    res = await client.get("/installments/00000000-0000-0000-0000-000000000000", headers=auth_headers(test_user["token"]))
    assert res.status_code == 404


async def test_update_installment_recomputes_monthly_payment(test_user: dict, test_installment: dict, client: AsyncClient):
    res = await client.patch(f"/installments/{test_installment['id']}", json={
        "period_months": 3,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["period_months"] == 3
    assert data["monthly_payment"] == "200.00"


async def test_update_installment_name_only_keeps_monthly_payment(test_user: dict, test_installment: dict, client: AsyncClient):
    res = await client.patch(f"/installments/{test_installment['id']}", json={
        "name": "Renamed",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Renamed"
    assert data["monthly_payment"] == test_installment["monthly_payment"]


async def test_delete_installment(test_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "To Delete", "total_amount": "300.00", "period_months": 3,
    }, headers=auth_headers(test_user["token"]))
    installment_id = res.json()["id"]

    res = await client.delete(f"/installments/{installment_id}", headers=auth_headers(test_user["token"]))
    assert res.status_code == 204

    res = await client.get("/installments/", headers=auth_headers(test_user["token"]))
    assert installment_id not in [i["id"] for i in res.json()]


async def test_unauthenticated_request(client: AsyncClient):
    res = await client.get("/installments/")
    assert res.status_code == 401


@pytest.mark.parametrize("payload", [
    {"name": "Bad Amount", "total_amount": "0", "period_months": 6},
    {"name": "Negative Amount", "total_amount": "-100", "period_months": 6},
    {"name": "Bad Period", "total_amount": "100", "period_months": 0},
    {"name": "Period Too Long", "total_amount": "100", "period_months": 481},
    {"name": "Bad Day", "total_amount": "100", "period_months": 6, "day_of_month": 0},
    {"name": "Day Too Long", "total_amount": "100", "period_months": 6, "day_of_month": 32},
    {"total_amount": "100", "period_months": 6},  # missing name
    {"name": "No Amount", "period_months": 6},  # missing total_amount
])
async def test_create_installment_validation(test_user: dict, client: AsyncClient, payload):
    res = await client.post("/installments/", json=payload, headers=auth_headers(test_user["token"]))
    assert res.status_code == 422


@pytest.fixture
async def other_user(client: AsyncClient, db: AsyncSession):
    email = "other-installments@finsight.dev"
    await db.execute(delete(User).where(User.email_address == email))
    await db.commit()

    res = await client.post("/auth/register", json={
        "first_name": "Other", "last_name": "User", "email_address": email, "password": "TestPassword1!",
    })
    assert res.status_code == 201
    user_id = res.json()["id"]

    res = await client.post("/auth/login", json={"email_address": email, "password": "TestPassword1!"})
    token = res.json()["access_token"]

    yield {"id": user_id, "token": token}

    await db.execute(delete(Installment).where(Installment.created_by == UUID(user_id)))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()


async def test_cross_user_scoping(test_user: dict, other_user: dict, client: AsyncClient):
    res = await client.post("/installments/", json={
        "name": "User A's Installment", "total_amount": "300.00", "period_months": 3,
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    installment_id = res.json()["id"]

    other_headers = auth_headers(other_user["token"])
    res = await client.get(f"/installments/{installment_id}", headers=other_headers)
    assert res.status_code == 404

    res = await client.patch(f"/installments/{installment_id}", json={"name": "Hijacked"}, headers=other_headers)
    assert res.status_code == 404

    res = await client.delete(f"/installments/{installment_id}", headers=other_headers)
    assert res.status_code == 404

    # Still there and untouched for its actual owner.
    res = await client.get(f"/installments/{installment_id}", headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    assert res.json()["name"] == "User A's Installment"

    await client.delete(f"/installments/{installment_id}", headers=auth_headers(test_user["token"]))
