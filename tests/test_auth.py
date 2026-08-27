import pytest                                                                   
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from tests.conftest import TEST_EMAIL, TEST_PASSWORD
from app.core.limiter import limiter

limiter.enabled = False

async def test_register_success(test_user: dict):
    assert "id" in test_user
    assert test_user["email"] == TEST_EMAIL

async def test_register_not_whitelisted(client: AsyncClient):
    res = await client.post("/auth/register", json={
        "first_name": "Hacker",
        "last_name": "Person",
        "email_address": "stranger@example.com",
        "password": "TestPassword1!",
    })
    assert res.status_code == 403


async def test_login_success(test_user: dict, client: AsyncClient):
    res = await client.post("/auth/login", json={
        "email_address": test_user["email"],
        "password": test_user["password"],
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_login_wrong_password(test_user: dict, client: AsyncClient):
    res = await client.post("/auth/login", json={
        "email_address": test_user["email"],
        "password": "WrongPassword1!",
    })
    assert res.status_code == 401


async def test_login_unknown_email(client: AsyncClient):
    res = await client.post("/auth/login", json={
        "email_address": "nobody@finsight.dev",
        "password": "TestPassword1!",
    })
    assert res.status_code == 401


async def test_refresh_rotates_token(test_user: dict, client: AsyncClient):
    login_res = await client.post("/auth/login", json={
        "email_address": test_user["email"],
        "password": test_user["password"],
        "remember_me": True,
    })
    raw_token = login_res.cookies.get("refresh_token")
    assert raw_token

    res = await client.post("/auth/refresh", cookies={"refresh_token": raw_token})
    assert res.status_code == 200
    assert "access_token" in res.json()
    assert res.cookies.get("refresh_token") != raw_token


async def test_refresh_tolerates_near_simultaneous_requests(test_user: dict, client: AsyncClient):
    """#123 - a second request racing the same (about-to-rotate) refresh token
    should be resolved to the live successor, not hard-fail with a 401."""
    login_res = await client.post("/auth/login", json={
        "email_address": test_user["email"],
        "password": test_user["password"],
        "remember_me": True,
    })
    raw_token = login_res.cookies.get("refresh_token")
    assert raw_token

    res1 = await client.post("/auth/refresh", cookies={"refresh_token": raw_token})
    res2 = await client.post("/auth/refresh", cookies={"refresh_token": raw_token})

    assert res1.status_code == 200
    assert res2.status_code == 200


async def test_refresh_rejects_stale_token_outside_grace_period(test_user: dict, client: AsyncClient, db: AsyncSession):
    from datetime import datetime, timedelta, timezone
    from app.models.refresh_token import RefreshToken

    login_res = await client.post("/auth/login", json={
        "email_address": test_user["email"],
        "password": test_user["password"],
        "remember_me": True,
    })
    raw_token = login_res.cookies.get("refresh_token")

    res = await client.post("/auth/refresh", cookies={"refresh_token": raw_token})
    assert res.status_code == 200

    # Back-date the now-revoked original token past the grace window and retry
    # with it - it should no longer be tolerated.
    from app.core.security import hash_token
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    record = result.scalar_one()
    record.revoked_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await db.commit()

    res = await client.post("/auth/refresh", cookies={"refresh_token": raw_token})
    assert res.status_code == 401