/**
 * lib/pricing/money.ts — the integer arithmetic every gourde amount goes through.
 *
 * USD is handled in cents, HTG in whole gourdes (neither wallet has a
 * sub-unit), the exchange rate as integer ten-thousandths and percentages as
 * integer hundredths. Each helper rounds exactly once, on an integer product,
 * so a page cannot advertise one figure while the gateway debits another.
 *
 * Pure and isomorphic: the browser runs the same code as the server.
 */

/**
 * Neither MonCash nor NatCash accepts more than 75 000 HTG in a single
 * transaction. It is a limit of the wallets themselves, so it applies to every
 * provider on every rail and is checked before any network call.
 */
export const HTG_WALLET_MAX = 75_000;

/** Rate in gourdes per dollar → integer ten-thousandths (132.5 → 1 325 000). */
export function rateToE4(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.round(rate * 10_000);
}

/**
 * USD cents → whole gourdes at `rate`.
 *
 * `cents × rateE4` is an exact integer product; dividing by 1 000 000 (100
 * cents × 10 000 ten-thousandths) and rounding once gives the gourde amount.
 * Any positive amount costs at least one gourde, so a tiny price can never
 * become free through rounding. Non-positive or invalid input is 0.
 */
export function usdCentsToHtg(cents: number, rate: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  const rateE4 = rateToE4(rate);
  if (rateE4 <= 0) return 0;
  return Math.max(1, Math.round((cents * rateE4) / 1_000_000));
}

/**
 * `percent` % of `amountHtg`, in whole gourdes.
 *
 * The percentage becomes integer hundredths first (5 → 500, 2.5 → 250), so
 * the only rounding happens on the final integer product. 0 for invalid input.
 */
export function percentOf(amountHtg: number, percent: number): number {
  if (!Number.isFinite(amountHtg) || !Number.isFinite(percent)) return 0;
  return Math.round((amountHtg * Math.round(percent * 100)) / 10_000);
}

/**
 * The all-in rate a customer effectively pays: gourdes per dollar once every
 * fee is included, to four decimals (3 089 HTG for 20 $ US → 154.45).
 * 0 when there are no dollars to divide by.
 */
export function effectiveRateHtg(totalHtg: number, usdCents: number): number {
  if (!Number.isFinite(totalHtg) || !Number.isFinite(usdCents) || usdCents <= 0) return 0;
  return Math.round((totalHtg * 1_000_000) / usdCents) / 10_000;
}
