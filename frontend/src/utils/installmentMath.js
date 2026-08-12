// Mirrors app/services/installment_service.py exactly (flat division, gauge
// thresholds) so demo mode and the live term-hint chips stay in lockstep with
// the real backend. Single source of truth on the frontend - both demoStore.js
// and the installment components import from here rather than duplicating
// the formulas.

export const CANDIDATE_TERM_MONTHS = [3, 6, 12, 24, 36, 48];

// Cash-flow impact tiers, not an affordability judgement - how much of the
// user's currently-free cash a payment consumes, not whether they can afford
// it. Very low (<=10%, "dark_green"), low (10-15%, "green"), moderate
// (15-20%, "yellow"), high (20-25%, "orange"), very high (25%+, "red") - red
// covers everything past 25%, no further tier. See the backend's
// compute_gauge_status for why these particular cutoffs, and the caveat on
// them.
const DARK_GREEN_MAX_RATIO = 0.10;
const GREEN_MAX_RATIO = 0.15;
const YELLOW_MAX_RATIO = 0.20;
const ORANGE_MAX_RATIO = 0.25;

function cents(value) {
  return Math.round(value * 100) / 100;
}

// Flat division only - total_amount / period_months, rounded to the cent.
export function computeMonthlyPayment(totalAmount, periodMonths) {
  const total = parseFloat(totalAmount);
  const months = parseInt(periodMonths, 10);
  if (!(total > 0) || !(months > 0)) return null;
  return cents(total / months);
}

// Live "term hint" chips shown under the Term field - purely local math (no
// network round trip needed now that there's no interest to amortize), so
// they can recompute on every keystroke as the user types an amount.
export function computeTermOptions(totalAmount) {
  const total = parseFloat(totalAmount);
  if (!(total > 0)) return [];
  return CANDIDATE_TERM_MONTHS.map((periodMonths) => ({
    period_months: periodMonths,
    monthly_payment: cents(total / periodMonths),
  }));
}

// Returns { status, ratio } - status is "dark_green" | "green" | "yellow" |
// "orange" | "red", ratio is null when there's no headroom to divide by
// (matches the backend's InstallmentInsightsResponse shape).
export function computeGaugeStatus(monthlyPayment, availableCash) {
  const payment = parseFloat(monthlyPayment);
  const cash = parseFloat(availableCash);

  if (!(cash > 0)) {
    return { status: "red", ratio: null };
  }

  const ratio = payment / cash;
  let status;
  if (ratio <= DARK_GREEN_MAX_RATIO) status = "dark_green";
  else if (ratio <= GREEN_MAX_RATIO) status = "green";
  else if (ratio <= YELLOW_MAX_RATIO) status = "yellow";
  else if (ratio <= ORANGE_MAX_RATIO) status = "orange";
  else status = "red";

  return { status, ratio };
}
