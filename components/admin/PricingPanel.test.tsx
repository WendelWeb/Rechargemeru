import { describe, expect, it } from 'vitest';
import { computeQuote } from '@/lib/pricing/quote';
import { DEFAULT_SETTINGS, PRICING_RULE_IDS } from '@/lib/settings/defaults';
import { feeRuleSchema } from '@/lib/settings/schema';
import type { FeeRule } from '@/lib/settings/types';
import {
  centsToDollars,
  dollarsToCents,
  draftsToRules,
  isPricingRule,
  toDraft,
  type FeeRuleDraft,
} from './FeeRulesEditor';
import { withPricingRules } from './PricingPanel';

/**
 * The admin form edits the transfer fee in DOLLARS and stores it in US CENTS.
 * Getting that factor of 100 wrong in either direction is a hundredfold
 * pricing error that no type would catch, so the conversion is pinned here —
 * along with the guarantee that the three well-known rules always exist and
 * that nothing the operator added by hand is lost on the way.
 */

const custom: FeeRule = {
  id: 'promo-noel',
  label: 'Remise de Noël',
  kind: 'fixed',
  value: 50,
  basis: 'base',
  minHtg: null,
  maxHtg: null,
  appliesTo: 'moncash',
  enabled: true,
};

function draftOf(drafts: FeeRuleDraft[], id: string): FeeRuleDraft {
  const draft = drafts.find((candidate) => candidate.id === id);
  if (!draft) throw new Error(`draft ${id} missing`);
  return draft;
}

/** One shipped rule, by id — a missing one is a failed test, not an undefined. */
function shipped(id: string): FeeRule {
  const rule = DEFAULT_SETTINGS.feeRules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`DEFAULT_SETTINGS has no rule ${id}`);
  return rule;
}

/**
 * The three panel rules with the values written out here, not read from
 * `DEFAULT_SETTINGS`: the rate and the fees are settings the operator changes
 * from this very page, so the receipt arithmetic below is pinned to this
 * fixture instead. What the shipped rules must still look like — the ids, the
 * kinds, the bases — is `lib/settings/schema.test.ts`'s business.
 */
const FIXTURE_RATE_HTG = 132;
const fixtureRules: FeeRule[] = [
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
    // 300 US cents — the 3 $ US the form edits in dollars.
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
];

/** One fixture rule, by id. */
function fixtureRule(id: string): FeeRule {
  const rule = fixtureRules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`fixture has no rule ${id}`);
  return rule;
}

describe('dollars and cents', () => {
  it('shows whole US cents as dollars with two decimals', () => {
    expect(centsToDollars(300)).toBe('3.00');
    expect(centsToDollars(0)).toBe('0.00');
    expect(centsToDollars(5)).toBe('0.05');
    expect(centsToDollars(100_000)).toBe('1000.00');
  });

  it('reads what an operator types, comma or point', () => {
    expect(dollarsToCents('3')).toBe(300);
    expect(dollarsToCents('3.00')).toBe(300);
    expect(dollarsToCents('3,5')).toBe(350);
    expect(dollarsToCents(' 2.99 ')).toBe(299);
  });

  it('has nothing to say about an empty or unreadable field', () => {
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('   ')).toBeNull();
    expect(dollarsToCents('trois')).toBeNull();
  });

  it('round-trips a 3 $ US transfer fee through the form', () => {
    const draft = toDraft(fixtureRule(PRICING_RULE_IDS.transfer));
    expect(draft.value).toBe('3.00');
    expect(draftsToRules([draft])[0].value).toBe(300);
  });

  it('gives the shipped transfer fee back in the very cents it was stored in, whatever it is set to', () => {
    // The factor of 100 is pinned above; here only the round trip matters, so
    // an operator who raises the fee never sees it multiplied or divided.
    const stored = shipped(PRICING_RULE_IDS.transfer);
    expect(draftsToRules([toDraft(stored)])[0].value).toBe(stored.value);
  });

  it('leaves percentages and gourde amounts in their own unit', () => {
    const percent = toDraft(fixtureRule(PRICING_RULE_IDS.service));
    expect(percent.value).toBe('5');
    expect(draftsToRules([percent])[0].value).toBe(5);
    expect(draftsToRules([toDraft(custom)])[0].value).toBe(50);
    // The shipped percentage, whatever the operator has set it to, is not
    // divided by a hundred on the way through the form.
    const service = shipped(PRICING_RULE_IDS.service);
    expect(draftsToRules([toDraft(service)])[0].value).toBe(service.value);
  });

  it('produces a transfer rule the server schema accepts', () => {
    const draft = { ...toDraft(fixtureRule(PRICING_RULE_IDS.transfer)), value: '3,25' };
    const rule = draftsToRules([draft])[0];
    expect(rule.value).toBe(325);
    expect(feeRuleSchema.safeParse(rule).success).toBe(true);
  });
});

/**
 * Half the customers read the receipt in Kreyòl, and the receipt prints the
 * fee's own label. The form therefore edits two labels per rule, and « left
 * empty » has to reach the server as null so the receipt falls back to French
 * instead of printing nothing next to an amount that is charged.
 */
describe('the Kreyòl label', () => {
  it('ships on the three rules the operator edits by name', () => {
    expect(shipped(PRICING_RULE_IDS.service).labelHt).toBe('Frè sèvis');
    expect(shipped(PRICING_RULE_IDS.transfer).labelHt).toBe('Frè transfè');
    expect(shipped(PRICING_RULE_IDS.tax).labelHt).toBe('Taks');
  });

  it('round-trips through the form untouched', () => {
    const draft = toDraft(shipped(PRICING_RULE_IDS.transfer));
    expect(draft.labelHt).toBe('Frè transfè');
    expect(draftsToRules([draft])[0].labelHt).toBe('Frè transfè');
  });

  it('reads an untranslated rule as an empty field and stores it back as null', () => {
    expect(toDraft(custom).labelHt).toBe('');
    expect(toDraft({ ...custom, labelHt: null }).labelHt).toBe('');
    expect(draftsToRules([toDraft(custom)])[0].labelHt).toBeNull();
    expect(draftsToRules([{ ...toDraft(custom), labelHt: '   ' }])[0].labelHt).toBeNull();
    expect(draftsToRules([{ ...toDraft(custom), labelHt: '  Remiz Nwèl  ' }])[0].labelHt).toBe('Remiz Nwèl');
  });

  it('gives a recreated pricing rule its Kreyòl name, not a blank one', () => {
    const drafts = withPricingRules([toDraft(custom)]);
    expect(draftOf(drafts, PRICING_RULE_IDS.service).labelHt).toBe('Frè sèvis');
    expect(draftOf(drafts, PRICING_RULE_IDS.transfer).labelHt).toBe('Frè transfè');
    expect(draftOf(drafts, PRICING_RULE_IDS.tax).labelHt).toBe('Taks');
  });

  it('produces a rule the server schema accepts, translated or not', () => {
    const translated = draftsToRules([toDraft(shipped(PRICING_RULE_IDS.service))])[0];
    expect(feeRuleSchema.safeParse(translated).success).toBe(true);
    const untranslated = draftsToRules([toDraft(custom)])[0];
    expect(feeRuleSchema.safeParse(untranslated).success).toBe(true);
  });
});

describe('the three rules the pricing panel owns', () => {
  it('recognises them by id and nothing else', () => {
    expect(isPricingRule(PRICING_RULE_IDS.service)).toBe(true);
    expect(isPricingRule(PRICING_RULE_IDS.transfer)).toBe(true);
    expect(isPricingRule(PRICING_RULE_IDS.tax)).toBe(true);
    expect(isPricingRule('promo-noel')).toBe(false);
    expect(isPricingRule('')).toBe(false);
  });

  it('leaves a complete list exactly as it is', () => {
    const drafts = DEFAULT_SETTINGS.feeRules.map(toDraft);
    expect(withPricingRules(drafts)).toBe(drafts);
  });

  it('adds only what is missing, and keeps the operator’s own rules', () => {
    const drafts = withPricingRules([toDraft(custom)]);
    expect(drafts.map((draft) => draft.id)).toEqual([
      'promo-noel',
      PRICING_RULE_IDS.service,
      PRICING_RULE_IDS.transfer,
      PRICING_RULE_IDS.tax,
    ]);
    expect(draftOf(drafts, 'promo-noel').value).toBe('50');
    // Recreated from the shipped rule, in dollars — the amount is the
    // operator's, the unit is the form's.
    expect(draftOf(drafts, PRICING_RULE_IDS.transfer).value).toBe(centsToDollars(shipped(PRICING_RULE_IDS.transfer).value));
    // The tax ships disabled: recreating it must not start taxing anybody.
    expect(draftOf(drafts, PRICING_RULE_IDS.tax).enabled).toBe(false);
  });

  it('feeds the quote engine the same 20 $ US receipt the panel promises', () => {
    const drafts = withPricingRules(fixtureRules.map(toDraft));
    const result = computeQuote({
      usdCents: 2000,
      method: 'moncash',
      settings: {
        fxRateHtg: FIXTURE_RATE_HTG,
        feeRules: draftsToRules(drafts),
        minUsdCents: 500,
        maxUsdCents: 50_000,
        settingsUpdatedAt: null,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.baseHtg).toBe(2640);
    expect(result.quote.lines.map((line) => [line.id, line.amountHtg])).toEqual([
      [PRICING_RULE_IDS.service, 132],
      [PRICING_RULE_IDS.transfer, 396],
    ]);
    expect(result.quote.totalHtg).toBe(3168);
  });
});
