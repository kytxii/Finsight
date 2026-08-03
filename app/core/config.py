from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    WHITELIST: list[str]
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