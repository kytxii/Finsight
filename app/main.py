import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routes import transaction, users, auth, recurring_payment, paycheck, tip_deposit, import_, installment, credit_card, analytics, assistant
from app.core.config import settings
from app.core.limiter import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(redirect_slashes=False)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler) # pyright: ignore[reportArgumentType]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://finsight-[\w-]+-kytxii\.vercel\.app",
    allow_origins=[settings.FRONTEND_URL] if settings.FRONTEND_URL else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Required by Authlib to store OAuth state/nonce during the redirect handshake
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY, same_site="none", https_only=True)

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"status": "ok"}


# Reachability probe for the client's connectivity tracker (#204). Deliberately
# touches nothing - no DB session, no auth - so a failure means the service is
# genuinely unreachable rather than merely unhealthy. Note it does NOT dodge a
# free-tier cold start: any request wakes the instance, so this still takes the
# full ~50s when Render has spun down. Its value is an unambiguous signal, not
# a fast one.
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}

app.include_router(transaction.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(recurring_payment.router)
app.include_router(paycheck.router)
app.include_router(tip_deposit.router)
app.include_router(import_.router)
app.include_router(installment.router)
app.include_router(credit_card.router)
app.include_router(analytics.router)
app.include_router(assistant.router)