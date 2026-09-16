# Finsight

> A personal finance tracker built around real cash flow: paychecks, bills, credit cards, installments, and tips, with safe to spend and savings forecasts built in.

---

## Features

- **Transactions** — create, edit, delete, search, sort, and paginate, categorized as income, expense, bill, subscription, savings, debt, reimbursement, or tips
- **Paychecks** — recurring pay schedules (weekly, biweekly, monthly, semi-monthly), a running checking balance anchored to a real snapshot, safe to spend projected through the next payday, and an estimated savings forecast for the month
- **Recurring payments** — bills and subscriptions auto post on their due date each month, with pending confirm/skip for estimate style bills
- **Installments** — fixed term payment plans with monthly payment math and a cash flow burden gauge against available cash
- **Credit cards** — track a statement balance as a payment, allocate charges against it (new or reused from an existing transaction), and auto settle a charge once it's fully paid
- **Tips** — cash tips tracked separately from banked money until deposited, with cash on hand scoped to the month and one shot convert between a tip and a deposit
- **Import** — CSV and PDF statement import with column detection, merchant name cleanup (optional AI assist), and dedup against existing transactions
- **Auth** — email/password with Argon2 hashing, social login (Google, GitHub), JWT access tokens with rotating refresh tokens
- **Demo mode** — a fully interactive, writable mock backend running entirely in `localStorage` — no registration required, and every calculation mirrors the real backend's rules
- **Responsive UI** — distinct desktop and mobile layouts, not a single breakpoint-squeezed one

---

## Tech Stack

### Frontend

| Tool                   | Purpose                          |
| ----------------------- | --------------------------------- |
| Vite + React 19        | UI framework                      |
| Tailwind CSS 4         | Styling                           |
| Recharts               | Charts (trend lines, breakdowns)  |
| React Router           | Client side routing               |
| Axios                  | HTTP client                       |
| Vitest + Testing Library | Unit and component tests        |

### Backend

| Tool        | Purpose               |
| ----------- | ---------------------- |
| Python 3.12 | Runtime                |
| FastAPI     | API framework          |
| Uvicorn     | ASGI server            |
| uv          | Dependency management  |

### Database & ORM

| Tool           | Purpose                  |
| -------------- | -------------------------- |
| Neon           | Serverless PostgreSQL    |
| SQLAlchemy 2.x | ORM (async)               |
| asyncpg        | Async PostgreSQL driver  |
| Alembic        | Database migrations       |

### Auth

| Tool           | Purpose                                    |
| -------------- | -------------------------------------------- |
| PyJWT          | JWT issuing and validation                  |
| Authlib        | Social OAuth2 (Google, GitHub)              |
| pwdlib[argon2] | Password hashing (Argon2)                   |
| httpx          | Async HTTP client (OAuth token exchange)    |

### Validation & Config

| Tool              | Purpose                       |
| ----------------- | -------------------------------- |
| Pydantic v2       | Request/response validation   |
| pydantic-settings | Environment config             |

### Testing

| Tool           | Purpose                          |
| -------------- | ----------------------------------- |
| pytest         | Backend test runner                |
| pytest-asyncio | Async test support                  |
| httpx          | Async test client for FastAPI      |
| Vitest         | Frontend unit test runner          |
| Testing Library | React component tests             |

### Deployment

| Service | Purpose                          |
| ------- | ----------------------------------- |
| Vercel  | Frontend hosting (production + preview) |
| Render  | Backend hosting (production only) |
| Neon    | Managed PostgreSQL - `main` branch for production, a separate branch for the test suite |

Preview deployments are frontend-only. There is no preview backend, so Vercel previews
fall through to the production API and therefore read and write production data - verify
anything involving mutations locally (`npm run dev` against `localhost:8000`) rather than
on a preview URL.

---

## Project Structure

```
app/
├── main.py          # FastAPI app entrypoint, router registration
├── database.py      # Async SQLAlchemy engine and session factory
├── dependencies.py  # Shared FastAPI dependencies (get_db, get_current_user)
├── models/          # SQLAlchemy ORM models
├── schemas/         # Pydantic request/response schemas
├── routes/          # Route handlers grouped by domain, thin - no business logic
├── services/        # Business logic layer
└── core/            # Config, security, rate limiting

migrations/
└── versions/  # Alembic migrations

tests/
├── conftest.py  # Test engine, fixtures, dependency overrides
└── test_*.py    # One file per domain, integration tests against a real DB

frontend/
└── src/
    ├── pages/    # Dashboard.jsx / MobileDashboard.jsx and top level routes
    ├── components/
    │   ├── desktop/    # Desktop-only components
    │   ├── mobile/     # Mobile-only components
    │   ├── shared/     # Used by both platforms
    │   └── skeletons/  # Loading state placeholders, same desktop/mobile/shared split
    ├── hooks/    # Same desktop/mobile/shared split as components
    ├── api/      # One file per backend domain, plus demoStore.js (the demo mode backend)
    ├── utils/    # Pure calculation/formatting helpers, shared between the real app and demo mode
    ├── context/  # AuthContext
    └── test/     # Vitest setup
```

---

## Data Model

| Entity                        | Purpose                                                       |
| ------------------------------ | ---------------------------------------------------------------- |
| User                           | Account, auth provider, spending reserve                      |
| Transaction                    | The core ledger row — every income and expense event         |
| RecurringPayment                | A bill/subscription template that posts a Transaction monthly |
| PaycheckSchedule / Paycheck     | A pay frequency and its individual pay dates/amounts          |
| BalanceAnchor                  | A real world checking balance snapshot the running balance builds forward from |
| Installment                    | A fixed term payment plan that posts a Transaction monthly until paid off |
| TipDeposit                     | Cash tips moved from hand to bank                              |
| CreditCardPayment / CreditCardCharge / CreditCardChargeAllocation | A statement balance, the charges settled against it, and the join between them |

---

## API Overview

Routes are grouped by domain, each behind JWT auth except where noted. Full request/response shapes are in `app/schemas/`.

| Prefix                    | Covers                                                              | Auth |
| --------------------------- | ---------------------------------------------------------------------- | ---- |
| `/auth`                    | Register, login, social OAuth, token refresh/logout                   | Mixed |
| `/users`                   | Current user profile                                                  | Yes  |
| `/transactions`            | CRUD, pagination, locate-in-table support                             | Yes  |
| `/recurring-payments`      | CRUD, upcoming bills, confirm/skip pending estimates                  | Yes  |
| `/paychecks`               | Schedules, balance anchor, running balance, safe to spend, estimated savings | Yes  |
| `/installments`            | CRUD, monthly payment math, cash flow insights                        | Yes  |
| `/tip-deposits`            | CRUD, cash on hand, convert to/from a transaction                     | Yes  |
| `/credit-card-payments`    | Payments, charge allocation, settlement                               | Yes  |
| `/imports`                 | CSV/PDF upload, column detection, name cleanup, commit                | Yes  |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values.

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/finsight

# Dedicated to the automated test suite (pytest) - must be a different
# database than DATABASE_URL. A separate Neon branch works well.
TEST_DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/finsight_test

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

# AI (optional) - enables the "Clean up names with AI" import fallback
GEMINI_API_KEY=
```

---

## Local Development

### Backend

```bash
# Install dependencies
uv sync --extra dev

# Copy and fill in environment variables
cp .env.example .env

# Run migrations
uv run alembic upgrade head

# Start dev server
uv run uvicorn app.main:app --reload

# Run tests (needs TEST_DATABASE_URL set, separate from DATABASE_URL)
uv run pytest tests/ -v
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm run test

# Lint
npm run lint

# Production build
npm run build
```
