import { describe, it, expect } from 'vitest';
import { PRICING_RULE_IDS } from '@/lib/settings/defaults';
import type { FeeRule } from '@/lib/settings/types';
import { QUICK_AMOUNTS_USD, computeQuote, feeLineLabel, type QuoteResult, type QuoteSettings } from './quote';

const settings = {
  fxRateHtg: 132.5,
  minUsdCents: 500,
  maxUsdCents: 50000,
  settingsUpdatedAt: '2026-09-06T00:00:00.000Z',
  feeRules: [
    { id: 'svc', label: 'Frais de service', kind: 'percent' as const, value: 5, basis: 'base' as const, appliesTo: 'all' as const, enabled: true },
    { id: 'mc', label: 'Frais MonCash', kind: 'fixed' as const, value: 25, basis: 'base' as const, appliesTo: 'moncash' as const, enabled: true },
    { id: 'tax', label: 'Taxe', kind: 'percent' as const, value: 10, basis: 'subtotal' as const, appliesTo: 'all' as const, enabled: true },
    { id: 'off', label: 'Inactif', kind: 'fixed' as const, value: 999, basis: 'base' as const, appliesTo: 'all' as const, enabled: false },
  ],
};

function quoteOf(r: QuoteResult) {
  if (!r.ok) throw new Error(`expected an ok quote, got ${r.error}`);
  return r.quote;
}

describe('computeQuote', () => {
  it('computes base, percent on base, fixed per method, percent on subtotal', () => {
    const r = computeQuote({ usdCents: 2000, method: 'moncash', settings });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.baseHtg).toBe(2650);
    expect(r.quote.lines.map((l) => l.amountHtg)).toEqual([133, 25, 281]); // 5 % of 2650 → 133 ; 10 % of (2650+133+25)=2808 → 281
    expect(r.quote.totalHtg).toBe(3089);
    expect(r.quote.baseHtg + r.quote.lines.reduce((a, l) => a + l.amountHtg, 0)).toBe(r.quote.totalHtg);
    expect(r.quote.effectiveRateHtg).toBe(154.45);
    expect(r.quote.settingsUpdatedAt).toBe(settings.settingsUpdatedAt);
  });

  it('skips another method’s fee', () => {
    const r = computeQuote({ usdCents: 2000, method: 'natcash', settings });
    expect(r.ok && r.quote.totalHtg).toBe(3061);
  });

  it('applies min/max caps on a rule', () => {
    const s = { ...settings, feeRules: [{ ...settings.feeRules[0], minHtg: 200, maxHtg: 300 }] };
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: s }).ok && (computeQuote({ usdCents: 1000, method: 'moncash', settings: s }) as { ok: true; quote: { lines: { amountHtg: number }[] } }).quote.lines[0].amountHtg).toBe(200);
    // 66 250 HTG of base plus a fee capped at 300 stays under the wallet ceiling…
    expect(quoteOf(computeQuote({ usdCents: 50000, method: 'moncash', settings: { ...s, maxUsdCents: 100000 } })).lines[0].amountHtg).toBe(300);
    // …while 600 $ US alone (79 500 HTG) does not.
    expect((computeQuote({ usdCents: 60000, method: 'moncash', settings: { ...s, maxUsdCents: 100000 } }) as { ok: false; error: string }).error).toBe('wallet_limit');
  });

  it('refuses a total that fees push over the wallet ceiling', () => {
    // 500 $ US → 66 250 HTG base; with 5 % + 25 + 10 % the total is 76 547 HTG.
    expect(computeQuote({ usdCents: 50000, method: 'moncash', settings: { ...settings, maxUsdCents: 100000 } })).toEqual({ ok: false, error: 'wallet_limit' });
    // Exactly 75 000 HTG is still allowed.
    const edge = computeQuote({ usdCents: 60000, method: 'natcash', settings: { ...settings, fxRateHtg: 125, maxUsdCents: 100000, feeRules: [] } });
    expect(edge.ok && edge.quote.totalHtg).toBe(75_000);
  });

  it('refuses bad input', () => {
    expect(computeQuote({ usdCents: 400, method: 'moncash', settings })).toEqual({ ok: false, error: 'below_minimum' });
    expect(computeQuote({ usdCents: 60000, method: 'moncash', settings })).toEqual({ ok: false, error: 'above_maximum' });
    expect(computeQuote({ usdCents: 10.5, method: 'moncash', settings })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: { ...settings, fxRateHtg: 0 } })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: 0, method: 'moncash', settings })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: -2000, method: 'moncash', settings })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: Number.NaN, method: 'moncash', settings })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: { ...settings, fxRateHtg: Number.NaN } })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: { ...settings, fxRateHtg: 0.00001 } })).toEqual({ ok: false, error: 'bad_amount' });
  });

  it('uses integer math (no double rounding surprises)', () => {
    const r = computeQuote({ usdCents: 1999, method: 'natcash', settings: { ...settings, fxRateHtg: 132.1234, feeRules: [] } });
    expect(r.ok && r.quote.baseHtg).toBe(2641); // 1999 × 1321234 / 1e6 = 2641.147…
  });

  it('freezes the rate it actually used, to four decimals', () => {
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...settings, fxRateHtg: 132.12345678 } }));
    expect(q.fxRateHtg).toBe(132.1235);
    expect(q.usdCents).toBe(2000);
  });

  it('carries every rule field on its line, in settings order', () => {
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings }));
    // An untranslated rule freezes `labelHt: null`, never an empty string:
    // the receipt then falls back to the French label on /ht.
    expect(q.lines).toEqual([
      { id: 'svc', label: 'Frais de service', labelHt: null, kind: 'percent', value: 5, basis: 'base', amountHtg: 133 },
      { id: 'mc', label: 'Frais MonCash', labelHt: null, kind: 'fixed', value: 25, basis: 'base', amountHtg: 25 },
      { id: 'tax', label: 'Taxe', labelHt: null, kind: 'percent', value: 10, basis: 'subtotal', amountHtg: 281 },
    ]);
  });

  it('charges a fixed fee as a whole gourde amount whatever its basis', () => {
    const rules: QuoteSettings['feeRules'] = [
      { id: 'svc', label: 'Frais de service', kind: 'percent', value: 5, basis: 'base', appliesTo: 'all', enabled: true },
      { id: 'fix', label: 'Fixe', kind: 'fixed', value: 40, basis: 'subtotal', appliesTo: 'all', enabled: true },
    ];
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'natcash', settings: { ...settings, feeRules: rules } }));
    expect(q.lines.map((l) => l.amountHtg)).toEqual([133, 40]);
    expect(q.totalHtg).toBe(2823);
  });

  it('applies caps after the percentage and treats null caps as absent', () => {
    const rules: QuoteSettings['feeRules'] = [
      { id: 'a', label: 'Plancher', kind: 'percent', value: 1, basis: 'base', minHtg: 100, maxHtg: null, appliesTo: 'all', enabled: true },
      { id: 'b', label: 'Plafond', kind: 'percent', value: 50, basis: 'base', minHtg: null, maxHtg: 500, appliesTo: 'all', enabled: true },
      { id: 'c', label: 'Libre', kind: 'percent', value: 2, basis: 'base', minHtg: null, maxHtg: null, appliesTo: 'all', enabled: true },
    ];
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'natcash', settings: { ...settings, feeRules: rules } }));
    expect(q.lines.map((l) => l.amountHtg)).toEqual([100, 500, 53]); // 26.5 → floor 100 ; 1325 → cap 500 ; 53
    expect(q.totalHtg).toBe(2650 + 653);
  });

  it('produces an empty fee list and a total equal to the base when no rule applies', () => {
    const noRules = { ...settings, feeRules: [settings.feeRules[1], settings.feeRules[3]] };
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'natcash', settings: noRules }));
    expect(q.lines).toEqual([]);
    expect(q.totalHtg).toBe(q.baseHtg);
    expect(q.effectiveRateHtg).toBe(132.5);
    // Gourde rounding is visible in the all-in rate: 5 $ US → 662.5 → 663 HTG → 132.60.
    const small = quoteOf(computeQuote({ usdCents: 500, method: 'natcash', settings: noRules }));
    expect(small.baseHtg).toBe(663);
    expect(small.effectiveRateHtg).toBe(132.6);
  });

  it('keeps the invariant base + sum of lines = total, all integers, across the whole range', () => {
    for (let usdCents = settings.minUsdCents; usdCents <= settings.maxUsdCents; usdCents += 37) {
      for (const method of ['moncash', 'natcash'] as const) {
        const r = computeQuote({ usdCents, method, settings: { ...settings, fxRateHtg: 131.7777 } });
        if (!r.ok) {
          expect(r.error).toBe('wallet_limit');
          continue;
        }
        const sum = r.quote.lines.reduce((a, l) => a + l.amountHtg, 0);
        expect(r.quote.baseHtg + sum).toBe(r.quote.totalHtg);
        expect(Number.isInteger(r.quote.baseHtg)).toBe(true);
        expect(Number.isInteger(r.quote.totalHtg)).toBe(true);
        expect(r.quote.lines.every((l) => Number.isInteger(l.amountHtg))).toBe(true);
        expect(r.quote.totalHtg).toBeLessThanOrEqual(75_000);
      }
    }
  });

  it('does not mutate the settings it is given', () => {
    const frozen = { ...settings, feeRules: settings.feeRules.map((r) => Object.freeze({ ...r })) };
    Object.freeze(frozen.feeRules);
    Object.freeze(frozen);
    expect(computeQuote({ usdCents: 2000, method: 'moncash', settings: frozen }).ok).toBe(true);
  });
});

/**
 * The rule *shape* the operator ships with — a service percentage on the
 * converted amount, a 3 $ US transfer fee, and a tax that is off until he
 * turns it on — at a rate and a service percentage this file owns.
 *
 * The numbers are written out here on purpose: the live rate and the live fee
 * values are operator settings, changed from `/admin/parametres` whenever the
 * gourde moves, and arithmetic pinned to them would break on every such
 * change. That `DEFAULT_SETTINGS` still ships these three rules, with these
 * kinds and bases, is asserted in `lib/settings/schema.test.ts`.
 */
const shippedShape: QuoteSettings = {
  fxRateHtg: 132,
  minUsdCents: 500,
  maxUsdCents: 50_000,
  settingsUpdatedAt: null,
  feeRules: [
    {
      id: PRICING_RULE_IDS.service,
      label: 'Frais de service',
      labelHt: 'Frè sèvis',
      kind: 'percent',
      value: 5,
      basis: 'base',
      appliesTo: 'all',
      enabled: true,
    },
    {
      // 300 US cents: 3 $ US, converted at the order's own rate.
      id: PRICING_RULE_IDS.transfer,
      label: 'Frais de transfert',
      labelHt: 'Frè transfè',
      kind: 'fixed_usd',
      value: 300,
      basis: 'base',
      appliesTo: 'all',
      enabled: true,
    },
    {
      id: PRICING_RULE_IDS.tax,
      label: 'Taxe',
      labelHt: 'Taks',
      kind: 'percent',
      value: 0,
      basis: 'subtotal',
      appliesTo: 'all',
      enabled: false,
    },
  ],
};

/** The same fixture rules with `id` switched on or off. */
function withRule(id: string, patch: Partial<FeeRule>): QuoteSettings {
  return {
    ...shippedShape,
    feeRules: shippedShape.feeRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

describe('computeQuote with the shipped rule shape, at 132 HTG and 5 % service', () => {
  it('quotes 20 $ US on MonCash at 132 HTG: base 2 640, service 132, transfer 396, total 3 168', () => {
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: shippedShape }));
    expect(q.baseHtg).toBe(2640);
    expect(q.lines).toEqual([
      {
        id: 'service',
        label: 'Frais de service',
        labelHt: 'Frè sèvis',
        kind: 'percent',
        value: 5,
        basis: 'base',
        amountHtg: 132,
      },
      {
        id: 'transfer',
        label: 'Frais de transfert',
        labelHt: 'Frè transfè',
        kind: 'fixed_usd',
        value: 300,
        basis: 'base',
        amountHtg: 396,
      },
    ]);
    expect(q.totalHtg).toBe(3168);
    expect(q.baseHtg + q.lines.reduce((a, l) => a + l.amountHtg, 0)).toBe(q.totalHtg);
  });

  it('keeps the transfer fee worth 3 $ US when the rate moves', () => {
    const at150 = quoteOf(computeQuote({ usdCents: 2000, method: 'natcash', settings: { ...shippedShape, fxRateHtg: 150 } }));
    const transfer = at150.lines.find((l) => l.id === PRICING_RULE_IDS.transfer);
    expect(transfer?.amountHtg).toBe(450); // 3 $ US × 150
    expect(transfer?.value).toBe(300); // still 300 US cents on the frozen line
    expect(at150.baseHtg).toBe(3000);
    expect(at150.totalHtg).toBe(3600); // 3 000 + 150 + 450
    // The line is exactly the base amount of 3 $ US at the same rate, at any rate.
    for (const fxRateHtg of [110, 132, 132.75, 150, 201.5]) {
      const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...shippedShape, fxRateHtg } }));
      const line = q.lines.find((l) => l.id === PRICING_RULE_IDS.transfer);
      const alone = quoteOf(computeQuote({ usdCents: 500, method: 'moncash', settings: { ...shippedShape, fxRateHtg, feeRules: [] } }));
      expect(line?.amountHtg).toBe(Math.round((alone.baseHtg / 500) * 300));
    }
  });

  it('adds no line for the tax while it is disabled', () => {
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: shippedShape }));
    expect(q.lines.map((l) => l.id)).toEqual([PRICING_RULE_IDS.service, PRICING_RULE_IDS.transfer]);
    expect(q.lines.some((l) => l.id === PRICING_RULE_IDS.tax)).toBe(false);
  });

  it('adds 317 HTG when the operator turns a 10 % tax on the subtotal on', () => {
    const settings = withRule(PRICING_RULE_IDS.tax, { enabled: true, value: 10 });
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings }));
    expect(q.lines.map((l) => l.amountHtg)).toEqual([132, 396, 317]); // 10 % of 2 640 + 132 + 396 = 3 168
    expect(q.totalHtg).toBe(3485);
    expect(q.baseHtg + q.lines.reduce((a, l) => a + l.amountHtg, 0)).toBe(q.totalHtg);
  });

  it('keeps base + Σ lines = total across the range, on both rails, tax on or off', () => {
    for (const settings of [shippedShape, withRule(PRICING_RULE_IDS.tax, { enabled: true, value: 10 })]) {
      for (let usdCents = settings.minUsdCents; usdCents <= settings.maxUsdCents; usdCents += 53) {
        for (const method of ['moncash', 'natcash'] as const) {
          const r = computeQuote({ usdCents, method, settings });
          if (!r.ok) {
            expect(r.error).toBe('wallet_limit');
            continue;
          }
          const sum = r.quote.lines.reduce((a, l) => a + l.amountHtg, 0);
          expect(r.quote.baseHtg + sum).toBe(r.quote.totalHtg);
          expect(r.quote.lines.every((l) => Number.isInteger(l.amountHtg))).toBe(true);
        }
      }
    }
  });
});

describe('a fixed_usd rule', () => {
  const usdRule: FeeRule = {
    id: 'transfer',
    label: 'Frais de transfert',
    kind: 'fixed_usd',
    value: 300,
    basis: 'base',
    appliesTo: 'all',
    enabled: true,
  };

  it('ignores its basis, like every flat fee', () => {
    const onBase = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...shippedShape, feeRules: [usdRule] } }));
    const onSubtotal = quoteOf(
      computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...shippedShape, feeRules: [{ ...usdRule, basis: 'subtotal' }] } }),
    );
    expect(onBase.lines[0].amountHtg).toBe(396);
    expect(onSubtotal.lines[0].amountHtg).toBe(396);
  });

  it('costs nothing when it is set to zero, and obeys the gourde caps', () => {
    const free = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...shippedShape, feeRules: [{ ...usdRule, value: 0 }] } }));
    expect(free.lines[0].amountHtg).toBe(0);
    expect(free.totalHtg).toBe(free.baseHtg);
    const capped = quoteOf(
      computeQuote({ usdCents: 2000, method: 'moncash', settings: { ...shippedShape, feeRules: [{ ...usdRule, maxHtg: 250 }] } }),
    );
    expect(capped.lines[0].amountHtg).toBe(250);
  });
});

/**
 * The receipt is the same component in both languages, so the fee's own name
 * is the one thing that could still read « Frais de service » on /ht. It is
 * frozen onto the order with the rest of the receipt, and falls back to the
 * French label rather than leaving a line with an amount and no name.
 */
describe('feeLineLabel', () => {
  const line = { label: 'Frais de transfert', labelHt: 'Frè transfè' };

  it('reads French on /fr and Kreyòl on /ht', () => {
    expect(feeLineLabel(line, 'fr')).toBe('Frais de transfert');
    expect(feeLineLabel(line, 'ht')).toBe('Frè transfè');
  });

  it('falls back to the French label when the rule was never translated', () => {
    expect(feeLineLabel({ label: 'Remise de Noël', labelHt: null }, 'ht')).toBe('Remise de Noël');
    expect(feeLineLabel({ label: 'Remise de Noël' }, 'ht')).toBe('Remise de Noël');
    expect(feeLineLabel({ label: 'Remise de Noël', labelHt: '   ' }, 'ht')).toBe('Remise de Noël');
  });

  it('carries the Kreyòl label of every shipped fee onto the frozen line', () => {
    const q = quoteOf(computeQuote({ usdCents: 2000, method: 'moncash', settings: shippedShape }));
    expect(q.lines.map((l) => feeLineLabel(l, 'ht'))).toEqual(['Frè sèvis', 'Frè transfè']);
  });
});

describe('QUICK_AMOUNTS_USD', () => {
  it('offers the five preset dollar amounts', () => {
    expect([...QUICK_AMOUNTS_USD]).toEqual([5, 10, 20, 50, 100]);
  });
});
