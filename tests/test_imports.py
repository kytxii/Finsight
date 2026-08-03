import io
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Transaction
from app.routes import import_ as import_routes
from app.services.ai_name_cleanup import AiCleanupUnavailable


def _build_pdf(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in lines:
        c.drawString(50, y, line)
        y -= 14
    c.showPage()
    c.save()
    return buf.getvalue()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SIMPLE_CSV = (
    b"Transaction Date,Amount,Description\n"
    b"04/01/2026,-45.00,Whole Foods\n"
    b"04/02/2026,2500.00,Employer Inc\n"
)

# Real-world Bank of America export shape: a summary block (beginning/ending
# balance, totals) precedes the actual header row, and the transaction table
# itself opens with a "Beginning balance as of ..." marker row with no amount.
BOFA_STYLE_CSV = (
    b"Description,,Summary Amt.\n"
    b"Beginning balance as of 04/01/2026,,\"1,000.00\"\n"
    b"Total credits,,\"2,500.00\"\n"
    b"Total debits,,\"-45.00\"\n"
    b"Ending balance as of 04/30/2026,,\"3,455.00\"\n"
    b"\n"
    b"Date,Description,Amount,Running Bal.\n"
    b"04/01/2026,Beginning balance as of 04/01/2026,,\"1,000.00\"\n"
    b"04/01/2026,Whole Foods,\"-45.00\",\"955.00\"\n"
    b"04/02/2026,Employer Inc,\"2,500.00\",\"3,455.00\"\n"
)


@pytest.fixture
async def cleanup_imports(test_user: dict, db: AsyncSession):
    yield
    await db.execute(delete(Transaction).where(Transaction.created_by == test_user["id"]))
    await db.commit()


async def test_preview_auto_detects_columns(test_user: dict, client: AsyncClient, cleanup_imports):
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", SIMPLE_CSV, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    assert len(data["rows"]) == 2

    negative_row = next(r for r in data["rows"] if r["name"] == "Whole Foods")
    assert negative_row["amount"] == "45.00"
    assert negative_row["category"] == "EXPENSE"
    assert negative_row["is_duplicate"] is False

    positive_row = next(r for r in data["rows"] if r["name"] == "Employer Inc")
    assert positive_row["category"] == "INCOME"


async def test_preview_skips_summary_preamble_and_balance_marker_row(
    test_user: dict, client: AsyncClient, cleanup_imports
):
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", BOFA_STYLE_CSV, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    # The "Beginning balance as of ..." row is a running-balance marker, not a
    # real transaction, and the preamble rows above the real header never
    # reach row parsing at all.
    assert len(data["rows"]) == 2
    names = {r["name"] for r in data["rows"]}
    assert names == {"Whole Foods", "Employer Inc"}


async def test_preview_flags_duplicate(test_user: dict, client: AsyncClient, cleanup_imports):
    existing = await client.post("/transactions/", json={
        "name": "Whole Foods",
        "amount": "45.00",
        "transaction_date": "2026-04-01",
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert existing.status_code == 201
    existing_id = existing.json()["id"]

    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", SIMPLE_CSV, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    dup_row = next(r for r in data["rows"] if r["name"] == "Whole Foods")
    assert dup_row["is_duplicate"] is True
    assert dup_row["duplicate_transaction_id"] == existing_id
    assert dup_row["duplicate_transaction"] == {
        "name": "Whole Foods", "amount": "45.00", "transaction_date": "2026-04-01",
    }

    clean_row = next(r for r in data["rows"] if r["name"] == "Employer Inc")
    assert clean_row["is_duplicate"] is False
    assert clean_row["duplicate_transaction"] is None


async def test_preview_flags_duplicate_with_similar_but_not_exact_name(test_user: dict, client: AsyncClient, cleanup_imports):
    # A manually entered "Cobblestone" should still be caught as a duplicate
    # against an imported "Cobblestone Auto Spa" on the same date/amount, even
    # though the names aren't an exact match.
    existing = await client.post("/transactions/", json={
        "name": "Cobblestone",
        "amount": "29.00",
        "transaction_date": "2026-04-24",
        "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert existing.status_code == 201
    existing_id = existing.json()["id"]

    csv_bytes = b"Transaction Date,Amount,Description\n04/24/2026,-29.00,Cobblestone Auto Spa\n"
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", csv_bytes, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    dup_row = data["rows"][0]
    assert dup_row["name"] == "Cobblestone Auto Spa"
    assert dup_row["is_duplicate"] is True
    assert dup_row["duplicate_transaction_id"] == existing_id
    assert dup_row["duplicate_transaction"]["name"] == "Cobblestone"


async def test_preview_does_not_flag_short_names_as_duplicates_on_date_amount_alone(
    test_user: dict, client: AsyncClient, cleanup_imports
):
    # Short names (< 4 chars) are excluded from the fuzzy match so a
    # coincidental same-day, same-amount row with an unrelated short name
    # ("CVS") doesn't get wrongly flagged.
    existing = await client.post("/transactions/", json={
        "name": "CVS", "amount": "12.00", "transaction_date": "2026-04-24", "category": "EXPENSE",
    }, headers=auth_headers(test_user["token"]))
    assert existing.status_code == 201

    csv_bytes = b"Transaction Date,Amount,Description\n04/24/2026,-12.00,Unrelated Merchant\n"
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", csv_bytes, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    row = res.json()["rows"][0]
    assert row["is_duplicate"] is False


async def test_commit_creates_transactions(test_user: dict, client: AsyncClient, cleanup_imports):
    res = await client.post("/imports/commit", json={
        "rows": [
            {"name": "Whole Foods", "amount": "45.00", "transaction_date": "2026-04-01", "category": "EXPENSE", "skip": False},
            {"name": "Employer Inc", "amount": "2500.00", "transaction_date": "2026-04-02", "category": "INCOME", "skip": True},
        ],
    }, headers=auth_headers(test_user["token"]))
    assert res.status_code == 200
    data = res.json()
    assert data["created_count"] == 1
    assert len(data["transactions"]) == 1
    assert data["transactions"][0]["name"] == "Whole Foods"

    tx_res = await client.get("/transactions/", headers=auth_headers(test_user["token"]))
    names = [t["name"] for t in tx_res.json()]
    assert "Whole Foods" in names
    assert "Employer Inc" not in names


async def test_preview_parses_pdf_statement(test_user: dict, client: AsyncClient, cleanup_imports):
    pdf_bytes = _build_pdf([
        "JANE DOE   Account # 0000 0000 0000   January 1, 2026 to January 31, 2026",
        "Deposits and other additions",
        "Date Description Amount",
        "01/05/26 EMPLOYER INC DIRECT DEP 2,500.00",
        "Total deposits and other additions $2,500.00",
        "ATM and debit card subtractions",
        "Date Description Amount",
        "01/06/26 GROCERY STORE #12 ANYTOWN ST -88.40",
        "Total ATM and debit card subtractions -$88.40",
    ])

    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.pdf", pdf_bytes, "application/pdf")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    assert data["source_format"] == "pdf"
    assert len(data["rows"]) == 2

    deposit_row = next(r for r in data["rows"] if r["name"] == "EMPLOYER INC DIRECT DEP")
    assert deposit_row["amount"] == "2500.00"
    assert deposit_row["category"] == "INCOME"

    expense_row = next(r for r in data["rows"] if r["name"] == "GROCERY STORE #12 ANYTOWN ST")
    assert expense_row["amount"] == "88.40"
    assert expense_row["category"] == "EXPENSE"


async def test_amazon_and_venmo_income_default_to_reimbursement(test_user: dict, client: AsyncClient, cleanup_imports):
    csv_bytes = (
        b"Transaction Date,Amount,Description\n"
        b"04/01/2026,45.00,AMAZON MKTPL*FX54S4PN3 Amzn.com/billWA\n"
        b"04/02/2026,20.00,VENMO DES:CASHOUT ID:123 INDN:JANE DOE CO ID:456 PPD\n"
    )
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", csv_bytes, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    amazon_row = next(r for r in data["rows"] if r["name"] == "Amazon")
    assert amazon_row["category"] == "REIMBURSEMENT"

    venmo_row = next(r for r in data["rows"] if r["name"] == "VENMO")
    assert venmo_row["category"] == "REIMBURSEMENT"


async def test_savings_transfer_direction_ignores_conflicting_history(test_user: dict, client: AsyncClient, cleanup_imports):
    # Both directions of a SAV transfer collapse to the same display name
    # ("Savings"), so committed history for one direction must never leak
    # into categorizing the other — the from/to hint always wins.
    for i in range(3):
        seeded = await client.post("/transactions/", json={
            "name": "Savings", "amount": "500.00", "transaction_date": f"2026-03-0{i + 1}", "category": "SAVINGS",
        }, headers=auth_headers(test_user["token"]))
        assert seeded.status_code == 201

    csv_bytes = (
        b"Transaction Date,Amount,Description\n"
        b"04/01/2026,-757.00,Online Banking transfer to SAV 5835 Confirmation# aaa\n"
        b"04/02/2026,799.19,Online Banking transfer from SAV 5835 Confirmation# bbb\n"
    )
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", csv_bytes, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    to_savings_row = next(r for r in data["rows"] if r["transaction_date"] == "2026-04-01")
    assert to_savings_row["name"] == "Savings"
    assert to_savings_row["category"] == "SAVINGS"

    from_savings_row = next(r for r in data["rows"] if r["transaction_date"] == "2026-04-02")
    assert from_savings_row["name"] == "Savings"
    assert from_savings_row["category"] == "REIMBURSEMENT"


async def test_preview_flags_credit_card_payment_candidate(test_user: dict, client: AsyncClient, cleanup_imports):
    csv_bytes = (
        b"Transaction Date,Amount,Description\n"
        b"04/01/2026,-177.23,Mobile Banking payment to CRD 7240 Confirmation# xdcfhvgqv\n"
        b"04/02/2026,-45.00,Whole Foods\n"
    )
    res = await client.post(
        "/imports/preview",
        files={"file": ("statement.csv", csv_bytes, "text/csv")},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    data = res.json()

    crd_row = next(r for r in data["rows"] if r["name"] == "Credit Card Payment")
    assert crd_row["is_credit_card_payment_candidate"] is True
    assert crd_row["category"] == "EXPENSE"

    grocery_row = next(r for r in data["rows"] if r["name"] == "Whole Foods")
    assert grocery_row["is_credit_card_payment_candidate"] is False


async def test_unauthenticated_preview(client: AsyncClient):
    res = await client.post("/imports/preview", files={"file": ("statement.csv", SIMPLE_CSV, "text/csv")})
    assert res.status_code == 401


async def test_ai_cleanup_returns_suggestions(test_user: dict, client: AsyncClient, monkeypatch):
    monkeypatch.setattr(
        import_routes,
        "suggest_clean_names",
        AsyncMock(return_value={"JERSEY MIKES ONLINE UC MANASQUAN NJ": "Jersey Mikes"}),
    )
    res = await client.post(
        "/imports/ai-cleanup",
        json={"names": ["JERSEY MIKES ONLINE UC MANASQUAN NJ"]},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 200
    assert res.json()["suggestions"] == {"JERSEY MIKES ONLINE UC MANASQUAN NJ": "Jersey Mikes"}


async def test_ai_cleanup_returns_503_when_unavailable(test_user: dict, client: AsyncClient, monkeypatch):
    monkeypatch.setattr(
        import_routes,
        "suggest_clean_names",
        AsyncMock(side_effect=AiCleanupUnavailable("AI cleanup isn't configured on this server.")),
    )
    res = await client.post(
        "/imports/ai-cleanup",
        json={"names": ["Some Merchant"]},
        headers=auth_headers(test_user["token"]),
    )
    assert res.status_code == 503


async def test_unauthenticated_ai_cleanup(client: AsyncClient):
    res = await client.post("/imports/ai-cleanup", json={"names": ["Some Merchant"]})
    assert res.status_code == 401
