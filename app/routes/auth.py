from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import quote
import logging
import uuid
from app.schemas.user import RegisterRequest, LoginRequest, UserResponse, TokenResponse
from app.services.auth_service import register_user, login_user, refresh_session, logout_user, oauth_login, link_oauth_account
from app.services import user_service
from app.dependencies import get_db
from app.core.config import settings
from app.core.limiter import limiter
from app.core.oauth import oauth, fetch_oauth_userinfo, OAUTH_PROVIDERS

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)

_IS_SECURE = settings.FRONTEND_URL.startswith("https://")

_COOKIE_KWARGS = dict(
    key="refresh_token",
    httponly=True,
    secure=_IS_SECURE,
    samesite="none" if _IS_SECURE else "lax",  # "none" required for cross-origin (Vercel → Render)
    max_age=7 * 24 * 60 * 60,
    path="/",
)


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if data.email_address not in settings.WHITELIST:
        raise HTTPException(status_code=403, detail="Registration closed")
    user = await register_user(db, data)
    return user_service.to_user_response(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/30seconds")
async def login(request: Request, response: Response, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    access_token, refresh_token = await login_user(db, data)
    if refresh_token:
        response.set_cookie(value=refresh_token, **_COOKIE_KWARGS)
    return TokenResponse(access_token=access_token, token_type="bearer")


# Refresh mints access tokens and rotates a DB row on every call, so it needs
# a cap like /register and /login above. Deliberately looser than either: it
# fires once per ACCESS_TOKEN_EXPIRE_MINUTES per open tab, and the client's
# refresh mutex only dedupes within a single tab - several tabs expiring at
# once legitimately burst several calls, which is exactly what the grace
# period in refresh_session() absorbs. 20/minute leaves that burst untouched
# (it stays well under the cap) while still capping brute-force attempts
# against token hashes and cheap write amplification.
@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    access_token, new_refresh_token = await refresh_session(db, raw_token)
    response.set_cookie(value=new_refresh_token, **_COOKIE_KWARGS)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw_token = request.cookies.get("refresh_token")
    await logout_user(db, raw_token)
    response.delete_cookie(key="refresh_token", path="/")


@router.get("/{provider}/login")
async def oauth_login_redirect(provider: str, request: Request):
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    try:
        client = oauth.create_client(provider)
        redirect_uri = settings.REDIRECT_URI.format(provider=provider)
        return await client.authorize_redirect(request, redirect_uri)
    except Exception:
        # A misconfigured provider (missing client id/secret, bad redirect URI) would
        # otherwise surface as a raw unhandled error instead of ever reaching the
        # provider's consent screen (#126). Send the user back with a visible message.
        # The user-facing copy is deliberately vague, so log the real cause - without
        # this the handler is a black hole and a broken prod sign-in shows nothing at
        # all in the server logs.
        logger.exception("OAuth authorize redirect failed for provider=%s", provider)
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error={quote('Something went wrong signing in.')}")


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    client = oauth.create_client(provider)

    link_user_id = request.session.pop("link_user_id", None)

    try:
        token = await client.authorize_access_token(request)
        info = await fetch_oauth_userinfo(provider, client, token)
        if link_user_id:
            await link_oauth_account(db, provider, info, uuid.UUID(link_user_id))
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/?connected={provider}")
        _, refresh_token_raw = await oauth_login(db, provider, info)
    except HTTPException as exc:
        logger.warning("OAuth callback rejected for provider=%s: %s", provider, exc.detail)
        redirect_path = "/" if link_user_id else "/login"
        return RedirectResponse(url=f"{settings.FRONTEND_URL}{redirect_path}?error={quote(exc.detail)}")
    except Exception:
        # Covers state/nonce mismatch, token exchange, the provider's userinfo call and
        # oauth_login. All of them collapse into the same opaque message for the user,
        # so the traceback is the only way to tell which one actually failed.
        logger.exception("OAuth callback failed for provider=%s", provider)
        redirect_path = "/" if link_user_id else "/login"
        message = "Something went wrong connecting that account." if link_user_id else "Something went wrong signing in."
        return RedirectResponse(url=f"{settings.FRONTEND_URL}{redirect_path}?error={quote(message)}")

    response = RedirectResponse(url=f"{settings.FRONTEND_URL}/")
    response.set_cookie(value=refresh_token_raw, **_COOKIE_KWARGS)
    return response
