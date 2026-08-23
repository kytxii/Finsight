export const CATEGORIES = [
  "ALL",
  "INCOME",
  "EXPENSE",
  "BILL",
  "SUBSCRIPTION",
  "SAVINGS",
  "DEBT",
  "REIMBURSEMENT",
  "TIPS",
];

export const ALL_COLORS = { color: "#818cf8", lightColor: "#4f46e5" };

export const CATEGORY_CONFIG = {
  INCOME: { color: "#4ade80", lightColor: "#16a34a", label: "Income" },
  EXPENSE: { color: "#f87171", lightColor: "#dc2626", label: "Expenses" },
  BILL: { color: "#38bdf8", lightColor: "#0284c7", label: "Bills" },
  SUBSCRIPTION: {
    color: "#c084fc",
    lightColor: "#9333ea",
    label: "Subscriptions",
  },
  SAVINGS: { color: "#fbbf24", lightColor: "#d97706", label: "Savings" },
  DEBT: { color: "#fb923c", lightColor: "#ea580c", label: "Debt" },
  REIMBURSEMENT: {
    color: "#f472b6",
    lightColor: "#db2777",
    label: "Reimbursements",
  },
  TIPS: { color: "#34d399", lightColor: "#059669", label: "Tips" },
};

export const INCOME_TYPES = new Set(["INCOME", "REIMBURSEMENT", "TIPS"]);

// Categories whose transaction name carries no information beyond the category
// itself. These auto-fill and lock the name input at every entry point rather
// than letting each row be named separately (#73). Centralised because the old
// `category === "TIPS" ? "Cash" : ...` ternary was duplicated across 14 sites in
// 7 files, so adding a second locked category meant touching all of them.
export const LOCKED_NAMES = { TIPS: "Cash", SAVINGS: "Savings" };

// The forced name for a category, or null when the user names it themselves.
export function lockedNameFor(category) {
  return LOCKED_NAMES[category] ?? null;
}

export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function desaturate(hex, amount = 0.25) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s * (1 - amount)), l);
}

// First entry = richest; each subsequent step is 5% lighter / slightly less saturated
export function generateCategoryShades(baseHex, count) {
  const [h, s, l] = hexToHsl(baseHex);
  const baseS = s * 0.72;
  const baseL = Math.max(40, Math.min(l, 52));
  return Array.from({ length: count }, (_, i) => {
    const lightness = Math.min(82, baseL + i * 7);
    const saturation = Math.max(15, baseS - i * 4);
    return hslToHex(h, saturation, lightness);
  });
}

export function fmt(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Whole-dollar variant - no cents. UI-only rounding for surfaces where exact
// change is noise (e.g. savings projections: "saved $100" not "$100.23").
export function fmtWhole(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Cycle for the shared amount-sort toggle (AmountSortButton): null -> desc -> asc -> null.
export function nextAmountSort(current) {
  return current === "desc" ? "asc" : current === "asc" ? null : "desc";
}
