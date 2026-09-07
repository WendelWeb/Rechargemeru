import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, PRICING_RULE_IDS } from './defaults';
import { feeRuleSchema, settingsInputSchema } from './schema';
import type { FeeRule } from './types';

const serviceRule: FeeRule = DEFAULT_SETTINGS.feeRules[0];
const transferRule: FeeRule = DEFAULT_SETTINGS.feeRules[1];

function paths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.success || !result.error ? [] : result.error.issues.map((i) => i.path.join('.'));
}

describe('settingsInputSchema', () => {
  it('accepts the defaults and strips updatedAt', () => {
    const r = settingsInputSchema.safeParse(DEFAULT_SETTINGS);
    expect(r.success).toBe(true);
    if (!r.success) return;
    // The rate and the fee values are operator settings: assert that parsing
    // hands them back untouched, never what they happen to be today.
    expect(r.data.fxRateHtg).toBe(DEFAULT_SETTINGS.fxRateHtg);
    expect(r.data.feeRules).toEqual(DEFAULT_SETTINGS.feeRules);
    expect(r.data.meruAccountTypes).toEqual(['email', 'username']);
    expect(r.data.supportWhatsapp).toBeNull();
    expect('updatedAt' in r.data).toBe(false);
  });

  it('refuses a maximum below the minimum', () => {
    const r = settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, minUsdCents: 5000, maxUsdCents: 4999 });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('maxUsdCents');
  });

  it('bounds the amounts and durations', () => {
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, minUsdCents: 99 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, maxUsdCents: 1_000_001 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, minUsdCents: 500.5 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, amountToleranceHtg: 5001 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, amountToleranceHtg: -1 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, orderTtlMinutes: 4 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, orderTtlMinutes: 1441 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, orderTtlMinutes: 1440 }).success).toBe(true);
  });

  it('bounds the exchange rate to four decimals in (0, 10000]', () => {
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fxRateHtg: 132.1234 }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fxRateHtg: 132.12345 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fxRateHtg: 0 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fxRateHtg: 10000.5 }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fxRateHtg: Number.NaN }).success).toBe(false);
  });

  it('refuses a percent rule above 100', () => {
    const r = settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, feeRules: [{ ...serviceRule, value: 101 }] });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('feeRules.0.value');
  });

  it('refuses a rule whose minimum exceeds its maximum', () => {
    const r = settingsInputSchema.safeParse({
      ...DEFAULT_SETTINGS,
      feeRules: [{ ...serviceRule, minHtg: 300, maxHtg: 200 }],
    });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('feeRules.0.maxHtg');
  });

  it('refuses duplicate rule ids', () => {
    const r = settingsInputSchema.safeParse({
      ...DEFAULT_SETTINGS,
      feeRules: [serviceRule, { ...serviceRule, label: 'Encore' }],
    });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('feeRules');
  });

  it('refuses a WhatsApp number that is not E.164', () => {
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminWhatsappNumbers: ['3700 1234'] }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminWhatsappNumbers: ['+0501234567'] }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, supportWhatsapp: '509 3700 1234' }).success).toBe(false);
    expect(
      settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminWhatsappNumbers: ['+50937001234', '+15551234567'] }).success,
    ).toBe(true);
  });

  it('refuses an empty list of Meru account types and unknown values', () => {
    const r = settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, meruAccountTypes: [] });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain('meruAccountTypes');
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, meruAccountTypes: ['phone'] }).success).toBe(false);
  });

  it('refuses unknown notification events', () => {
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, notifyAdminEvents: ['shipped'] }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, notifyCustomerEvents: [] }).success).toBe(true);
  });

  it('caps the recipient lists at ten', () => {
    const emails = Array.from({ length: 11 }, (_, i) => 'admin' + i + '@example.com');
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminEmails: emails }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminEmails: emails.slice(0, 10) }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, adminEmails: ['not-an-email'] }).success).toBe(false);
  });

  it('normalises recipients and the support number', () => {
    const r = settingsInputSchema.safeParse({
      ...DEFAULT_SETTINGS,
      adminEmails: ['  Admin@Example.com ', 'admin@example.com'],
      adminWhatsappNumbers: [' +50937001234 ', '+50937001234'],
      supportWhatsapp: '',
      businessName: '  Recharge Meru  ',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.adminEmails).toEqual(['admin@example.com']);
    expect(r.data.adminWhatsappNumbers).toEqual(['+50937001234']);
    expect(r.data.supportWhatsapp).toBeNull();
    expect(r.data.businessName).toBe('Recharge Meru');
  });

  it('requires the texts shown to customers', () => {
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, businessName: ' ' }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, meruHelpHt: '' }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...DEFAULT_SETTINGS, fulfilmentSlaFr: 'x'.repeat(81) }).success).toBe(false);
  });
});

/**
 * The shape of what ships — not the amounts. The rate and the three fee
 * values are settings the operator edits from `/admin/parametres`, so nothing
 * here pins a number he owns; the arithmetic they feed is tested against an
 * explicit fixture in `lib/pricing/quote.test.ts`.
 */
describe('DEFAULT_SETTINGS.feeRules', () => {
  it('ships the three rules the settings page edits, in order and under their known ids', () => {
    expect(DEFAULT_SETTINGS.feeRules.map((r) => r.id)).toEqual([
      PRICING_RULE_IDS.service,
      PRICING_RULE_IDS.transfer,
      PRICING_RULE_IDS.tax,
    ]);
    expect(serviceRule).toMatchObject({ kind: 'percent', basis: 'base', enabled: true });
    // A flat fee in US cents is what keeps the transfer fee worth the same
    // dollars whatever the gourde does — and cents are always whole.
    expect(transferRule).toMatchObject({ kind: 'fixed_usd', basis: 'base', enabled: true });
    expect(Number.isInteger(transferRule.value)).toBe(true);
    expect(transferRule.value).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.feeRules[2]).toMatchObject({ kind: 'percent', basis: 'subtotal', enabled: false });
    expect(DEFAULT_SETTINGS.feeRules.every((r) => r.appliesTo === 'all')).toBe(true);
  });

  it('names every shipped rule in both languages, so no receipt line is blank', () => {
    for (const rule of DEFAULT_SETTINGS.feeRules) {
      expect(rule.label.trim(), rule.id).not.toBe('');
      expect((rule.labelHt ?? '').trim(), rule.id).not.toBe('');
    }
  });
});

describe('feeRuleSchema', () => {
  it('accepts percent rules with two decimals and fixed rules in whole gourdes', () => {
    expect(feeRuleSchema.safeParse({ ...serviceRule, value: 2.5 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, value: 2.55 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, value: 2.555 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, kind: 'fixed', value: 25 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, kind: 'fixed', value: 25.5 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, kind: 'fixed', value: 75001 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, value: -1 }).success).toBe(false);
  });

  it('takes a fixed_usd value as whole US cents, from 0 to 100 000', () => {
    expect(feeRuleSchema.safeParse(transferRule).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: 0 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: 100_000 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: 100_001 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: 300.5 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: -300 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...transferRule, value: Number.NaN }).success).toBe(false);
    // 3 $ US would be a bad percentage-free gourde amount, but it is not read as gourdes:
    // the 75 000 HTG ceiling of a `fixed` rule does not apply to cents.
    expect(feeRuleSchema.safeParse({ ...transferRule, value: 90_000 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...transferRule, kind: 'fixed', value: 90_000 }).success).toBe(false);
    expect(paths(feeRuleSchema.safeParse({ ...transferRule, value: 300.5 }))).toContain('value');
  });

  it('accepts optional or null bounds and refuses inverted ones', () => {
    expect(feeRuleSchema.safeParse({ ...serviceRule, minHtg: null, maxHtg: null }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, minHtg: 100 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, minHtg: 100, maxHtg: 100 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, minHtg: 101, maxHtg: 100 }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, minHtg: 10.5 }).success).toBe(false);
  });

  it('validates the enumerations and the identifier', () => {
    expect(feeRuleSchema.safeParse({ ...serviceRule, appliesTo: 'natcash' }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, appliesTo: 'cash' }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, basis: 'total' }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, kind: 'fixed_usd', value: 300 }).success).toBe(true);
    expect(feeRuleSchema.safeParse({ ...serviceRule, kind: 'fixed_htg' }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, id: 'bad id!' }).success).toBe(false);
    expect(feeRuleSchema.safeParse({ ...serviceRule, label: '' }).success).toBe(false);
  });

  /**
   * The Kreyòl label is what a customer on /ht reads on the receipt. It is
   * optional — an untranslated rule falls back to the French label — but
   * « left empty » must be stored as null, never as '', so the fallback in
   * `feeLineLabel` has one shape to test.
   */
  it('keeps the Kreyòl label, and stores « not translated » as null', () => {
    const shipped = feeRuleSchema.safeParse(serviceRule);
    expect(shipped.success).toBe(true);
    if (shipped.success) expect(shipped.data.labelHt).toBe(serviceRule.labelHt);

    for (const labelHt of [undefined, null, '', '   ']) {
      const r = feeRuleSchema.safeParse({ ...serviceRule, labelHt });
      expect(r.success, String(labelHt)).toBe(true);
      if (r.success) expect(r.data.labelHt).toBeNull();
    }

    const trimmed = feeRuleSchema.safeParse({ ...serviceRule, labelHt: '  Frè sèvis  ' });
    expect(trimmed.success && trimmed.data.labelHt).toBe('Frè sèvis');

    const tooLong = feeRuleSchema.safeParse({ ...serviceRule, labelHt: 'x'.repeat(61) });
    expect(tooLong.success).toBe(false);
    expect(paths(tooLong)).toContain('labelHt');
  });
});
