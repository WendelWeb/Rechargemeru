'use client';

import type { ReactNode } from 'react';
import { CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { formatHtg, formatUsd, formatUsdShort } from '@/lib/format';
import { computeQuote } from '@/lib/pricing/quote';
import { DEFAULT_SETTINGS, PRICING_RULE_IDS } from '@/lib/settings/defaults';
import { dollarsToCents, previewableRules, toDraft, type FeeRuleDraft } from './FeeRulesEditor';
import { QuotePreview } from './QuotePreview';

/**
 * components/admin/PricingPanel.tsx — the four numbers that decide the price.
 *
 * The operator asked for exactly these: le taux de change, les frais de
 * service, la taxe, et des frais de transfert « qui seront toujours 3 $ ».
 * That last one is why the panel exists rather than a row in the advanced
 * table: a transfer fee typed in gourdes would have to be re-typed after
 * every rate move, and the day it is forgotten the operator loses the
 * difference on every order. Typed in dollars and stored as US cents
 * (`kind: 'fixed_usd'`), it is converted at each order's own rate and stays
 * worth 3 $ US whatever the gourde does.
 *
 * Nothing here is a separate setting: the three fees are the well-known
 * `feeRules` entries (`PRICING_RULE_IDS`), edited in place inside the same
 * draft list the advanced editor works on, so saving writes them back by id
 * and never disturbs a rule the operator added by hand.
 */

type PanelRuleId = (typeof PRICING_RULE_IDS)[keyof typeof PRICING_RULE_IDS];

const PANEL_IDS: PanelRuleId[] = [PRICING_RULE_IDS.service, PRICING_RULE_IDS.transfer, PRICING_RULE_IDS.tax];

/** The labels a rule is created with when it is missing — what the customer reads on the receipt. */
const RECEIPT_LABELS: Record<PanelRuleId, string> = {
  service: 'Frais de service',
  transfer: 'Frais de transfert',
  tax: 'Taxe',
};

/** The same three, in Kreyòl: the receipt on `/ht` is read by half the customers. */
const RECEIPT_LABELS_HT: Record<PanelRuleId, string> = {
  service: 'Frè sèvis',
  transfer: 'Frè transfè',
  tax: 'Taks',
};

/** The amount the panel and the preview both talk about, before the min/max clamp. */
const PREVIEW_USD_CENTS = 2000;

/**
 * One of the three rules as it ships in `DEFAULT_SETTINGS`. The fallback
 * below is unreachable while the defaults carry all three ids; it exists so
 * that a settings row written before these ids existed gains a usable —
 * and, for anything but the service percentage, harmless — rule instead of
 * an undefined.
 */
function defaultDraft(id: PanelRuleId): FeeRuleDraft {
  const rule = DEFAULT_SETTINGS.feeRules.find((candidate) => candidate.id === id);
  if (rule) return toDraft(rule);
  return {
    id,
    label: RECEIPT_LABELS[id],
    labelHt: RECEIPT_LABELS_HT[id],
    kind: id === PRICING_RULE_IDS.transfer ? 'fixed_usd' : 'percent',
    value: '0',
    basis: id === PRICING_RULE_IDS.tax ? 'subtotal' : 'base',
    minHtg: '',
    maxHtg: '',
    appliesTo: 'all',
    enabled: false,
  };
}

/**
 * The drafts with the three panel rules guaranteed present, so the form can
 * assume each field has something to edit. Missing ones are appended in
 * receipt order (service, transfert, taxe) with their default values — the
 * tax disabled, as it ships. Call it once, when the form state is built.
 */
export function withPricingRules(drafts: FeeRuleDraft[]): FeeRuleDraft[] {
  const missing = PANEL_IDS.filter((id) => !drafts.some((draft) => draft.id === id));
  return missing.length === 0 ? drafts : [...drafts, ...missing.map(defaultDraft)];
}

function PanelField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-coral-deep">{error}</p> : null}
      {hint ? <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * The Kreyòl name of one fee, right under the number it applies to.
 *
 * The receipt is the same component on `/fr` and on `/ht`, so whatever is
 * typed here is what a Kreyòl customer reads between « Valè an goud » and
 * « Total pou peye ». Left empty, the French label is used — a name in the
 * wrong language still beats a blank line next to an amount that is charged.
 */
function KreyolLabel({
  id,
  value,
  frLabel,
  placeholder,
  error,
  onChange,
}: {
  id: string;
  value: string;
  frLabel: string;
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-2">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-soft">
        Libellé en kreyòl, sur le reçu de /ht
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={60}
        placeholder={placeholder}
        invalid={Boolean(error)}
      />
      {error ? (
        <p className="mt-1 text-xs text-coral-deep">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">Vide : le client sur /ht lit « {frLabel} ».</p>
      )}
    </div>
  );
}

/** An on/off control that reads as one: `role="switch"`, its label is its name. */
function Switch({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-tap items-center gap-2.5 rounded-xl text-sm font-medium text-ink"
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-mint bg-mint' : 'border-line bg-mist',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-paper shadow-card transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </span>
      {children}
    </button>
  );
}

export type PricingPanelProps = {
  /** The exchange rate field, kept as typed (it is submitted as `fxRateHtg`). */
  rate: string;
  onRateChange: (value: string) => void;
  /** The whole draft list; the panel edits three of its entries by id. */
  rules: FeeRuleDraft[];
  onRulesChange: (rules: FeeRuleDraft[]) => void;
  /** Only used to clamp the preview amount, exactly like the customer's form does. */
  minUsdCents: number;
  maxUsdCents: number;
  /** Zod messages keyed by path, e.g. `fxRateHtg` or `feeRules.1.value`. */
  fieldErrors?: Record<string, string>;
};

export function PricingPanel({
  rate,
  onRateChange,
  rules,
  onRulesChange,
  minUsdCents,
  maxUsdCents,
  fieldErrors = {},
}: PricingPanelProps) {
  function indexOf(id: PanelRuleId): number {
    return rules.findIndex((rule) => rule.id === id);
  }

  function draftOf(id: PanelRuleId): FeeRuleDraft {
    const index = indexOf(id);
    return index === -1 ? defaultDraft(id) : rules[index];
  }

  function patch(id: PanelRuleId, changes: Partial<FeeRuleDraft>): void {
    const index = indexOf(id);
    if (index === -1) {
      onRulesChange([...rules, { ...defaultDraft(id), ...changes }]);
      return;
    }
    onRulesChange(rules.map((rule, i) => (i === index ? { ...rule, ...changes } : rule)));
  }

  function errorFor(id: PanelRuleId, field: string): string | undefined {
    const index = indexOf(id);
    return index === -1 ? undefined : fieldErrors[`feeRules.${index}.${field}`];
  }

  const service = draftOf(PRICING_RULE_IDS.service);
  const transfer = draftOf(PRICING_RULE_IDS.transfer);
  const tax = draftOf(PRICING_RULE_IDS.tax);

  // The same quote the customer would get, computed with the very same pure
  // function: each hint below therefore states a fact, not an estimate.
  const rateNumber = Number(rate.trim().replace(',', '.'));
  const usdCents = Math.min(Math.max(PREVIEW_USD_CENTS, minUsdCents), Math.max(maxUsdCents, minUsdCents));
  const previewRules = previewableRules(rules);
  const preview = computeQuote({
    usdCents,
    method: 'moncash',
    settings: {
      fxRateHtg: Number.isFinite(rateNumber) ? rateNumber : 0,
      feeRules: previewRules,
      minUsdCents,
      maxUsdCents,
      settingsUpdatedAt: null,
    },
  });
  const amountLabel = formatUsdShort(usdCents, 'fr');
  const lineHtg = (id: PanelRuleId): number | null => {
    if (!preview.ok) return null;
    return preview.quote.lines.find((line) => line.id === id)?.amountHtg ?? null;
  };

  /**
   * What this fee does to the preview order, or why it does nothing. `offText`
   * differs per field because only the tax carries its own switch: a fee
   * turned off anywhere else was turned off in the advanced rules, and the
   * hint has to say so rather than leave the operator looking for a control
   * that is not on this panel.
   */
  function effect(id: PanelRuleId, enabled: boolean, offText: string): string | null {
    if (!enabled) return offText;
    const amount = lineHtg(id);
    if (amount === null) return null;
    return `Sur une commande de ${amountLabel} : ${formatHtg(amount)}.`;
  }

  const OFF_HERE = 'Désactivée : aucune ligne sur le reçu du client.';
  const OFF_ELSEWHERE = 'Désactivée dans les règles avancées : aucune ligne sur le reçu du client.';

  const serviceEffect = effect(PRICING_RULE_IDS.service, service.enabled, OFF_ELSEWHERE);
  const taxEffect = effect(PRICING_RULE_IDS.tax, tax.enabled, OFF_HERE);
  const transferEffect = transfer.enabled ? null : OFF_ELSEWHERE;
  const transferCents = dollarsToCents(transfer.value);
  const transferHtg = lineHtg(PRICING_RULE_IDS.transfer);

  return (
    <section className="rounded-card border border-line bg-paper p-4 shadow-card sm:p-6">
      <CardTitle as="h2">Tarification</CardTitle>
      <p className="mt-1 mb-4 max-w-3xl text-sm leading-snug text-ink-soft">
        Les quatre valeurs qui décident du prix affiché au client. L’aperçu se recalcule à chaque frappe ; rien n’est
        enregistré tant que vous n’avez pas touché « Enregistrer les paramètres » en bas de page.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <PanelField
          id="fxRateHtg"
          label="Taux de change"
          hint={
            <>
              Gourdes pour 1&nbsp;$&nbsp;US, quatre décimales au plus.
              {preview.ok ? ` Sur une commande de ${amountLabel}, la conversion seule fait ${formatHtg(preview.quote.baseHtg)}.` : ''}
            </>
          }
          error={fieldErrors.fxRateHtg}
        >
          <Input
            id="fxRateHtg"
            name="fxRateHtg"
            type="number"
            inputMode="decimal"
            step="0.0001"
            min="0.0001"
            max="10000"
            required
            value={rate}
            onChange={(e) => onRateChange(e.target.value)}
            mono
            invalid={Boolean(fieldErrors.fxRateHtg)}
          />
        </PanelField>

        <PanelField
          id="pricing-service"
          label="Frais de service"
          hint={
            <>
              Pourcentage de la conversion, deux décimales au plus.
              {serviceEffect ? ` ${serviceEffect}` : ''}
            </>
          }
          error={errorFor(PRICING_RULE_IDS.service, 'value')}
        >
          <Input
            id="pricing-service"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            required
            value={service.value}
            onChange={(e) => patch(PRICING_RULE_IDS.service, { value: e.target.value })}
            mono
            invalid={Boolean(errorFor(PRICING_RULE_IDS.service, 'value'))}
          />
          <KreyolLabel
            id="pricing-service-ht"
            value={service.labelHt}
            frLabel={service.label}
            placeholder={RECEIPT_LABELS_HT.service}
            error={errorFor(PRICING_RULE_IDS.service, 'labelHt')}
            onChange={(value) => patch(PRICING_RULE_IDS.service, { labelHt: value })}
          />
        </PanelField>

        <PanelField
          id="pricing-transfer"
          label="Frais de transfert (en dollars, identique quel que soit le taux)"
          hint={
            <>
              Toujours le même montant en dollars : il est converti au taux de chaque commande, vous n’avez rien à
              retoucher quand le taux change.
              {transferEffect ? ` ${transferEffect}` : ''}
              {transferEffect === null && transferCents !== null && transferHtg !== null
                ? ` ${formatUsd(transferCents, 'fr')}, soit ${formatHtg(transferHtg)} au taux actuel.`
                : ''}
            </>
          }
          error={errorFor(PRICING_RULE_IDS.transfer, 'value')}
        >
          <Input
            id="pricing-transfer"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="1000"
            required
            value={transfer.value}
            onChange={(e) => patch(PRICING_RULE_IDS.transfer, { value: e.target.value })}
            mono
            invalid={Boolean(errorFor(PRICING_RULE_IDS.transfer, 'value'))}
          />
          <KreyolLabel
            id="pricing-transfer-ht"
            value={transfer.labelHt}
            frLabel={transfer.label}
            placeholder={RECEIPT_LABELS_HT.transfer}
            error={errorFor(PRICING_RULE_IDS.transfer, 'labelHt')}
            onChange={(value) => patch(PRICING_RULE_IDS.transfer, { labelHt: value })}
          />
        </PanelField>

        <PanelField
          id="pricing-tax"
          label="Taxe"
          hint={
            <>
              Pourcentage du sous-total, frais compris.
              {taxEffect ? ` ${taxEffect}` : ''}
            </>
          }
          error={errorFor(PRICING_RULE_IDS.tax, 'value')}
        >
          <Input
            id="pricing-tax"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            required
            value={tax.value}
            onChange={(e) => patch(PRICING_RULE_IDS.tax, { value: e.target.value })}
            mono
            invalid={Boolean(errorFor(PRICING_RULE_IDS.tax, 'value'))}
          />
          <KreyolLabel
            id="pricing-tax-ht"
            value={tax.labelHt}
            frLabel={tax.label}
            placeholder={RECEIPT_LABELS_HT.tax}
            error={errorFor(PRICING_RULE_IDS.tax, 'labelHt')}
            onChange={(value) => patch(PRICING_RULE_IDS.tax, { labelHt: value })}
          />
          <div className="mt-2">
            <Switch checked={tax.enabled} onChange={(next) => patch(PRICING_RULE_IDS.tax, { enabled: next })}>
              Appliquer la taxe
            </Switch>
          </div>
        </PanelField>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-ink">Aperçu du devis</h3>
        <QuotePreview
          fxRateHtg={Number.isFinite(rateNumber) ? rateNumber : 0}
          feeRules={previewRules}
          minUsdCents={minUsdCents}
          maxUsdCents={maxUsdCents}
        />
      </div>
    </section>
  );
}
