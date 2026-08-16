from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import quote
from app.schemas.user import RegisterRequest, LoginRequest, UserResponse, TokenResponse
from app.services.auth_service import register_user, login_user, refresh_session, logout_user, oauth_login
from app.dependencies import get_db
from app.core.config import settings
from app.core.limiter import limiter
from app.core.oauth import oauth, fetch_oauth_userinfo

router = APIRouter(prefix="/auth", tags=["auth"])

OAUTH_PROVIDERS = {"google", "github"}

# `Secure` cookies are silently dropped by the browser on a plain-HTTP origin,
# which local dev always is (FRONTEND_URL=http://localhost:5173) - hardcoding
# secure=True broke "remember me" there entirely, not just in production
# (#106). Derive both from the same FRONTEND_URL that already drives CORS,
# instead of adding a separate env flag. `SameSite=None` requires `Secure`
# per spec, so the insecure/dev case pairs with `Lax` instead - fine for local
# dev's same-origin-via-Vite-proxy requests.
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
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/30seconds")
async def login(request: Request, response: Response, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    access_token, refresh_token = await login_user(db, data)
    if refresh_token:
        response.set_cookie(value=refresh_token, **_COOKIE_KWARGS)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/refresh", response_model=TokenResponse)
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
    client = oauth.create_client(provider)
    redirect_uri = settings.REDIRECT_URI.format(provider=provider)
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    client = oauth.create_client(provider)

    try:
        token = await client.authorize_access_token(request)
        info = await fetch_oauth_userinfo(provider, client, token)
        _, refresh_token_raw = await oauth_login(db, provider, info)
    except HTTPException as exc:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error={quote(exc.detail)}")
    except Exception:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error={quote('Something went wrong signing in.')}")

    response = RedirectResponse(url=f"{settings.FRONTEND_URL}/")
    response.set_cookie(value=refresh_token_raw, **_COOKIE_KWARGS)
    return response
