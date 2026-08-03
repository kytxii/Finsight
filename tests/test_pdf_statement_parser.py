import io
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from app.services.pdf_statement_parser import extract_pdf_text_pages, parse_bofa_statement


def _build_pdf(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in lines:
        c.drawString(50, y, line)
        y -= 14
        if y < 50:
            c.showPage()
            y = 750
    c.showPage()
    c.save()
    return buf.getvalue()


def test_parses_simple_single_line_rows():
    page = """JANE DOE ! Account # 0000 0000 0000 ! January 1, 2026 to January 31, 2026
Page 1 of 2
Deposits and other additions
Date Description Amount
01/05/26 EMPLOYER INC DIRECT DEP 2,500.00
01/12/26 REFUND FROM MERCHANT 45.00
Total deposits and other additions $2,545.00
ATM and debit card subtractions
Date Description Amount
01/06/26 GROCERY STORE #12 ANYTOWN ST -88.40
01/07/26 COFFEE SHOP ANYTOWN ST -4.75
Total ATM and debit card subtractions -$93.15
Page 1 of 2"""

    rows = parse_bofa_statement([page])

    assert rows == [
        ("EMPLOYER INC DIRECT DEP", "01/05/26", "2,500.00"),
        ("REFUND FROM MERCHANT", "01/12/26", "45.00"),
        ("GROCERY STORE #12 ANYTOWN ST", "01/06/26", "-88.40"),
        ("COFFEE SHOP ANYTOWN ST", "01/07/26", "-4.75"),
    ]


def test_handles_multiline_wrapped_description_with_amount_on_own_line():
    page = """Deposits and other additions
Date Description Amount
01/05/26 EMPLOYER INC DES:PAYROLL ID:AB123 INDN:JANE DOE CO
ID:9876543210 PPD
1,200.00
Total deposits and other additions $1,200.00"""

    rows = parse_bofa_statement([page])

    assert rows == [
        ("EMPLOYER INC DES:PAYROLL ID:AB123 INDN:JANE DOE CO ID:9876543210 PPD", "01/05/26", "1,200.00"),
    ]


def test_ignores_embedded_id_numbers_when_extracting_amount():
    page = """ATM and debit card subtractions
Date Description Amount
01/06/26 CHECKCARD 0106 SOME MERCHANT 3492 ANYTOWN ST 24493986162225960105220 -10.00
Total ATM and debit card subtractions -$10.00"""

    rows = parse_bofa_statement([page])

    assert rows == [
        ("CHECKCARD 0106 SOME MERCHANT 3492 ANYTOWN ST 24493986162225960105220", "01/06/26", "-10.00"),
    ]


def test_handles_section_continued_across_pages():
    page1 = """ATM and debit card subtractions
Date Description Amount
01/06/26 GROCERY STORE #12 ANYTOWN ST -88.40
continued on the next page
Introducing My Credit
Your NEW FICO Score is here.
Page 1 of 2"""
    page2 = """JANE DOE ! Account # 0000 0000 0000 ! January 1, 2026 to January 31, 2026
Page 2 of 2
ATM and debit card subtractions - continued
Date Description Amount
01/07/26 COFFEE SHOP ANYTOWN ST -4.75
Total ATM and debit card subtractions -$93.15
Page 2 of 2"""

    rows = parse_bofa_statement([page1, page2])

    assert rows == [
        ("GROCERY STORE #12 ANYTOWN ST", "01/06/26", "-88.40"),
        ("COFFEE SHOP ANYTOWN ST", "01/07/26", "-4.75"),
    ]


def test_skips_non_transaction_boilerplate_and_stops_at_total():
    page = """JANE DOE ! Account # 0000 0000 0000 ! January 1, 2026 to January 31, 2026
IMPORTANT INFORMATION: BANK DEPOSIT ACCOUNTS
Deposit agreement - blah blah legal text with 12/31/25 mentioned in prose.
Deposits and other additions
Date Description Amount
01/05/26 EMPLOYER INC DIRECT DEP 2,500.00
Total deposits and other additions $2,500.00
Braille and Large Print Request - You can request a copy of this statement.
Page 1 of 1"""

    rows = parse_bofa_statement([page])

    assert rows == [("EMPLOYER INC DIRECT DEP", "01/05/26", "2,500.00")]


def test_no_transactions_returns_empty_list():
    page = """This is a cover page with no transaction sections at all.
Account summary
Beginning balance $100.00
Ending balance $100.00"""

    assert parse_bofa_statement([page]) == []


def test_real_pdf_roundtrip_via_pdfplumber():
    """Builds an actual PDF (not literal strings) to confirm extract_pdf_text_pages
    + parse_bofa_statement work against real pdfplumber-extracted text, not just
    hand-written fixtures."""
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

    pages = extract_pdf_text_pages(pdf_bytes)
    rows = parse_bofa_statement(pages)

    assert rows == [
        ("EMPLOYER INC DIRECT DEP", "01/05/26", "2,500.00"),
        ("GROCERY STORE #12 ANYTOWN ST", "01/06/26", "-88.40"),
    ]
