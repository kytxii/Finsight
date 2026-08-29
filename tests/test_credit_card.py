import pytest
from decimal import Decimal
from uuid import UUID
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import Transaction, CreditCardPayment, CreditCardCharge, CreditCardChargeAllocation
from app.models.category import Category
from app.services.paycheck_service import _balance_delta


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def clean_credit_card(test_user: dict, db: AsyncSession):
    """Hard-delete every credit-card and transaction row this user creates, so
    tests don't accumulate rows in the shared test database."""
    yield
    uid = UUID(test_user["id"])
    await db.execute(delete(CreditCardChargeAllocation).where(CreditCardChargeAllocation.created_by == uid))
    await db.execute(delete(CreditCardCharge).where(CreditCardCharge.created_by == uid))
    await db.execute(delete(CreditCardPayment).where(CreditCardPayment.created_by == uid))
    await db.execute(delete(Transaction).where(Transaction.created_by == uid))
    await db.commit()


async def _create_payment(client: AsyncClient, token: str, amount: str = "250.00") -> dict:
    res = await client.post("/transactions/", json={
        "name": "Online Banking Payment to CRD",
        "amount": amount,
        "transaction_date": "2026-08-15",
        "category": "BILL",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    transaction_id = res.json()["id"]

    res = await client.post(f"/credit-card-payments/from-transaction/{transaction_id}", headers=auth_headers(token))
    assert res.status_code == 201
    return res.json()


# One test_user-driven test per function below (registration is rate-limited
# to 5/min), so closely-related assertions are grouped into a single test
# rather than spread across many - fewer fresh registrations, still one clear
# concern per test via sequential, independent assertions within it.


async def test_create_payment_from_transaction(test_user: dict, client: AsyncClient, clean_credit_card):
    token = test_user["token"]
    payment = await _create_payment(client, token)
    assert payment["total_amount"] == "250.00"
    assert payment["paid"] == "0.00"
    assert payment["left"] == "250.00"
    assert payment["charges"] == []

    # Converting the same transaction twice is rejected.
    res = await client.post("/transactions/", json={
        "name": "Payment", "amount": "100.00", "transaction_date": "2026-08-15", "category": "BILL",
    }, headers=auth_headers(token))
    transaction_id = res.json()["id"]
    res = await client.post(f"/credit-card-payments/from-transaction/{transaction_id}", headers=auth_headers(token))
    assert res.status_code == 201
    res = await client.post(f"/credit-card-payments/from-transaction/{transaction_id}", headers=auth_headers(token))
    assert res.status_code == 404
    assert res.json()["detail"] == "Transaction is already a credit card payment"

    # Converting a nonexistent transaction 404s.
    res = await client.post(
        "/credit-card-payments/from-transaction/00000000-0000-0000-0000-000000000000",
        headers=auth_headers(token),
    )
    assert res.status_code == 404


async def test_allocate_always_settles_and_promotes_immediately(test_user: dict, client: AsyncClient, clean_credit_card):
    """A charge is always allocated in full the moment it's created (#147) -
    there's no partial/rollover state, so it settles and promotes into a
    real, categorized transaction right away."""
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="250.00")

    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "name": "Gas", "total_amount": "55.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["paid"] == "55.00"
    assert data["left"] == "195.00"
    gas_charge = data["charges"][0]
    assert gas_charge["amount_paid"] == "55.00"
    assert gas_charge["settled"] is True
    assert gas_charge["settled_transaction_id"] is not None

    res = await client.get(f"/transactions/{gas_charge['settled_transaction_id']}", headers=auth_headers(token))
    assert res.status_code == 200
    settled = res.json()
    assert settled["name"] == "Gas"
    assert settled["amount"] == "55.00"
    assert settled["category"] == "EXPENSE"


async def test_allocate_rejects_charge_exceeding_what_is_left_on_payment(test_user: dict, client: AsyncClient, clean_credit_card):
    """No partial/rollover (#147) - a charge bigger than what's left on the
    payment is rejected outright instead of being partly applied and left
    for a later payment to finish off."""
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="50.00")

    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "name": "Gas", "total_amount": "100.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    assert res.status_code == 400
    assert "left on this payment" in res.json()["detail"]

    # The rejected attempt created nothing.
    res = await client.get(f"/credit-card-payments/{payment['id']}", headers=auth_headers(token))
    data = res.json()
    assert data["charges"] == []
    assert data["left"] == "50.00"


def test_balance_delta_excludes_settled_credit_card_charges():
    """Unit-level, no DB/registration needed: a promoted charge transaction
    contributes 0 to the running balance - that cash already left via its
    payment's own transaction, so counting it again here would double the
    cash impact of one payment (#54)."""
    charge_transaction = Transaction(
        name="Gas", amount=Decimal("55.00"), category=Category.EXPENSE,
        credit_card_charge_id=UUID("00000000-0000-0000-0000-000000000000"),
    )
    assert _balance_delta(charge_transaction) == Decimal("0")


async def test_delete_payment_with_no_charges_unlinks_anchor(test_user: dict, client: AsyncClient, clean_credit_card):
    """Deleting an empty (never-allocated) payment removes the payment but
    leaves the real transaction alone, just unlinked (#54 follow-up)."""
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="100.00")

    res = await client.get("/credit-card-payments/", headers=auth_headers(token))
    assert any(p["id"] == payment["id"] for p in res.json())

    res = await client.delete(f"/credit-card-payments/{payment['id']}", headers=auth_headers(token))
    assert res.status_code == 204

    res = await client.get(f"/credit-card-payments/{payment['id']}", headers=auth_headers(token))
    assert res.status_code == 404

    res = await client.get("/credit-card-payments/", headers=auth_headers(token))
    assert not any(p["id"] == payment["id"] for p in res.json())


async def test_delete_payment_orphans_sole_funded_charge(test_user: dict, client: AsyncClient, db: AsyncSession, clean_credit_card):
    """A charge is always funded entirely by whichever payment it was
    allocated to (#147) - deleting that payment leaves nothing funding the
    charge, so the charge record itself is removed outright. Any transaction
    it promoted survives, unlinked - real money already left the account,
    same reasoning as the anchor transaction (#54 follow-up)."""
    token = test_user["token"]

    payment_a = await _create_payment(client, token, amount="100.00")
    res = await client.post(f"/credit-card-payments/{payment_a['id']}/allocate", json={
        "name": "Coffee", "total_amount": "10.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    settled_txn_id = res.json()["charges"][0]["settled_transaction_id"]
    assert settled_txn_id is not None

    payment_b = await _create_payment(client, token, amount="100.00")
    res = await client.post(f"/credit-card-payments/{payment_b['id']}/allocate", json={
        "name": "Gas", "total_amount": "55.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    gas_charge_id = res.json()["charges"][0]["id"]

    res = await client.delete(f"/credit-card-payments/{payment_a['id']}", headers=auth_headers(token))
    assert res.status_code == 204
    res = await client.get(f"/transactions/{settled_txn_id}", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["credit_card_charge_id"] is None

    res = await client.delete(f"/credit-card-payments/{payment_b['id']}", headers=auth_headers(token))
    assert res.status_code == 204
    result = await db.execute(select(CreditCardCharge).where(CreditCardCharge.id == UUID(gas_charge_id)))
    assert result.scalar_one_or_none() is None


async def test_remove_charge_unlinks_transaction_and_deletes_charge(test_user: dict, client: AsyncClient, clean_credit_card):
    """Removing a charge from its payment (#146) unlinks any promoted
    transaction rather than deleting it - same reasoning as delete_payment -
    and deletes the now-empty charge record, without touching the rest of
    the payment."""
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="100.00")

    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "name": "Coffee", "total_amount": "10.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    charge_id = res.json()["charges"][0]["id"]
    settled_txn_id = res.json()["charges"][0]["settled_transaction_id"]
    assert settled_txn_id is not None

    res = await client.delete(f"/credit-card-payments/{payment['id']}/charges/{charge_id}", headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["charges"] == []
    assert data["paid"] == "0.00"
    assert data["left"] == "100.00"
    # The payment itself is untouched - only this one allocation is gone.
    res = await client.get(f"/credit-card-payments/{payment['id']}", headers=auth_headers(token))
    assert res.status_code == 200

    res = await client.get(f"/transactions/{settled_txn_id}", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["credit_card_charge_id"] is None


async def test_remove_charge_not_allocated_to_payment_returns_404(test_user: dict, client: AsyncClient, clean_credit_card):
    token = test_user["token"]
    payment_a = await _create_payment(client, token, amount="100.00")
    res = await client.post(f"/credit-card-payments/{payment_a['id']}/allocate", json={
        "name": "Coffee", "total_amount": "10.00", "category": "EXPENSE", "charge_date": "2026-08-10",
    }, headers=auth_headers(token))
    charge_id = res.json()["charges"][0]["id"]

    payment_b = await _create_payment(client, token, amount="100.00")
    res = await client.delete(f"/credit-card-payments/{payment_b['id']}/charges/{charge_id}", headers=auth_headers(token))
    assert res.status_code == 404


async def test_allocate_existing_transaction_reuses_it_as_settled_charge(test_user: dict, client: AsyncClient, clean_credit_card):
    """Picking an already-recorded, unlinked transaction to cover part of a
    payment reuses that transaction as the settled charge directly - no
    duplicate transaction gets created, unlike a from-scratch charge's
    promotion (#54 follow-up)."""
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="250.00")

    res = await client.post("/transactions/", json={
        "name": "Gas", "amount": "55.00", "transaction_date": "2026-08-12", "category": "EXPENSE",
    }, headers=auth_headers(token))
    assert res.status_code == 201
    gas_txn = res.json()

    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "transaction_id": gas_txn["id"],
    }, headers=auth_headers(token))
    assert res.status_code == 200
    data = res.json()
    assert data["paid"] == "55.00"
    assert data["left"] == "195.00"
    charge = data["charges"][0]
    assert charge["name"] == "Gas"
    assert charge["total_amount"] == "55.00"
    assert charge["settled"] is True
    # The picked transaction itself is the settled row - no duplicate.
    assert charge["settled_transaction_id"] == gas_txn["id"]

    # Already linked - can't be picked again for the same or another payment.
    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "transaction_id": gas_txn["id"],
    }, headers=auth_headers(token))
    assert res.status_code == 400


async def test_allocate_existing_transaction_rejects_amount_exceeding_payment(test_user: dict, client: AsyncClient, clean_credit_card):
    token = test_user["token"]
    payment = await _create_payment(client, token, amount="50.00")

    res = await client.post("/transactions/", json={
        "name": "Big Purchase", "amount": "100.00", "transaction_date": "2026-08-12", "category": "EXPENSE",
    }, headers=auth_headers(token))
    txn = res.json()

    res = await client.post(f"/credit-card-payments/{payment['id']}/allocate", json={
        "transaction_id": txn["id"],
    }, headers=auth_headers(token))
    assert res.status_code == 400
    assert "left on this payment" in res.json()["detail"]
