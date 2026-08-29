import pytest
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient
from app.models import User, OAuthAccount
from app.schemas import OAuthUserInfo
from app.services.auth_service import link_oauth_account


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def clean_oauth(test_user: dict, db: AsyncSession):
    yield
    from sqlalchemy import delete
    await db.execute(delete(OAuthAccount).where(OAuthAccount.user_id == UUID(test_user["id"])))
    await db.commit()


def _info(provider_user_id: str) -> OAuthUserInfo:
    return OAuthUserInfo(
        provider_user_id=provider_user_id,
        email="linked@example.com",
        email_verified=True,
        first_name="Linked",
        last_name="User",
    )


# One test_user-driven test per function below (registration is rate-limited
# to 5/min), so closely-related assertions are grouped into a single test.


async def test_connections_http_flow(test_user: dict, client: AsyncClient, db: AsyncSession, clean_oauth):
    token = test_user["token"]

    res = await client.get("/users/me/connections", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json() == []

    res = await client.post("/users/me/connections/facebook/start", headers=auth_headers(token))
    assert res.status_code == 404

    res = await client.post("/users/me/connections/google/start", headers=auth_headers(token))
    assert res.status_code == 204
    # Stashed in the session so /auth/{provider}/callback (unauthenticated,
    # reached via full browser redirect) knows who initiated the link.
    assert any(c.lower().startswith("session=") for c in res.headers.get_list("set-cookie"))

    res = await client.delete("/users/me/connections/google", headers=auth_headers(token))
    assert res.status_code == 404  # nothing actually linked yet

    uid = UUID(test_user["id"])
    db.add(OAuthAccount(user_id=uid, provider="google", provider_user_id="ext-abc"))
    await db.commit()

    res = await client.get("/users/me/connections", headers=auth_headers(token))
    assert res.json() == ["google"]

    # test_user was created via /auth/register, so it has a password -
    # unlinking its only OAuth connection is fine, it's not the only way in.
    res = await client.delete("/users/me/connections/google", headers=auth_headers(token))
    assert res.status_code == 204

    res = await client.get("/users/me/connections", headers=auth_headers(token))
    assert res.json() == []


async def test_start_link_requires_auth(client: AsyncClient):
    res = await client.post("/users/me/connections/google/start")
    assert res.status_code == 401


async def test_unlink_blocks_removing_only_signin_method(test_user: dict, client: AsyncClient, db: AsyncSession, clean_oauth):
    """A password-less (OAuth-only) account can't unlink its last provider -
    same reasoning as never letting a password account drop its password
    with no OAuth fallback (#25)."""
    uid = UUID(test_user["id"])
    db.add(OAuthAccount(user_id=uid, provider="google", provider_user_id="ext-def"))
    await db.execute(User.__table__.update().where(User.id == uid).values(password_hash=None))
    await db.commit()

    res = await client.delete("/users/me/connections/google", headers=auth_headers(test_user["token"]))
    assert res.status_code == 400
    assert "only way to sign in" in res.json()["detail"]

    # Restore the password so teardown isn't left with a password-less account.
    await db.execute(User.__table__.update().where(User.id == uid).values(password_hash="restored"))
    await db.commit()


async def test_link_oauth_account_service(test_user: dict, db: AsyncSession, clean_oauth):
    """Service-level (#25): idempotent for the same account, rejected for a
    provider identity already linked to a *different* one - never silently
    reassigned."""
    uid = UUID(test_user["id"])

    same_info = _info("ext-same")
    await link_oauth_account(db, "github", same_info, uid)
    await link_oauth_account(db, "github", same_info, uid)  # no error - idempotent
    result = await db.execute(select(OAuthAccount).where(OAuthAccount.user_id == uid, OAuthAccount.provider == "github"))
    assert len(result.scalars().all()) == 1

    other_id = UUID(int=uid.int ^ 1)
    with pytest.raises(Exception) as exc_info:
        await link_oauth_account(db, "github", same_info, other_id)
    assert "already linked to a different" in str(exc_info.value.detail)
