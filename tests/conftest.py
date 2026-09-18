import pytest                                                                            
from collections.abc import AsyncGenerator                                               
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import delete
from app.main import app
from app.dependencies import get_db
from app.core.config import settings
from app.core.limiter import limiter
from app.models import User

TEST_EMAIL = "test@finsight.dev"
TEST_PASSWORD = "TestPassword1!"

if not settings.TEST_DATABASE_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL is not set. Point it at a database dedicated to "
        "the test suite (e.g. a separate Neon branch) - refusing to fall "
        "back to DATABASE_URL."
    )
if settings.TEST_DATABASE_URL == settings.DATABASE_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL must not be the same as DATABASE_URL - this "
        "suite mutates and deletes data, and must not run against whatever "
        "database local dev or production is pointed at."
    )

# Rate limits are production behaviour, not something the suite should be
# subject to: /auth/register is capped at 5/minute and the test_user fixture
# registers once per test, so any file with more than five tests 429s when run
# on its own. tests/test_auth.py already did this for itself; lifting it to
# conftest applies the same rule to every file rather than only the one that
# happened to hit the limit first.
limiter.enabled = False

test_engine = create_async_engine(
    settings.TEST_DATABASE_URL,
    connect_args={"ssl": True},
    poolclass=NullPool,
)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def test_user(client: AsyncClient, db: AsyncSession) -> AsyncGenerator[dict, None]:
    await db.execute(delete(User).where(User.email_address == TEST_EMAIL))
    await db.commit()

    res = await client.post("/auth/register", json={
        "first_name": "Test",
        "last_name": "User",
        "email_address": TEST_EMAIL,
        "password": TEST_PASSWORD,
    })
    assert res.status_code == 201
    user_id = res.json()["id"]

    res = await client.post("/auth/login", json={
        "email_address": TEST_EMAIL,
        "password": TEST_PASSWORD,
    })
    token = res.json()["access_token"]

    yield {"id": user_id, "email": TEST_EMAIL, "password": TEST_PASSWORD, "token": token}

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()