// Mirrors app/services/installment_service.py. Single source of truth on the
// frontend - demoStore.js and the installment components both import this.

export const CANDIDATE_TERM_MONTHS = [3, 6, 12, 24, 36, 48];

// Cash-flow impact tiers - how much free cash a payment consumes, not whether
// it's affordable. <=10% dark_green, 10-15% green, 15-20% yellow, 20-25% orange,
// 25%+ red. See compute_gauge_status for the reasoning.
const DARK_GREEN_MAX_RATIO = 0.10;
const GREEN_MAX_RATIO = 0.15;
const YELLOW_MAX_RATIO = 0.20;
const ORANGE_MAX_RATIO = 0.25;

function cents(value) {
  return Math.round(value * 100) / 100;
}

// total_amount / period_months, rounded to the cent.
export function computeMonthlyPayment(totalAmount, periodMonths) {
  const total = parseFloat(totalAmount);
  const months = parseInt(periodMonths, 10);
  if (!(total > 0) || !(months > 0)) return null;
  return cents(total / months);
}

// Term-hint chips under the Term field. Local math, so they recompute on
// every keystroke.
export function computeTermOptions(totalAmount) {
  const total = parseFloat(totalAmount);
  if (!(total > 0)) return [];
  return CANDIDATE_TERM_MONTHS.map((periodMonths) => ({
    period_months: periodMonths,
    monthly_payment: cents(total / periodMonths),
  }));
}

// Returns { status, ratio }. ratio is null with no headroom to divide by.
// Matches the backend's InstallmentInsightsResponse shape.
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
