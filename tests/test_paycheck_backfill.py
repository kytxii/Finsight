import asyncio
from collections import Counter
from datetime import date
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Paycheck, PaycheckSchedule
from app.services.paycheck_service import _add_months, _backfill_paychecks
from tests.conftest import TestSessionLocal
from tests.test_estimated_savings import auth_headers, clean_finance, _create_monthly_schedule


async def test_concurrent_backfill_does_not_duplicate_paychecks(test_user: dict, client: AsyncClient, clean_finance):
    """_backfill_paychecks does a check-then-insert with no DB-level guard on
    its own - two requests racing (e.g. a double-fetch on page load) can both
    see a pay_date as missing and both try to insert it. Real duplicates were
    found in production data from exactly this (#paycheck-dupes). Regression
    test: run two genuinely concurrent backfills against real Postgres and
    confirm the uq_paychecks_schedule_id_pay_date constraint + ON CONFLICT DO
    NOTHING (not just the in-memory existing_dates check) prevents the dupe."""
    token = test_user["token"]
    uid = UUID(test_user["id"])
    month_start = date.today().replace(day=1)

    schedule_data = await _create_monthly_schedule(client, token, _add_months(month_start, -3))
    schedule_id = UUID(schedule_data["id"])

    async def run_backfill():
        async with TestSessionLocal() as session:
            schedule = await session.get(PaycheckSchedule, schedule_id)
            await _backfill_paychecks([schedule], uid, session)
            await session.commit()

    # Two independent sessions racing against the same schedule - this is what
    # actually exercises the ON CONFLICT path, unlike calling it twice
    # sequentially (the second call's own existing_dates check would already
    # skip everything without ever touching the constraint).
    await asyncio.gather(run_backfill(), run_backfill())

    async with TestSessionLocal() as session:
        rows = (await session.scalars(
            select(Paycheck).where(Paycheck.schedule_id == schedule_id)
        )).all()

    counts = Counter((r.schedule_id, r.pay_date) for r in rows)
    duplicates = {k: v for k, v in counts.items() if v > 1}
    assert duplicates == {}, f"duplicate paycheck rows created: {duplicates}"
