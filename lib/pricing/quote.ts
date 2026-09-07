/**
 * lib/pricing/quote.ts — the quote engine, pure and isomorphic.
 *
 * The browser computes the receipt while the customer types, from a snapshot
 * of the settings the server handed it; `POST /api/orders` runs the very same
 * function and refuses the order (409 `quote_changed`) when its result differs
 * from what the customer saw. That contract only holds if this module has no
 * side effects and no server-only dependency, so it imports types alone —
 * never anything from `db/` or a Node-only module.
 *
 * Money rules (spec §6):
 * - `baseHtg = max(1, round(usdCents × rateE4 / 1 000 000))`;
 * - active rules that apply to the method, in settings order: `percent` on
 *   `baseHtg` (basis `base`) or on `baseHtg + fees so far` (basis `subtotal`),
 *   `fixed` as whole gourdes, `fixed_usd` as US cents converted at this
 *   order's own rate; then the rule's `minHtg` / `maxHtg` caps;
 * - `totalHtg = baseHtg + Σ lines`, never above `HTG_WALLET_MAX`.
 *
 * A `fixed_usd` line is the operator's 3 $ US transfer fee: it is worth the
 * same dollars at every rate, and the gourde figure it produced is frozen on
 * the order like every other line, so a later rate move never re-prices a
 * receipt already shown.
 */
import type { Locale, PaymentMethod, QuoteLine } from '@/lib/orders/types';
import type { FeeRule } from '@/lib/settings/types';
import { HTG_WALLET_MAX, effectiveRateHtg, percentOf, rateToE4, usdCentsToHtg } from './money';

/** Preset dollar amounts offered on the home page, in dollars. */
export const QUICK_AMOUNTS_USD = [5, 10, 20, 50, 100] as const;

/**
 * The slice of the platform settings a quote depends on. `settingsUpdatedAt`
 * is an ISO string rather than a Date so the snapshot can cross the RSC
 * boundary untouched and come back verbatim with the order request.
 */
export type QuoteSettings = {
  fxRateHtg: number;
  feeRules: FeeRule[];
  minUsdCents: number;
  maxUsdCents: number;
  settingsUpdatedAt: string | null;
};

/** A frozen receipt: what the customer saw and what the order will store. */
export type Quote = {
  usdCents: number;
  /** The rate actually used, normalised to four decimals. */
  fxRateHtg: number;
  baseHtg: number;
  lines: QuoteLine[];
  totalHtg: number;
  effectiveRateHtg: number;
  settingsUpdatedAt: string | null;
};

export type QuoteError = 'bad_amount' | 'below_minimum' | 'above_maximum' | 'wallet_limit';

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

export type QuoteInput = {
  usdCents: number;
  method: PaymentMethod;
  settings: QuoteSettings;
};

/**
 * A fee's name in the language the receipt is being read in.
 *
 * The receipt is the largest, most trust-carrying block on the page: a Kreyòl
 * customer must not find « Frais de service » sitting between « Valè an goud »
 * and « Total pou peye ». A rule the operator has not translated keeps its
 * French label — a name in the wrong language still beats a blank line next
 * to an amount that is charged.
 */
export function feeLineLabel(line: Pick<QuoteLine, 'label' | 'labelHt'>, locale: Locale): string {
  if (locale !== 'ht') return line.label;
  const ht = (line.labelHt ?? '').trim();
  return ht.length > 0 ? ht : line.label;
}

/** Whether a rule participates in a quote for this payment method. */
function ruleApplies(rule: FeeRule, method: PaymentMethod): boolean {
  return rule.enabled && (rule.appliesTo === 'all' || rule.appliesTo === method);
}

/** A cap is only a cap when it is an actual number; `null` / `undefined` mean none. */
function cap(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/** The gourde amount of one rule, caps applied last. `value` is read in the unit of `kind`. */
function lineAmount(rule: FeeRule, baseHtg: number, subtotalHtg: number, fxRateHtg: number): number {
  let amount: number;
  if (rule.kind === 'percent') {
    amount = percentOf(rule.basis === 'subtotal' ? subtotalHtg : baseHtg, rule.value);
  } else if (rule.kind === 'fixed_usd') {
    // `value` is US cents; the same conversion the base amount goes through.
    amount = usdCentsToHtg(rule.value, fxRateHtg);
  } else {
    amount = Math.round(rule.value);
  }
  if (!Number.isFinite(amount)) amount = 0;
  const min = cap(rule.minHtg);
  const max = cap(rule.maxHtg);
  if (min !== null && amount < min) amount = min;
  if (max !== null && amount > max) amount = max;
  return amount;
}

/**
 * Compute the receipt for `usdCents` paid through `method` under `settings`.
 *
 * Never throws. Refuses, in this order: an amount that is not a positive
 * integer number of cents or a rate that is not positive (`bad_amount`), an
 * amount under `minUsdCents` (`below_minimum`) or over `maxUsdCents`
 * (`above_maximum`), and a total above the 75 000 HTG wallet ceiling
 * (`wallet_limit`). Invariant on success: `baseHtg + Σ lines = totalHtg`.
 */
export function computeQuote({ usdCents, method, settings }: QuoteInput): QuoteResult {
  if (!Number.isInteger(usdCents) || usdCents <= 0) return { ok: false, error: 'bad_amount' };
  const rateE4 = rateToE4(settings.fxRateHtg);
  if (rateE4 <= 0) return { ok: false, error: 'bad_amount' };
  if (usdCents < settings.minUsdCents) return { ok: false, error: 'below_minimum' };
  if (usdCents > settings.maxUsdCents) return { ok: false, error: 'above_maximum' };

  const fxRateHtg = rateE4 / 10_000;
  const baseHtg = usdCentsToHtg(usdCents, fxRateHtg);

  const lines: QuoteLine[] = [];
  let feesHtg = 0;
  for (const rule of settings.feeRules) {
    if (!ruleApplies(rule, method)) continue;
    const amountHtg = lineAmount(rule, baseHtg, baseHtg + feesHtg, fxRateHtg);
    lines.push({
      id: rule.id,
      label: rule.label,
      // Frozen with the line, so a receipt reopened in Kreyòl still reads in
      // Kreyòl; `null` when the rule carries no translation.
      labelHt: rule.labelHt ?? null,
      kind: rule.kind,
      value: rule.value,
      basis: rule.basis,
      amountHtg,
    });
    feesHtg += amountHtg;
  }

  const totalHtg = baseHtg + feesHtg;
  if (totalHtg > HTG_WALLET_MAX) return { ok: false, error: 'wallet_limit' };

  return {
    ok: true,
    quote: {
      usdCents,
      fxRateHtg,
      baseHtg,
      lines,
      totalHtg,
      effectiveRateHtg: effectiveRateHtg(totalHtg, usdCents),
      settingsUpdatedAt: settings.settingsUpdatedAt,
    },
  };
}
