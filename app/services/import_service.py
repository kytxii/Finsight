import csv
import io
import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction, TipDeposit
from app.models.category import Category
from app.schemas.import_profile import (
    ColumnMapping,
    DuplicateTransactionSummary,
    ImportPreviewRow,
    ImportPreviewResponse,
    ImportCommitRow,
    ImportCommitTipDepositRow,
)
from app.services import pdf_statement_parser
from app.services.paycheck_service import INCOME_CATEGORIES

DATE_KEYWORDS = ["date", "posted", "post date", "transaction date"]
AMOUNT_KEYWORDS = ["amount", "debit", "credit", "value"]
NAME_KEYWORDS = ["description", "merchant", "payee", "name", "memo"]

# Tried in order against each row's raw date string until one parses.
CANDIDATE_DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%d/%m/%Y", "%m-%d-%Y"]

DEFAULT_SIGN_CONVENTION = "negative_expense"

# ACH/NACHA batch text ("DES:PAYROLL ID:... INDN:... CO ID:...") and debit-card
# transaction noise (type+date prefix, trailing reference numbers) obscure the
# actual merchant/employer name — strip them for a readable display name.
DES_SPLIT_RE = re.compile(r"\s+DES:", re.IGNORECASE)
CARD_PREFIX_RE = re.compile(r"^(CHECKCARD|PURCHASE|MOBILE PURCHASE)\s+\d{4}\s+", re.IGNORECASE)
TRAILING_REF_RE = re.compile(r"\s+\d{8,}(\s+RECURRING)?$", re.IGNORECASE)

# POS terminals often print the merchant twice with a date+reference+"PURCHASE"
# sandwiched in between, e.g. "TARGET T-0936 07/07 #000153350 PURCHASE TARGET
# T-0936 154 Scottsdale AZ". Split on that marker; keep whichever side actually
# names the merchant (the fuller side if both repeat it, else the terse side —
# some formats put a bare street address after "PURCHASE" instead).
MIDDLE_PURCHASE_RE = re.compile(r"^(.*?)\s+\d{2}/\d{2}\s+#\d+\s+PURCHASE\s+(.*)$", re.IGNORECASE)

# Some rows put the transaction date + action keyword *after* the merchant
# name instead of as a leading prefix, e.g. "WAL-MART #5835 07/03 PURCHASE
# CAVE CREEK AZ" or "S & C DENTAL 07/29 REFUND SCOTTSDALE AZ" — once it's not
# the duplicated-merchant sandwich above, everything from the date onward is
# noise (transaction date + action + location), not part of the name.
TRAILING_DATE_ACTION_RE = re.compile(r"\s+\d{2}/\d{2}\s+(?:MOBILE\s+)?(?:PURCHASE|REFUND)\b.*$", re.IGNORECASE)

# An ATM cash deposit reads as income but is really tips being moved from cash
# on hand into checking — it belongs in tip-deposit tracking, not as a new
# income transaction (that would double-count already-logged tip income).
ATM_DEPOSIT_RE = re.compile(r"\bATM\b.*\bDEPOSIT\b", re.IGNORECASE)

# A "payment to CRD" row (paying down a credit card from checking) often
# bundles several unrelated purchases into one lump sum — flagged so the
# review UI can offer splitting it into itemized sub-transactions instead of
# committing it as one opaque "Credit Card Payment" line.
CRD_PAYMENT_RE = re.compile(r"\bpayment\s+to\s+CRD\b", re.IGNORECASE)

# Amazon's per-order code + domain suffix ("MKTPL*FX54S4PN3 Amzn.com/billWA",
# "RETA* GB7ZT57M3 WWW.AMAZON.COWA") is unique per purchase and never worth
# keeping — if the name starts with Amazon, it's Amazon.
AMAZON_RE = re.compile(r"^AMAZON\b", re.IGNORECASE)

# Zelle rows carry the sender/recipient name, which is rarely worth keeping in
# a personal expense tracker (it's just "you" on the other end) — collapse to
# "Zelle" or, when the row has a memo, "Zelle (Memo)". The memo isn't always
# quoted in the wild ('for "Rent"' vs 'for Rent') — the optional quotes here
# handle both.
ZELLE_RE = re.compile(r"^Zelle\b", re.IGNORECASE)
ZELLE_CONF_RE = re.compile(r"\s*;?\s*Conf#\s*\S+\s*$", re.IGNORECASE)
ZELLE_MEMO_RE = re.compile(r'\bfor\s+"?([^"]+?)"?\s*$', re.IGNORECASE)

# Known merchants whose raw text (post store-number/date/location stripping)
# obscures the actual brand name or keeps a per-location store number that's
# never useful for a personal expense tracker. Necessarily a curated,
# incomplete list — add to it as new merchants show up, same as BILL_KEYWORDS.
MERCHANT_ALIASES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^WAL[- ]?MART\b.*$", re.IGNORECASE), "Walmart"),
    (re.compile(r"^BESTBUYCOM\d*$", re.IGNORECASE), "Best Buy"),
    (re.compile(r"^WHOLEFDS\b.*$", re.IGNORECASE), "Whole Foods"),
    (re.compile(r"^TARGET\b.*$", re.IGNORECASE), "Target"),
    (re.compile(r"^TRADER JOE S #?$", re.IGNORECASE), "Trader Joe's"),
    (re.compile(r"^CHICK-FIL-A\b.*$", re.IGNORECASE), "Chick-fil-A"),
    (re.compile(r"^CIRCLEK\b.*$", re.IGNORECASE), "Circle K"),
    (re.compile(r"^RAISING CANES\b.*$", re.IGNORECASE), "Raising Canes"),
    (re.compile(r"^STEAMGAMES\.COM$", re.IGNORECASE), "Steam"),
    (re.compile(r"^PATREON\*?\s*MEMBERSHIP$", re.IGNORECASE), "Patreon"),
    (re.compile(r"^THE ESTANCIA CLUB,?\s*INC\.?$", re.IGNORECASE), "The Estancia Club"),
]

# A dangling trailing dash (some merchants print "NAME - <phone/address>" and
# the location gets stripped, leaving the dash orphaned) is just noise.
TRAILING_DASH_RE = re.compile(r"\s+-+\s*$")

# A trailing "<City> <ST>" is location noise for a personal expense tracker —
# strip it if the last token is a real state abbreviation. Known limitation:
# can't tell a real trailing noise word ("ONLINE UC") from part of the
# business name without understanding the text, so this only strips the
# city+state pair itself, not other trailing cruft.
US_STATE_ABBREVIATIONS = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
    "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
    "VA", "WA", "WV", "WI", "WY", "DC",
}
TRAILING_CITY_STATE_RE = re.compile(r"\s+([A-Za-z][A-Za-z.\-']*(?:\s+[A-Za-z][A-Za-z.\-']*){0,2})\s+([A-Z]{2})$")

# Merchants whose *incoming* payments are virtually always a reimbursement
# (a refund, a friend paying you back) rather than real income like a
# paycheck — matched against the first word, since Zelle/Venmo/Amazon lines
# keep varying amounts of text after the merchant name. Only applied when
# there's no learned history for this merchant yet.
REIMBURSEMENT_MERCHANT_PREFIXES = {"amazon", "venmo", "zelle"}
FROM_SAVINGS_RE = re.compile(r"\bfrom\s+SAV\b", re.IGNORECASE)

# Venmo/Zelle are peer-to-peer apps, not merchants — the sign alone (not
# learned history) should decide reimbursement vs. expense for these, since
# both directions collapse to the same bare "Venmo"/"Zelle (Memo)" display
# name and blending their history together would eventually miscategorize
# whichever direction happens less often. Amazon is excluded: it's a real
# merchant where learned history is still the better signal.
PERSON_TO_PERSON_PREFIXES = {"venmo", "zelle"}

# The mirror image of FROM_SAVINGS_RE: money moving *out* of checking and into
# savings isn't an expense, it's a savings transfer.
TO_SAVINGS_RE = re.compile(r"\bto\s+SAV\b", re.IGNORECASE)

# Some name components aren't just casing (already handled by title-casing in
# the frontend) — a deliberately mixed-case brand ("LinkedIn") shouldn't be
# retitled to "Linkedin". A word only gets title-cased if it has no uppercase
# letter past its first character; anything else is assumed intentional.
def _smart_title_case_word(word: str) -> str:
    if len(word) > 1 and any(c.isupper() for c in word[1:]):
        return word
    return word[:1].upper() + word[1:].lower()


def _smart_title_case(text: str) -> str:
    return " ".join(_smart_title_case_word(w) if w else w for w in text.split(" "))

# Recurring bills whose cleaned name reliably contains one of these words/
# abbreviations (rent, utility, cable/internet providers) — expand as more
# come up rather than trying to guess every provider up front.
BILL_KEYWORDS = {"rent", "aps", "cox"}
BILL_KEYWORD_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(k) for k in BILL_KEYWORDS) + r")\b", re.IGNORECASE
)


def normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _names_are_similar(a: str, b: str) -> bool:
    """Loose duplicate check for rows that already match on date + amount:
    one normalized name containing the other catches cases like a manually
    entered "Cobblestone" not exact-matching an imported "Cobblestone Auto
    Spa". Guarded by a minimum length on the shorter name so short names
    (e.g. "Cash") don't trivially match everything sharing that date+amount."""
    if not a or not b:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) < 4:
        return False
    return shorter in longer


def is_reimbursement_hint(cleaned_name: str) -> bool:
    norm = normalize_name(cleaned_name)
    first_word = norm.split(" ", 1)[0] if norm else ""
    if first_word in REIMBURSEMENT_MERCHANT_PREFIXES:
        return True
    return bool(FROM_SAVINGS_RE.search(cleaned_name))


def is_person_to_person_transfer(cleaned_name: str) -> bool:
    norm = normalize_name(cleaned_name)
    first_word = norm.split(" ", 1)[0] if norm else ""
    return first_word in PERSON_TO_PERSON_PREFIXES


def is_savings_transfer_hint(cleaned_name: str) -> bool:
    return bool(TO_SAVINGS_RE.search(cleaned_name))


def is_savings_related(name: str) -> bool:
    """True for *either* direction of an internal savings transfer — used to
    decide whether the display name collapses to the direction-agnostic
    "Savings", independent of which category (SAVINGS vs REIMBURSEMENT) that
    direction maps to. Callers needing the category distinction must read
    is_reimbursement_hint/is_savings_transfer_hint *before* collapsing the
    name, since afterward the from/to text is gone."""
    return bool(FROM_SAVINGS_RE.search(name) or TO_SAVINGS_RE.search(name))


def is_bill_hint(cleaned_name: str) -> bool:
    return bool(BILL_KEYWORD_RE.search(cleaned_name))


def _strip_trailing_city_state(name: str) -> str:
    match = TRAILING_CITY_STATE_RE.search(name)
    if match and match.group(2) in US_STATE_ABBREVIATIONS:
        return name[:match.start()].rstrip(" -,")
    return name


def _clean_zelle_name(name: str) -> str:
    stripped = ZELLE_CONF_RE.sub("", name).strip()
    memo_match = ZELLE_MEMO_RE.search(stripped)
    memo = memo_match.group(1).strip() if memo_match else ""
    if memo:
        return f"Zelle ({_smart_title_case(memo)})"
    return "Zelle"


def clean_display_name(raw_name: str) -> str:
    name = raw_name.strip()

    des_match = DES_SPLIT_RE.search(name)
    if des_match:
        name = name[:des_match.start()].strip()
    else:
        mid_match = MIDDLE_PURCHASE_RE.match(name)
        if mid_match:
            before, after = mid_match.group(1).strip(), mid_match.group(2).strip()
            name = after if after.lower().startswith(before[:10].lower()) else before
        else:
            name = CARD_PREFIX_RE.sub("", name).strip()
            name = TRAILING_REF_RE.sub("", name).strip()
            name = TRAILING_DATE_ACTION_RE.sub("", name).strip()

            for pattern, alias in MERCHANT_ALIASES:
                if pattern.match(name):
                    name = alias
                    break

    if ZELLE_RE.match(name):
        return _clean_zelle_name(name)

    name = TRAILING_DASH_RE.sub("", name).strip()
    name = _strip_trailing_city_state(name)

    if AMAZON_RE.match(name):
        return "Amazon"
    return name


def is_atm_deposit(name: str) -> bool:
    return bool(ATM_DEPOSIT_RE.search(name))


def is_credit_card_payment(name: str) -> bool:
    return bool(CRD_PAYMENT_RE.search(name))


# Some exports (Bank of America) include a "Beginning balance as of ..." row
# inside the transaction table itself — it's a running-balance marker, not a
# real transaction (no amount), so it's excluded from the import rather than
# surfaced as an "Invalid amount" error row the user has to manually skip.
BALANCE_MARKER_RE = re.compile(r"^(?:beginning|ending) balance as of \d{1,2}/\d{1,2}/\d{2,4}$", re.IGNORECASE)


def is_balance_marker_row(name: str) -> bool:
    return bool(BALANCE_MARKER_RE.match(name.strip()))


def _find_header(headers: list[str], keywords: list[str]) -> str:
    for keyword in keywords:
        for header in headers:
            if keyword in header.strip().lower():
                return header
    return headers[0] if headers else ""


def _find_header_row_index(rows: list[list[str]]) -> int:
    """Some real-world exports (e.g. Bank of America's CSV) prefix the actual
    transaction table with a summary block — beginning/ending balance, total
    credits/debits — before the real header row. Scan for the first row that
    looks like column headers (has both a date-ish and an amount-ish column)
    instead of assuming row 0 always is it."""
    for i, row in enumerate(rows):
        lowered = [cell.strip().lower() for cell in row]
        has_date = any(any(k in cell for k in DATE_KEYWORDS) for cell in lowered)
        has_amount = any(any(k in cell for k in AMOUNT_KEYWORDS) for cell in lowered)
        if has_date and has_amount:
            return i
    return 0


def detect_column_mapping(headers: list[str]) -> ColumnMapping:
    return ColumnMapping(
        date=_find_header(headers, DATE_KEYWORDS),
        amount=_find_header(headers, AMOUNT_KEYWORDS),
        name=_find_header(headers, NAME_KEYWORDS),
    )


def parse_date_flexible(raw: str, preferred_format: str) -> date | None:
    for fmt in [preferred_format, *CANDIDATE_DATE_FORMATS]:
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_amount_flexible(raw: str) -> Decimal | None:
    cleaned = raw.strip().replace("$", "").replace(",", "")
    negative_paren = cleaned.startswith("(") and cleaned.endswith(")")
    if negative_paren:
        cleaned = "-" + cleaned[1:-1]
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _decode_csv_bytes(file_bytes: bytes) -> str:
    for encoding in ["utf-8-sig", "latin-1"]:
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode file as text")


async def _build_preview_rows(
    raw_rows: list[tuple[str, str, str]],
    date_format: str,
    sign_convention: str,
    current_user: UUID,
    db: AsyncSession,
) -> list[ImportPreviewRow]:
    """Shared by CSV and PDF: turns raw (name, date_str, amount_str) triples into
    reviewable rows with parsed values, learned category, and duplicate flags."""
    existing = await db.execute(select(Transaction).where(Transaction.created_by == current_user))
    dedup_map: dict[tuple, Transaction] = {}
    by_date_amount: dict[tuple, list[Transaction]] = {}
    history: dict[str, Counter] = {}
    for t in existing.scalars().all():
        norm = normalize_name(t.name)
        dedup_map[(t.transaction_date, t.amount, norm)] = t
        by_date_amount.setdefault((t.transaction_date, t.amount), []).append(t)
        history.setdefault(norm, Counter())[t.category] += 1

    rows: list[ImportPreviewRow] = []
    for row_number, (raw_name, raw_date, raw_amount) in enumerate(raw_rows, start=1):
        raw_name = clean_display_name(raw_name or "")
        raw_date = (raw_date or "").strip()
        raw_amount = (raw_amount or "").strip()
        is_tip_deposit_candidate = is_atm_deposit(raw_name)
        if is_tip_deposit_candidate:
            # An ATM cash deposit isn't a merchant transaction — display it the
            # same way the app already names other tips-cash entries.
            raw_name = "Cash"

        # Category hints must be read *before* the savings-transfer display
        # collapse below reduces the name to the direction-agnostic "Savings"
        # — otherwise the from/to distinction that decides REIMBURSEMENT vs
        # SAVINGS is already gone by the time we'd try to read it. Both that
        # collapse and the Zelle/Venmo collapse in clean_display_name lose a
        # signal (transfer direction, or which side of a P2P payment this is)
        # that learned history can't recover — history for the collapsed name
        # blends both meanings together, so these rows must never be
        # re-categorized from history afterward; the hint always wins.
        reimbursement_hint = is_reimbursement_hint(raw_name)
        savings_transfer_hint = is_savings_transfer_hint(raw_name)
        history_locked = is_person_to_person_transfer(raw_name) or is_savings_related(raw_name)
        if is_savings_related(raw_name):
            raw_name = "Savings"

        # A lump-sum credit card payment often bundles several unrelated
        # purchases — flag it so the review UI can offer splitting it into
        # itemized sub-transactions instead of committing one opaque line.
        is_credit_card_payment_candidate = is_credit_card_payment(raw_name)
        if is_credit_card_payment_candidate:
            raw_name = "Credit Card Payment"

        errors: list[str] = []
        parsed_date = parse_date_flexible(raw_date, date_format)
        if parsed_date is None:
            errors.append("Unrecognized date format")

        signed_amount = parse_amount_flexible(raw_amount)
        if signed_amount is None:
            errors.append("Invalid amount")

        if not raw_name:
            errors.append("Missing name")

        amount = None
        category = None
        is_duplicate = False
        duplicate_transaction = None
        norm_name = normalize_name(raw_name) if raw_name else ""

        if signed_amount is not None:
            amount = abs(signed_amount)
            is_negative = signed_amount < 0
            if sign_convention == "negative_expense":
                category = Category.EXPENSE if is_negative else Category.INCOME
            else:
                category = Category.INCOME if is_negative else Category.EXPENSE

            if category == Category.INCOME and reimbursement_hint and (history_locked or norm_name not in history):
                category = Category.REIMBURSEMENT

            if category == Category.EXPENSE and savings_transfer_hint:
                category = Category.SAVINGS
            elif category == Category.EXPENSE and is_bill_hint(raw_name):
                category = Category.BILL

            if is_tip_deposit_candidate:
                # Sensible fallback if the user unchecks "treat as tips deposit"
                # and commits it as a regular transaction instead.
                category = Category.TIPS

            if norm_name in history and not history_locked:
                category = history[norm_name].most_common(1)[0][0]

            if parsed_date is not None and norm_name:
                key = (parsed_date, amount, norm_name)
                if key in dedup_map:
                    is_duplicate = True
                    duplicate_transaction = dedup_map[key]
                else:
                    # Same date and amount but no exact name match — check for
                    # a looser match (e.g. a manually entered "Cobblestone"
                    # against an imported "Cobblestone Auto Spa") before
                    # concluding this isn't a duplicate.
                    for candidate in by_date_amount.get((parsed_date, amount), []):
                        if _names_are_similar(norm_name, normalize_name(candidate.name)):
                            is_duplicate = True
                            duplicate_transaction = candidate
                            break

        rows.append(ImportPreviewRow(
            row_number=row_number,
            name=raw_name,
            amount=amount,
            transaction_date=parsed_date,
            category=category,
            is_duplicate=is_duplicate,
            duplicate_transaction_id=duplicate_transaction.id if duplicate_transaction else None,
            duplicate_transaction=DuplicateTransactionSummary(
                name=duplicate_transaction.name,
                amount=duplicate_transaction.amount,
                transaction_date=duplicate_transaction.transaction_date,
            ) if duplicate_transaction else None,
            is_tip_deposit_candidate=is_tip_deposit_candidate,
            is_credit_card_payment_candidate=is_credit_card_payment_candidate,
            errors=errors,
        ))

    return rows


async def parse_csv_preview(
    file_bytes: bytes,
    current_user: UUID,
    db: AsyncSession,
) -> ImportPreviewResponse:
    text = _decode_csv_bytes(file_bytes)
    all_rows = [row for row in csv.reader(io.StringIO(text)) if any(cell.strip() for cell in row)]
    if not all_rows:
        raise ValueError("CSV has no header row")

    header_idx = _find_header_row_index(all_rows)
    headers = [h.strip() for h in all_rows[header_idx]]
    data_rows = all_rows[header_idx + 1:]

    mapping = detect_column_mapping(headers)

    raw_dicts = [dict(zip(headers, row)) for row in data_rows]
    raw_rows = [
        (raw_row.get(mapping.name) or "", raw_row.get(mapping.date) or "", raw_row.get(mapping.amount) or "")
        for raw_row in raw_dicts
        if not is_balance_marker_row(raw_row.get(mapping.name) or "")
    ]
    rows = await _build_preview_rows(raw_rows, CANDIDATE_DATE_FORMATS[0], DEFAULT_SIGN_CONVENTION, current_user, db)

    return ImportPreviewResponse(source_format="csv", rows=rows)


async def parse_pdf_preview(
    file_bytes: bytes,
    current_user: UUID,
    db: AsyncSession,
) -> ImportPreviewResponse:
    pages = pdf_statement_parser.extract_pdf_text_pages(file_bytes)
    raw_triples = pdf_statement_parser.parse_bofa_statement(pages)
    if not raw_triples:
        raise ValueError("Couldn't find any transactions in this PDF")

    # PDF amounts already carry their own sign in the source text (deposits are
    # plain positive, subtraction sections are already negative) — no separate
    # sign-convention concept needed here, unlike CSV.
    raw_rows = [(name, date_str, amount_str) for name, date_str, amount_str in raw_triples]
    rows = await _build_preview_rows(raw_rows, CANDIDATE_DATE_FORMATS[0], DEFAULT_SIGN_CONVENTION, current_user, db)

    return ImportPreviewResponse(source_format="pdf", rows=rows)


async def commit_import(
    rows: list[ImportCommitRow],
    tip_deposit_rows: list[ImportCommitTipDepositRow],
    current_user: UUID,
    db: AsyncSession,
) -> tuple[list[Transaction], list[TipDeposit]]:
    created: list[Transaction] = []
    for row in rows:
        if row.skip:
            continue
        transaction = Transaction(
            name=row.name,
            amount=row.amount,
            transaction_date=row.transaction_date,
            category=row.category,
            created_by=current_user,
            updated_by=current_user,
        )
        db.add(transaction)
        created.append(transaction)

    created_deposits: list[TipDeposit] = []
    for deposit_row in tip_deposit_rows:
        deposit = TipDeposit(
            amount=deposit_row.amount,
            deposit_date=deposit_row.deposit_date,
            created_by=current_user,
            updated_by=current_user,
        )
        db.add(deposit)
        created_deposits.append(deposit)

    await db.commit()
    return created, created_deposits
