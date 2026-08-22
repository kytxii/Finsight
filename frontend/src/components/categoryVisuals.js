import {
  IconIncomeTile, IconExpenseTile, IconBillTile, IconSubscriptionTile,
  IconDebtTile, IconReimbursementTile, IconSavingsTile, IconTipsTile,
} from "./categoryIcons";

// ── Shared dark-mode palette ────────────────────────────────────────────────
// Pinned to the mobile mockup's dark palette, independent of the app's
// light/dark toggle — these mobile screens are dark-only by design.
// Shared between MobileHome and MobileCategory so both screens render the
// same tile colors/icons for a given category.
//
// Category colors (TILE_COLOR, HOME_INCOME, HOME_EXPENSE) are pinned to the
// app's existing --category-* custom properties (frontend/src/index.css) so
// category colors stay consistent with the rest of the app instead of
// drifting from it. Specifically the `:root` (light-mode) values, not the
// `.dark` block — same hues, but deliberately darker/more saturated, which
// reads better as a solid tile background than the `.dark` block's pastel
// shades (those are tuned for colored text on a dark background, not tiles).

export const HOME_BG = "#040e11";
export const HOME_TEXT = "#ffffff";
export const HOME_MUTED = "#8e8e93";
export const HOME_CHEVRON = "#55555c";
export const HOME_SURFACE = "#0e1b21";
export const HOME_DIVIDER = "rgba(255,255,255,0.09)";
export const HOME_INCOME = "#52b757";
export const HOME_EXPENSE = "#ef5350";
export const HOME_ACCENT = "#4493f8";

// Jade/teal accent — shared with the auth pages (Login/Register) and any other
// UI pinned to the dark theme regardless of the app's light/dark toggle.
export const ACCENT = "#14b8a6";       // teal — primary action + focus
export const ACCENT_TEXT = "#04140f";  // near-black text on a jade fill
export const ACCENT_DEEP = "#0f766e";  // deep teal for ambient glow
export const FIELD = "#08131a";        // input background, a step below the surface

// Installment cash-flow impact gauge - red-to-green bands, see
// app/services/installment_service.py's compute_gauge_status for the
// matching thresholds this palette visualizes. GAUGE_DARK_GREEN (very low
// impact, <=10%) is a solid, fully-saturated green; GAUGE_GREEN (low impact,
// 10-15%) is a lighter, more yellow-leaning green one step down toward
// GAUGE_YELLOW - the two read as a light-to-dark progression rather than two
// unrelated shades.
export const GAUGE_DARK_GREEN = "#43a047";
export const GAUGE_GREEN = "#8bc34a";
export const GAUGE_YELLOW = "#e0b020";
export const GAUGE_ORANGE = "#fb8c00";
export const GAUGE_RED = "#ef5350";

export const TILE_COLOR = {
  INCOME: "#52b757",
  EXPENSE: "#ef5350",
  BILL: "#1e88e5",
  SUBSCRIPTION: "#ab47bc",
  DEBT: "#fb8c00",
  REIMBURSEMENT: "#e91e63",
  SAVINGS: "#e0b020",
  TIPS: "#26a69a",
};

// Fixed per-category accent color for desktop surfaces (table, sidebar tabs,
// charts, stat cards, pills) — replaces the old --category-* CSS custom
// properties, which resolved differently depending on the app's light/dark
// toggle. Desktop is pinned dark now (matches mobile), so this is just
// TILE_COLOR plus a neutral entry for the "ALL" tab, which isn't a real
// category and never had a tile color of its own.
export const CATEGORY_ACCENT = {
  ALL: HOME_MUTED,
  ...TILE_COLOR,
};

// System alert color that must read as distinct from any category color —
// used for "possible duplicate" flags in the import review UI. Was
// --duplicate-alert in index.css; fixed to the (former) dark-mode shade now
// that the app no longer branches on the toggle.
export const DUPLICATE_ALERT = "#90a4ae";

// Tip deposits aren't a category (TipDeposit is its own model, not a
// Transaction) - this is the lighter teal MobileTips uses to distinguish a
// deposit row from a TIPS-category tip in the same list.
export const TIPS_DEPOSITED = "#5ccfc0";

export const CATEGORY_ICON = {
  INCOME: IconIncomeTile,
  EXPENSE: IconExpenseTile,
  BILL: IconBillTile,
  SUBSCRIPTION: IconSubscriptionTile,
  DEBT: IconDebtTile,
  REIMBURSEMENT: IconReimbursementTile,
  SAVINGS: IconSavingsTile,
  TIPS: IconTipsTile,
};
