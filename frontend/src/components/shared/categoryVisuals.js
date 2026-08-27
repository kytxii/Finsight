import {
  IconIncomeTile, IconExpenseTile, IconBillTile, IconSubscriptionTile,
  IconDebtTile, IconReimbursementTile, IconSavingsTile, IconTipsTile,
} from "./categoryIcons";


export const HOME_BG = "#040e11";
export const HOME_TEXT = "#ffffff";
export const HOME_MUTED = "#8e8e93";
export const HOME_CHEVRON = "#55555c";
export const HOME_SURFACE = "#0e1b21";
export const HOME_DIVIDER = "rgba(255,255,255,0.09)";
export const HOME_INCOME = "#52b757";
export const HOME_EXPENSE = "#ef5350";
export const HOME_ACCENT = "#4493f8";

export const ACCENT = "#14b8a6";       // teal — primary action + focus
export const ACCENT_TEXT = "#04140f";  // near-black text on a jade fill
export const ACCENT_DEEP = "#0f766e";  // deep teal for ambient glow
export const FIELD = "#08131a";        // input background, a step below the surface

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

export const CATEGORY_ACCENT = {
  ALL: HOME_MUTED,
  ...TILE_COLOR,
};

export const DUPLICATE_ALERT = "#90a4ae";

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

export const PANEL_ROW_PAD_Y = 13;
