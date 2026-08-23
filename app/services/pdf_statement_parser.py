import io
import re

import pdfplumber

# Bank of America statement layout only (see #34 notes — PDF is inherently
# per-bank-layout fragile; this targets the format the user actually gets).
SECTION_HEADERS = [
    "Deposits and other additions",
    "ATM and debit card subtractions",
    "Other subtractions",
    "Checks",
]

DATE_LINE_RE = re.compile(r"^(\d{2}/\d{2}/\d{2})\s+(.*)$")
AMOUNT_RE = re.compile(r"-?\d{1,3}(?:,\d{3})*\.\d{2}")


def extract_pdf_text_pages(file_bytes: bytes) -> list[str]:
    pages = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def _matched_section_header(line: str) -> str | None:
    stripped = line.strip()
    for header in SECTION_HEADERS:
        if stripped == header or stripped == f"{header} - continued":
            return header
    return None


def parse_bofa_statement(pages: list[str]) -> list[tuple[str, str, str]]:
    """Returns raw (name, date_str, amount_str) triples, same shape as CSV rows."""
    rows: list[tuple[str, str, str]] = []
    in_section = False
    current_date: str | None = None
    current_text_parts: list[str] = []

    def flush_row():
        nonlocal current_date, current_text_parts
        if current_date is None:
            current_text_parts = []
            return
        full_text = " ".join(current_text_parts).strip()
        last_match = None
        for m in AMOUNT_RE.finditer(full_text):
            last_match = m
        if last_match is not None:
            amount_str = last_match.group(0)
            name = (full_text[:last_match.start()] + full_text[last_match.end():]).strip()
            name = " ".join(name.split())
            if name:
                rows.append((name, current_date, amount_str))
        current_date = None
        current_text_parts = []

    for page_text in pages:
        for raw_line in page_text.split("\n"):
            line = raw_line.strip()
            if not line:
                continue

            section = _matched_section_header(line)
            if section is not None:
                flush_row()
                in_section = True
                continue

            if line.lower().startswith("continued on the next page"):
                flush_row()
                in_section = False
                continue

            if not in_section:
                continue

            if line.lower().startswith("total "):
                flush_row()
                in_section = False
                continue

            if line.lower().startswith("date "):
                # column header row ("Date Description Amount")
                continue

            date_match = DATE_LINE_RE.match(line)
            if date_match:
                flush_row()
                current_date = date_match.group(1)
                current_text_parts = [date_match.group(2)]
            elif current_date is not None:
                current_text_parts.append(line)

    flush_row()
    return rows
