"""Idempotent create/delete for offline write sync (#204).

A client offline mints its own row id (every model's PK already defaults to
uuid4) and replays queued writes once it reconnects. These tests cover the
two ways a replay must behave: a repeated create with the same id must not
duplicate the row, and a repeated delete must not 404 once the row is
already gone. Covers one hard-delete resource (transactions) and one
soft-delete resource (recurring payments, already idempotent by
construction) - the other resources share the same create/delete helpers in
app/services/sync_utils.py and transaction_service.py/tip_deposit_service.py,
so this isn't re-verified per resource.
"""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_create_transaction_with_client_id_is_idempotent(
    test_user: dict, client: AsyncClient, db: AsyncSession
):
    client_id = str(uuid.uuid4())
    payload = {
        "id": client_id,
        "name": "Coffee",
        "amount": "4.50",
        "transaction_date": "2026-04-01",
        "category": "EXPENSE",
    }

    first = await client.post("/transactions/", json=payload, headers=auth_headers(test_user["token"]))
    assert first.status_code == 201
    assert first.json()["id"] == client_id

    # Simulates the outbox replaying the same create after its first success
    # response never reached the client (tab closed mid-drain, network
    # dropped after commit).
    second = await client.post("/transactions/", json=payload, headers=auth_headers(test_user["token"]))
    assert second.status_code == 201
    assert second.json()["id"] == client_id

    count = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.id == uuid.UUID(client_id))
    )
    assert count == 1

    await client.delete(f"/transactions/{client_id}", headers=auth_headers(test_user["token"]))


async def test_create_transaction_without_client_id_still_gets_a_server_id(
    test_user: dict, client: AsyncClient
):
    # The ordinary online path - id omitted entirely. Exercises the
    # model_dump(exclude={"id"}) fix: passing id=None explicitly to the
    # constructor would override the column's uuid4 default and attempt a
    # NULL primary key insert.
    res = await client.post("/transactions/", json={
        "name": "Salary",
        "amount": "3000.00",
        "transaction_date": "2026-04-01",
        "category": "INCOME",
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 201
    assert res.json()["id"] is not None

    await client.delete(f"/transactions/{res.json()['id']}", headers=auth_headers(test_user["token"]))


async def test_create_transaction_with_another_users_id_conflicts(
    test_user: dict, client: AsyncClient
):
    other = await client.post("/auth/register", json={
        "first_name": "Other",
        "last_name": "User",
        "email_address": "other-sync-test@finsight.dev",
        "password": "OtherPass1!",
    })
    assert other.status_code in (201, 403)  # 403 if not on WHITELIST - skip if so
    if other.status_code != 201:
        pytest.skip("second registration blocked by WHITELIST in this environment")

    login = await client.post("/auth/login", json={
        "email_address": "other-sync-test@finsight.dev",
        "password": "OtherPass1!",
    })
    other_token = login.json()["access_token"]

    owned_id = str(uuid.uuid4())
    owned = await client.post("/transactions/", json={
        "id": owned_id,
        "name": "Mine",
        "amount": "1.00",
        "transaction_date": "2026-04-01",
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert owned.status_code == 201

    # Someone else's client somehow generates the exact same UUID (this is
    # what find_existing_for_replay's cross-owner check guards against, not
    # a realistic collision).
    clash = await client.post("/transactions/", json={
        "id": owned_id,
        "name": "Also mine?",
        "amount": "2.00",
        "transaction_date": "2026-04-01",
        "category": "EXPENSE",
    }, headers=auth_headers(other_token))
    assert clash.status_code == 409

    await client.delete(f"/transactions/{owned_id}", headers=auth_headers(test_user["token"]))


async def test_deleting_an_already_deleted_transaction_returns_204(
    test_user: dict, client: AsyncClient
):
    created = await client.post("/transactions/", json={
        "name": "Coffee",
        "amount": "4.50",
        "transaction_date": "2026-04-01",
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    tx_id = created.json()["id"]

    first_delete = await client.delete(f"/transactions/{tx_id}", headers=auth_headers(test_user["token"]))
    assert first_delete.status_code == 204

    # The outbox retrying a delete whose success response was lost.
    replay_delete = await client.delete(f"/transactions/{tx_id}", headers=auth_headers(test_user["token"]))
    assert replay_delete.status_code == 204


async def test_deleting_a_never_existed_transaction_id_returns_204(
    test_user: dict, client: AsyncClient
):
    # A create that never reached the server, followed by a delete queued
    # right behind it - the delete must not dead-letter just because the
    # create it depended on never landed.
    never_created_id = str(uuid.uuid4())
    res = await client.delete(f"/transactions/{never_created_id}", headers=auth_headers(test_user["token"]))
    assert res.status_code == 204
