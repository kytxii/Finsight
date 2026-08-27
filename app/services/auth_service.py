from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta
import uuid
from app.schemas import RegisterRequest, LoginRequest, OAuthUserInfo
from app.models import User
from app.models.refresh_token import RefreshToken
from app.models.oauth_account import OAuthAccount
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token, generate_refresh_token, hash_token

REFRESH_TOKEN_EXPIRE_DAYS = 7

# How long a just-rotated refresh token is still tolerated after being revoked.
# Covers near-simultaneous requests racing the same token (multiple tabs, React
# StrictMode double-invoke) — a request landing in this window is resolved to the
# live successor instead of hard-failing with a 401.
REFRESH_GRACE_PERIOD = timedelta(seconds=10)
# Bound on how far we'll walk a chain of replaced_by_id links (one hop per
# concurrent request that lost the race) before giving up.
REFRESH_GRACE_MAX_HOPS = 5


async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    result = await db.execute(select(User).where(User.email_address == data.email_address))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        email_address=data.email_address,
        password_hash=hash_password(data.password)
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _issue_refresh_token(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, RefreshToken]:
    raw, token_hash = generate_refresh_token()
    record = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(record)
    return raw, record


async def _rotate_refresh_token(db: AsyncSession, record: RefreshToken) -> tuple[str, str]:
    """Revoke `record` and issue its successor, chaining the two together.

    The chain (`replaced_by_id`) is what lets a near-simultaneous request that
    presents this same token just after it's been rotated get resolved to the
    live successor instead of hard-failing — see refresh_session().
    """
    record.is_revoked = True
    record.revoked_at = datetime.now(timezone.utc)
    access_token = create_access_token(str(record.user_id))
    new_raw, new_record = await _issue_refresh_token(db, record.user_id)
    await db.flush()  # assign new_record.id so we can chain to it
    record.replaced_by_id = new_record.id
    return access_token, new_raw


async def login_user(db: AsyncSession, data: LoginRequest) -> tuple[str, str]:
    result = await db.execute(select(User).where(User.email_address == data.email_address))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(str(user.id))
    refresh_token_raw = None
    if data.remember_me:
        refresh_token_raw, _ = await _issue_refresh_token(db, user.id)
    await db.commit()
    return access_token, refresh_token_raw


async def refresh_session(db: AsyncSession, raw_token: str) -> tuple[str, str]:
    token_hash = hash_token(raw_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if not (record and not record.is_revoked and record.expires_at > now):
        # Not a live token as-is — if it was revoked moments ago by a near-simultaneous
        # request rotating the same token, follow the rotation chain to whatever token
        # replaced it instead of failing outright.
        hops = 0
        while (
            record
            and record.is_revoked
            and record.revoked_at
            and now - record.revoked_at <= REFRESH_GRACE_PERIOD
            and record.replaced_by_id
            and hops < REFRESH_GRACE_MAX_HOPS
        ):
            result = await db.execute(select(RefreshToken).where(RefreshToken.id == record.replaced_by_id))
            record = result.scalar_one_or_none()
            hops += 1

    if not (record and not record.is_revoked and record.expires_at > now):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    access_token, new_raw = await _rotate_refresh_token(db, record)
    await db.commit()
    return access_token, new_raw


async def logout_user(db: AsyncSession, raw_token: str | None) -> None:
    if not raw_token:
        return
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record:
        record.is_revoked = True
        await db.commit()


async def oauth_login(db: AsyncSession, provider: str, info: OAuthUserInfo) -> tuple[str, str]:
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == info.provider_user_id,
        )
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        user_id = oauth_account.user_id
    else:
        if not info.email_verified:
            raise HTTPException(status_code=403, detail="Email not verified by provider")

        result = await db.execute(select(User).where(User.email_address == info.email))
        user = result.scalar_one_or_none()

        if not user:
            if info.email not in settings.WHITELIST:
                raise HTTPException(status_code=403, detail="Registration closed")
            user = User(
                first_name=info.first_name,
                last_name=info.last_name,
                email_address=info.email,
                password_hash=None,
                avatar=info.avatar,
            )
            db.add(user)
            await db.flush()

        user_id = user.id
        db.add(OAuthAccount(user_id=user_id, provider=provider, provider_user_id=info.provider_user_id))

    access_token = create_access_token(str(user_id))
    refresh_token_raw, _ = await _issue_refresh_token(db, user_id)
    await db.commit()
    return access_token, refresh_token_raw
