# Finsight

> A personal finance tracker for monitoring expenses, income, and recurring payments.

---

## Features

- User registration and login (email/password)
- Social login (Google, GitHub)
- JWT-based session management
- Create, read, update, and delete transactions
- Recurring payments — auto-populate monthly bills and subscriptions
- Transaction search with debounced autocomplete
- Categorize transactions (income, expense, bill, subscription, savings, debt, etc.)
- Filter and paginate transaction history
- Demo mode for portfolio viewing (no registration required)

---

## Tech Stack

### Frontend

| Tool          | Purpose                    |
| ------------- | -------------------------- |
| Vite + React  | UI framework               |
| JavaScript    | UI logic and interactivity |

### Backend

| Tool        | Purpose               |
| ----------- | --------------------- |
| Python 3.12 | Runtime               |
| FastAPI     | API framework         |
| Uvicorn     | ASGI server           |
| uv          | Dependency management |

### Database & ORM

| Tool           | Purpose                 |
| -------------- | ----------------------- |
| Neon           | Serverless PostgreSQL   |
| SQLAlchemy 2.x | ORM (async)             |
| asyncpg        | Async PostgreSQL driver |
| Alembic        | Database migrations     |

### Auth

| Tool           | Purpose                                  |
| -------------- | ---------------------------------------- |
| PyJWT          | JWT issuing and validation               |
| Authlib        | Social OAuth2 (Google, GitHub)           |
| pwdlib[argon2] | Password hashing (Argon2)                |
| httpx          | Async HTTP client (OAuth token exchange) |

### Validation & Config

| Tool              | Purpose                     |
| ----------------- | --------------------------- |
| Pydantic v2       | Request/response validation |
| pydantic-settings | Environment config          |

### Testing

| Tool           | Purpose                       |
| -------------- | ----------------------------- |
| pytest         | Test runner                   |
| pytest-asyncio | Async test support            |
| httpx          | Async test client for FastAPI |

### Deployment

| Service | Purpose                         |
| ------- | ------------------------------- |
| Vercel  | Frontend hosting                |
| Render  | Backend hosting (Python-native) |
| Neon    | Managed PostgreSQL              |

---

## Project Structure

```
app/
├── main.py               # FastAPI app entrypoint, router registration
├── database.py           # Async SQLAlchemy engine and session factory
├── dependencies.py       # Shared FastAPI dependencies (get_db, get_current_user)
├── models/               # SQLAlchemy ORM models
│   ├── user.py
│   ├── transaction.py
│   ├── recurring_payment.py
│   └── category.py       # Category enum
├── schemas/              # Pydantic request/response schemas
├── routes/               # Route handlers grouped by domain
├── services/             # Business logic layer
└── core/                 # Config, security, rate limiting

tests/
├── conftest.py           # Test engine, fixtures, dependency overrides
├── test_auth.py
├── test_transactions.py
├── test_recurring_payments.py
└── test_users.py
```

---

## Data Model

| Entity           | Key Fields                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| User             | id, first_name, last_name, email_address, password_hash, provider      |
| Transaction      | id, user_id, name, amount, category, transaction_date, recurring_payment_id |
| RecurringPayment | id, user_id, name, amount, category, day_of_month, last_applied_month  |

---

## API Overview

| Method | Endpoint                          | Description                      | Auth |
| ------ | --------------------------------- | -------------------------------- | ---- |
| POST   | /auth/register                    | Register with email/password     | No   |
| POST   | /auth/login                       | Login, returns JWT               | No   |
| GET    | /auth/{provider}                  | Start social OAuth flow          | No   |
| GET    | /auth/{provider}/callback         | OAuth callback, returns JWT      | No   |
| GET    | /users/me                         | Get current user                 | Yes  |
| PATCH  | /users/me                         | Update current user              | Yes  |
| DELETE | /users/me                         | Delete current user              | Yes  |
| GET    | /transactions/                    | List transactions (paginated)    | Yes  |
| POST   | /transactions/                    | Create transaction               | Yes  |
| PATCH  | /transactions/{id}                | Update transaction               | Yes  |
| DELETE | /transactions/{id}                | Delete transaction               | Yes  |
| GET    | /recurring-payments/              | List recurring payments          | Yes  |
| POST   | /recurring-payments/              | Create recurring payment         | Yes  |
| PATCH  | /recurring-payments/{id}          | Update recurring payment         | Yes  |
| DELETE | /recurring-payments/{id}          | Delete recurring payment         | Yes  |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values.

```env
# Database
DATABASE_URL=postgresql+asyncpg://...

# Auth
SECRET_KEY=                        # generate: openssl rand -hex 32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# OAuth2 - Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OAuth2 - GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

REDIRECT_URI=http://localhost:8000/auth/{provider}/callback

# App
WHITELIST=["example@email.com"]
FRONTEND_URL=http://localhost:5173
DEV_URL=http://localhost:5173
```

---

## Local Development

```bash
# Install dependencies
uv sync --extra dev

# Copy and fill in environment variables
cp .env.example .env

# Run migrations
uv run alembic upgrade head

# Start dev server
uv run uvicorn app.main:app --reload

# Run tests
uv run pytest tests/ -v
```
