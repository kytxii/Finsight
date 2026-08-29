from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException
from app.core.config import settings
from app.schemas import OAuthUserInfo

oauth = OAuth()

OAUTH_PROVIDERS = {"google", "github"}

oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

oauth.register(
    name="github",
    client_id=settings.GITHUB_CLIENT_ID,
    client_secret=settings.GITHUB_CLIENT_SECRET,
    access_token_url="https://github.com/login/oauth/access_token",
    authorize_url="https://github.com/login/oauth/authorize",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "read:user user:email"},
)


async def fetch_oauth_userinfo(provider: str, client, token: dict) -> OAuthUserInfo:
    if provider == "google":
        userinfo = token.get("userinfo")
        if not userinfo:
            resp = await client.get("https://openidconnect.googleapis.com/v1/userinfo", token=token)
            userinfo = resp.json()
        return OAuthUserInfo(
            provider_user_id=userinfo["sub"],
            email=userinfo["email"],
            email_verified=userinfo.get("email_verified", False),
            first_name=userinfo.get("given_name") or "",
            last_name=userinfo.get("family_name") or "",
            avatar=userinfo.get("picture"),
        )

    # github
    profile_resp = await client.get("user", token=token)
    profile = profile_resp.json()
    emails_resp = await client.get("user/emails", token=token)
    emails = emails_resp.json()

    primary = next((e for e in emails if e.get("primary")), None)
    whitelisted = next((e for e in emails if e.get("verified") and e.get("email") in settings.WHITELIST), None)
    chosen = whitelisted or primary
    if not chosen:
        raise HTTPException(status_code=400, detail="No email available from GitHub account")

    name = (profile.get("name") or "").strip()
    first_name, _, last_name = name.partition(" ")
    return OAuthUserInfo(
        provider_user_id=str(profile["id"]),
        email=chosen["email"],
        email_verified=bool(chosen.get("verified", False)),
        first_name=first_name or profile.get("login", "GitHub"),
        last_name=last_name,
        avatar=profile.get("avatar_url"),
    )
