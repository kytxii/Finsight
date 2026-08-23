// Shared CSV-import heuristics for demo mode (client-side only — there's no
// backend to hit). Mirrors app/services/import_service.py on the backend;
// keep the two in sync if the detection/dedup/categorization logic changes.

const DATE_KEYWORDS = ["date", "posted", "post date", "transaction date"];
const AMOUNT_KEYWORDS = ["amount", "debit", "credit", "value"];
const NAME_KEYWORDS = ["description", "merchant", "payee", "name", "memo"];

// Tried in order until one parses; all normalize to "YYYY-MM-DD".
const DATE_FORMATS = ["MM/DD/YYYY", "YYYY-MM-DD", "MM/DD/YY", "DD/MM/YYYY", "MM-DD-YYYY"];

export function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Loose duplicate check for rows that already match on date + amount: one
// normalized name containing the other catches cases like a manually entered
// "Cobblestone" not exact-matching an imported "Cobblestone Auto Spa".
// Guarded by a minimum length on the shorter name so short names (e.g.
// "Cash") don't trivially match everything sharing that date+amount. Mirrors
// _names_are_similar in import_service.py.
export function namesAreSimilar(a, b) {
  if (!a || !b) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 4) return false;
  return longer.includes(shorter);
}

// ACH/NACHA batch text ("DES:PAYROLL ID:... INDN:... CO ID:...") and debit-card
// noise (type+date prefix, trailing reference numbers) obscure the actual
// merchant/employer name — mirrors clean_display_name in import_service.py.
const DES_SPLIT_RE = /\s+DES:/i;
const CARD_PREFIX_RE = /^(CHECKCARD|PURCHASE|MOBILE PURCHASE)\s+\d{4}\s+/i;
const TRAILING_REF_RE = /\s+\d{8,}(\s+RECURRING)?$/i;
const ATM_DEPOSIT_RE = /\bATM\b.*\bDEPOSIT\b/i;

// A "payment to CRD" row often bundles several unrelated purchases into one
// lump sum — flagged so the review UI can offer splitting it into itemized
// sub-transactions. Mirrors CRD_PAYMENT_RE in import_service.py.
const CRD_PAYMENT_RE = /\bpayment\s+to\s+CRD\b/i;

// POS terminals often print the merchant twice with a date+reference+"PURCHASE"
// sandwiched in between — see clean_display_name in import_service.py for the
// full rationale; keep the two in sync.
const MIDDLE_PURCHASE_RE = /^(.*?)\s+\d{2}\/\d{2}\s+#\d+\s+PURCHASE\s+(.*)$/i;

// Some rows put the transaction date + action keyword *after* the merchant
// name instead of as a leading prefix — see clean_display_name in
// import_service.py for the full rationale; keep the two in sync.
const TRAILING_DATE_ACTION_RE = /\s+\d{2}\/\d{2}\s+(?:MOBILE\s+)?(?:PURCHASE|REFUND)\b.*$/i;

// Amazon's per-order code + domain suffix is unique per purchase and never
// worth keeping — if the name starts with Amazon, it's Amazon.
const AMAZON_RE = /^AMAZON\b/i;

// Zelle rows carry the sender/recipient name, which is rarely worth keeping —
// collapse to "Zelle" or, with a memo, "Zelle (Memo)". The memo isn't always
// quoted in the wild ('for "Rent"' vs 'for Rent') — the optional quotes here
// handle both. Mirrors _clean_zelle_name in import_service.py.
const ZELLE_RE = /^Zelle\b/i;
const ZELLE_CONF_RE = /\s*;?\s*Conf#\s*\S+\s*$/i;
const ZELLE_MEMO_RE = /\bfor\s+"?([^"]+?)"?\s*$/i;

// Known merchants whose raw text (post store-number/date/location stripping)
// obscures the actual brand name or keeps a per-location store number that's
// never useful for a personal expense tracker. Necessarily a curated,
// incomplete list — add to it as new merchants show up, same as BILL_KEYWORDS.
// Mirrors MERCHANT_ALIASES in import_service.py.
const MERCHANT_ALIASES = [
  [/^WAL[- ]?MART\b.*$/i, "Walmart"],
  [/^BESTBUYCOM\d*$/i, "Best Buy"],
  [/^WHOLEFDS\b.*$/i, "Whole Foods"],
  [/^TARGET\b.*$/i, "Target"],
  [/^TRADER JOE S #?$/i, "Trader Joe's"],
  [/^CHICK-FIL-A\b.*$/i, "Chick-fil-A"],
  [/^CIRCLEK\b.*$/i, "Circle K"],
  [/^RAISING CANES\b.*$/i, "Raising Canes"],
  [/^STEAMGAMES\.COM$/i, "Steam"],
  [/^PATREON\*?\s*MEMBERSHIP$/i, "Patreon"],
  [/^THE ESTANCIA CLUB,?\s*INC\.?$/i, "The Estancia Club"],
];

// A dangling trailing dash (some merchants print "NAME - <phone/address>" and
// the location gets stripped, leaving the dash orphaned) is just noise.
const TRAILING_DASH_RE = /\s+-+\s*$/;

// A trailing "<City> <ST>" is location noise for a personal expense tracker —
// strip it if the last token is a real state abbreviation. Known limitation:
// can't tell a real trailing noise word ("ONLINE UC") from part of the
// business name without understanding the text, so this only strips the
// city+state pair itself, not other trailing cruft.
const US_STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
]);
const TRAILING_CITY_STATE_RE = /\s+([A-Za-z][A-Za-z.\-']*(?:\s+[A-Za-z][A-Za-z.\-']*){0,2})\s+([A-Z]{2})$/;

// Merchants whose incoming payments are virtually always a reimbursement
// (a refund, a friend paying you back) rather than real income — matched
// against the first word, since Zelle/Venmo/Amazon lines keep varying
// amounts of text after the merchant name. Only applied when there's no
// learned history for this merchant yet.
const REIMBURSEMENT_MERCHANT_PREFIXES = new Set(["amazon", "venmo", "zelle"]);
const FROM_SAVINGS_RE = /\bfrom\s+SAV\b/i;

// The mirror image of FROM_SAVINGS_RE: money moving out of checking and into
// savings isn't an expense, it's a savings transfer.
const TO_SAVINGS_RE = /\bto\s+SAV\b/i;

// Venmo/Zelle are peer-to-peer apps, not merchants — the sign alone (not
// learned history) should decide reimbursement vs. expense for these, since
// both directions collapse to the same bare display name. Amazon is
// excluded: it's a real merchant where learned history is still the better
// signal. Mirrors PERSON_TO_PERSON_PREFIXES in import_service.py.
const PERSON_TO_PERSON_PREFIXES = new Set(["venmo", "zelle"]);

// A word only gets title-cased if it has no uppercase letter past its first
// character — an intentional mixed-case brand ("LinkedIn") shouldn't be
// retitled to "Linkedin". Mirrors _smart_title_case in import_service.py.
function smartTitleCaseWord(word) {
  if (word.length > 1 && /[A-Z]/.test(word.slice(1))) return word;
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
}

function smartTitleCase(text) {
  return text.split(" ").map((w) => (w ? smartTitleCaseWord(w) : w)).join(" ");
}

// Recurring bills whose cleaned name reliably contains one of these words/
// abbreviations (rent, utility, cable/internet providers) — expand as more
// come up rather than trying to guess every provider up front.
const BILL_KEYWORDS = ["rent", "aps", "cox"];
const BILL_KEYWORD_RE = new RegExp(`\\b(?:${BILL_KEYWORDS.join("|")})\\b`, "i");

export function isReimbursementHint(cleanedName) {
  const norm = normalizeName(cleanedName);
  const firstWord = norm ? norm.split(" ")[0] : "";
  if (REIMBURSEMENT_MERCHANT_PREFIXES.has(firstWord)) return true;
  return FROM_SAVINGS_RE.test(cleanedName);
}

export function isSavingsTransferHint(cleanedName) {
  return TO_SAVINGS_RE.test(cleanedName);
}

export function isPersonToPersonTransfer(cleanedName) {
  const norm = normalizeName(cleanedName);
  const firstWord = norm ? norm.split(" ")[0] : "";
  return PERSON_TO_PERSON_PREFIXES.has(firstWord);
}

// True for *either* direction of an internal savings transfer — used to
// decide whether the display name collapses to the direction-agnostic
// "Savings". Mirrors is_savings_related in import_service.py.
export function isSavingsRelated(name) {
  return FROM_SAVINGS_RE.test(name) || TO_SAVINGS_RE.test(name);
}

export function isBillHint(cleanedName) {
  return BILL_KEYWORD_RE.test(cleanedName);
}

function stripTrailingCityState(name) {
  const match = TRAILING_CITY_STATE_RE.exec(name);
  if (match && US_STATE_ABBREVIATIONS.has(match[2])) {
    return name.slice(0, match.index).replace(/[\s\-,]+$/, "");
  }
  return name;
}

function cleanZelleName(name) {
  const stripped = name.replace(ZELLE_CONF_RE, "").trim();
  const memoMatch = ZELLE_MEMO_RE.exec(stripped);
  if (memoMatch) return `Zelle (${smartTitleCase(memoMatch[1])})`;
  return "Zelle";
}

export function cleanDisplayName(rawName) {
  let name = rawName.trim();

  const desMatch = DES_SPLIT_RE.exec(name);
  if (desMatch) {
    name = name.slice(0, desMatch.index).trim();
  } else {
    const midMatch = MIDDLE_PURCHASE_RE.exec(name);
    if (midMatch) {
      const before = midMatch[1].trim();
      const after = midMatch[2].trim();
      name = after.toLowerCase().startsWith(before.slice(0, 10).toLowerCase()) ? after : before;
    } else {
      name = name
        .replace(CARD_PREFIX_RE, "")
        .replace(TRAILING_REF_RE, "")
        .replace(TRAILING_DATE_ACTION_RE, "")
        .trim();

      for (const [pattern, alias] of MERCHANT_ALIASES) {
        if (pattern.test(name)) { name = alias; break; }
      }
    }
  }

  if (ZELLE_RE.test(name)) return cleanZelleName(name);

  name = name.replace(TRAILING_DASH_RE, "").trim();
  name = stripTrailingCityState(name);

  return AMAZON_RE.test(name) ? "Amazon" : name;
}

export function isAtmDeposit(name) {
  return ATM_DEPOSIT_RE.test(name);
}

export function isCreditCardPayment(name) {
  return CRD_PAYMENT_RE.test(name);
}

// Some exports (Bank of America) include a "Beginning balance as of ..." row
// inside the transaction table itself — a running-balance marker, not a real
// transaction (no amount) — mirrors is_balance_marker_row in import_service.py.
const BALANCE_MARKER_RE = /^(?:beginning|ending) balance as of \d{1,2}\/\d{1,2}\/\d{2,4}$/i;

export function isBalanceMarkerRow(name) {
  return BALANCE_MARKER_RE.test(name.trim());
}

function findHeader(headers, keywords) {
  for (const keyword of keywords) {
    for (const header of headers) {
      if (header.trim().toLowerCase().includes(keyword)) return header;
    }
  }
  return headers[0] || "";
}

// Some real-world exports prefix the actual transaction table with a summary
// block (beginning/ending balance, total credits/debits) before the real
// header row — mirrors _find_header_row_index in import_service.py.
function findHeaderRowIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    const lowered = rows[i].map((c) => c.trim().toLowerCase());
    const hasDate = lowered.some((c) => DATE_KEYWORDS.some((k) => c.includes(k)));
    const hasAmount = lowered.some((c) => AMOUNT_KEYWORDS.some((k) => c.includes(k)));
    if (hasDate && hasAmount) return i;
  }
  return 0;
}

export function detectColumnMapping(headers) {
  return {
    date: findHeader(headers, DATE_KEYWORDS),
    amount: findHeader(headers, AMOUNT_KEYWORDS),
    name: findHeader(headers, NAME_KEYWORDS),
  };
}

function parseDateWithFormat(raw, format) {
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length !== 3) return null;

  let year, month, day;
  if (format === "YYYY-MM-DD") [year, month, day] = parts;
  else if (format === "MM/DD/YYYY" || format === "MM-DD-YYYY") [month, day, year] = parts;
  else if (format === "MM/DD/YY") { [month, day, year] = parts; year = "20" + year.padStart(2, "0"); }
  else if (format === "DD/MM/YYYY") [day, month, year] = parts;
  else return null;

  const y = parseInt(year, 10), m = parseInt(month, 10), d = parseInt(day, 10);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(iso + "T00:00:00");
  return isNaN(parsed.getTime()) ? null : iso;
}

export function parseDateFlexible(raw, preferredFormat) {
  const candidates = [preferredFormat, ...DATE_FORMATS.filter((f) => f !== preferredFormat)];
  for (const format of candidates) {
    const result = parseDateWithFormat(raw, format);
    if (result) return result;
  }
  return null;
}

export function parseAmountFlexible(raw) {
  let cleaned = raw.trim().replace(/\$/g, "").replace(/,/g, "");
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  const value = parseFloat(cleaned);
  if (isNaN(value)) return null;
  return negative ? -value : value;
}

// Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas/quotes).
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") { if (field !== "" || row.length > 0) pushRow(); }
    else if (c === "\r") { /* no-op, \n handles the row break */ }
    else field += c;
  }
  if (field !== "" || row.length > 0) pushRow();

  const headerIdx = findHeaderRowIndex(rows);
  const headers = (rows[headerIdx] || []).map((h) => h.trim());
  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows: dataRows };
}

// Annotates raw CSV rows with parsed amount/date/category plus duplicate
// flags, comparing against the user's existing transactions.
export function annotateImportRows(rawRows, mapping, dateFormat, signConvention, existingTransactions) {
  const dedupMap = new Map();
  const byDateAmount = new Map();
  const history = new Map();
  for (const t of existingTransactions) {
    const norm = normalizeName(t.name);
    const dateAmountKey = `${t.transaction_date}|${parseFloat(t.amount).toFixed(2)}`;
    dedupMap.set(`${dateAmountKey}|${norm}`, t);
    if (!byDateAmount.has(dateAmountKey)) byDateAmount.set(dateAmountKey, []);
    byDateAmount.get(dateAmountKey).push(t);
    if (!history.has(norm)) history.set(norm, new Map());
    const counter = history.get(norm);
    counter.set(t.category, (counter.get(t.category) || 0) + 1);
  }

  const filteredRows = rawRows.filter((raw) => !isBalanceMarkerRow(raw[mapping.name] || ""));

  return filteredRows.map((raw, idx) => {
    let rawName = cleanDisplayName(raw[mapping.name] || "");
    const rawDate = (raw[mapping.date] || "").trim();
    const rawAmount = (raw[mapping.amount] || "").trim();
    const isTipDepositCandidate = isAtmDeposit(rawName);
    if (isTipDepositCandidate) rawName = "Cash";

    // Category hints must be read *before* the savings-transfer display
    // collapse below reduces the name to the direction-agnostic "Savings" —
    // otherwise the from/to distinction that decides REIMBURSEMENT vs
    // SAVINGS is already gone by the time we'd try to read it. Both that
    // collapse and the Zelle/Venmo collapse in cleanDisplayName lose a signal
    // learned history can't recover, so these rows must never be
    // re-categorized from history afterward — the hint always wins.
    const reimbursementHint = isReimbursementHint(rawName);
    const savingsTransferHint = isSavingsTransferHint(rawName);
    const historyLocked = isPersonToPersonTransfer(rawName) || isSavingsRelated(rawName);
    if (isSavingsRelated(rawName)) rawName = "Savings";

    const isCreditCardPaymentCandidate = isCreditCardPayment(rawName);
    if (isCreditCardPaymentCandidate) rawName = "Credit Card Payment";

    const errors = [];
    const parsedDate = parseDateFlexible(rawDate, dateFormat);
    if (!parsedDate) errors.push("Unrecognized date format");

    const signedAmount = parseAmountFlexible(rawAmount);
    if (signedAmount === null) errors.push("Invalid amount");

    if (!rawName) errors.push("Missing name");

    let amount = null, category = null, isDuplicate = false, duplicateTransaction = null;
    const normName = rawName ? normalizeName(rawName) : "";

    if (signedAmount !== null) {
      amount = Math.abs(signedAmount).toFixed(2);
      const isNegative = signedAmount < 0;
      category = signConvention === "negative_expense"
        ? (isNegative ? "EXPENSE" : "INCOME")
        : (isNegative ? "INCOME" : "EXPENSE");

      if (category === "INCOME" && reimbursementHint && (historyLocked || !history.has(normName))) {
        category = "REIMBURSEMENT";
      }

      if (category === "EXPENSE" && savingsTransferHint) {
        category = "SAVINGS";
      } else if (category === "EXPENSE" && isBillHint(rawName)) {
        category = "BILL";
      }

      if (isTipDepositCandidate) category = "TIPS";

      if (history.has(normName) && !historyLocked) {
        let best = null, bestCount = -1;
        for (const [cat, count] of history.get(normName).entries()) {
          if (count > bestCount) { best = cat; bestCount = count; }
        }
        category = best;
      }

      if (parsedDate && normName) {
        const key = `${parsedDate}|${amount}|${normName}`;
        if (dedupMap.has(key)) {
          isDuplicate = true;
          duplicateTransaction = dedupMap.get(key);
        } else {
          // Same date and amount but no exact name match — check for a
          // looser match (e.g. a manually entered "Cobblestone" against an
          // imported "Cobblestone Auto Spa") before ruling out a duplicate.
          const candidates = byDateAmount.get(`${parsedDate}|${amount}`) || [];
          for (const candidate of candidates) {
            if (namesAreSimilar(normName, normalizeName(candidate.name))) {
              isDuplicate = true;
              duplicateTransaction = candidate;
              break;
            }
          }
        }
      }
    }

    return {
      row_number: idx + 1,
      name: rawName,
      amount,
      transaction_date: parsedDate,
      category,
      is_duplicate: isDuplicate,
      duplicate_transaction_id: duplicateTransaction?.id ?? null,
      duplicate_transaction: duplicateTransaction ? {
        name: duplicateTransaction.name,
        amount: duplicateTransaction.amount,
        transaction_date: duplicateTransaction.transaction_date,
      } : null,
      is_tip_deposit_candidate: isTipDepositCandidate,
      is_credit_card_payment_candidate: isCreditCardPaymentCandidate,
      errors,
    };
  });
}
