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
