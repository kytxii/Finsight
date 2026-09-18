from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    SECRET_KEY: str
    WHITELIST: list[str]
    # Who sees the dev tools panel. Config-driven rather than a column: there
    # is no role model, and WHITELIST already decides who can hold an account
    # at all. Defaults to empty so a missing entry denies rather than grants.
    ADMIN_EMAILS: list[str] = []
    FRONTEND_URL: str
    DEV_URL: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    REDIRECT_URI: str

    GEMINI_API_KEY: str | None = None

    model_config = {"env_file": ".env"}

settings = Settings() # pyright: ignore[reportCallIssue]