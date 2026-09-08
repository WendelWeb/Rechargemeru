'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import { PRICING_RULE_IDS } from '@/lib/settings/defaults';
import { FEE_APPLIES_TO, FEE_BASES, FEE_KINDS, type FeeAppliesTo, type FeeBasis, type FeeKind, type FeeRule } from '@/lib/settings/types';

/**
 * A fee rule while it is being edited: every number stays a string so a
 * half-typed « 2. » does not become 2 behind the operator's back. The drafts
 * are turned back into real `FeeRule`s only for the hidden JSON field and the
 * live preview.
 *
 * One unit differs between the draft and the stored rule: a `fixed_usd` rule
 * is stored in **US cents** but typed in **dollars**, because « 3 » is what
 * the operator means by a 3 $ US transfer fee. `toDraft` divides and
 * `draftsToRules` multiplies; nothing else in the form has to know.
 */
export type FeeRuleDraft = {
  id: string;
  label: string;
  /** The Kreyòl label, empty when the rule has not been translated. */
  labelHt: string;
  kind: FeeKind;
  /** In the unit of `kind`: percent, whole gourdes, or DOLLARS for `fixed_usd`. */
  value: string;
  basis: FeeBasis;
  minHtg: string;
  maxHtg: string;
  appliesTo: FeeAppliesTo;
  enabled: boolean;
};

const KIND_LABELS: Record<FeeKind, string> = {
  percent: 'Pourcentage',
  fixed: 'Montant fixe (HTG)',
  fixed_usd: 'Montant fixe ($ US)',
};
const BASIS_LABELS: Record<FeeBasis, string> = {
  base: 'Sur la conversion seule',
  subtotal: 'Sur le sous-total (frais précédents inclus)',
};
const APPLIES_LABELS: Record<FeeAppliesTo, string> = {
  all: 'Toutes les méthodes',
  moncash: METHOD_LABELS.moncash,
  natcash: METHOD_LABELS.natcash,
};

/** What one unit of `value` means, for the field label. */
const VALUE_LABELS: Record<FeeKind, string> = {
  percent: 'Valeur en %',
  fixed: 'Valeur en HTG',
  fixed_usd: 'Valeur en $ US',
};

/** Upper bound of each kind, in the unit the field is typed in. */
const VALUE_MAX: Record<FeeKind, string> = { percent: '100', fixed: '75000', fixed_usd: '1000' };

/** The three rules the pricing panel above owns; hidden here unless asked for. */
const PANEL_RULE_IDS: readonly string[] = Object.values(PRICING_RULE_IDS);

/** True when this rule is one of the three the pricing panel edits by name. */
export function isPricingRule(id: string): boolean {
  return PANEL_RULE_IDS.includes(id);
}

function numberOrNull(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Whole US cents to the dollars string the form edits (300 -> « 3.00 »). */
export function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents)) return '';
  const safe = Math.max(0, Math.round(cents));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

/** The typed dollars back to whole US cents; `null` when nothing usable was typed. */
export function dollarsToCents(raw: string): number | null {
  const value = numberOrNull(raw);
  return value === null ? null : Math.round(value * 100);
}

/** A stored rule, ready to edit. */
export function toDraft(rule: FeeRule): FeeRuleDraft {
  return {
    id: rule.id,
    label: rule.label,
    labelHt: rule.labelHt ?? '',
    kind: rule.kind,
    value: rule.kind === 'fixed_usd' ? centsToDollars(rule.value) : String(rule.value),
    basis: rule.basis,
    minHtg: rule.minHtg == null ? '' : String(rule.minHtg),
    maxHtg: rule.maxHtg == null ? '' : String(rule.maxHtg),
    appliesTo: rule.appliesTo,
    enabled: rule.enabled,
  };
}

/** The value of one draft in the unit the schema and the quote engine expect. */
function draftValue(draft: FeeRuleDraft): number {
  const value = draft.kind === 'fixed_usd' ? dollarsToCents(draft.value) : numberOrNull(draft.value);
  return value ?? Number.NaN;
}

/** The drafts as the pricing engine and the server schema understand them. */
export function draftsToRules(drafts: FeeRuleDraft[]): FeeRule[] {
  return drafts.map((draft) => ({
    id: draft.id,
    label: draft.label.trim(),
    // Left empty means « not translated »: stored as null, and the receipt
    // falls back to the French label rather than printing nothing.
    labelHt: draft.labelHt.trim() === '' ? null : draft.labelHt.trim(),
    kind: draft.kind,
    value: draftValue(draft),
    basis: draft.basis,
    minHtg: numberOrNull(draft.minHtg),
    maxHtg: numberOrNull(draft.maxHtg),
    appliesTo: draft.appliesTo,
    enabled: draft.enabled,
  }));
}

/** Only rules whose numbers are usable feed the live preview; the rest simply do not show yet. */
export function previewableRules(drafts: FeeRuleDraft[]): FeeRule[] {
  return draftsToRules(drafts).filter((rule) => Number.isFinite(rule.value));
}

function newDraft(index: number): FeeRuleDraft {
  return {
    id: `regle-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    labelHt: '',
    kind: 'percent',
    value: '0',
    basis: 'base',
    minHtg: '',
    maxHtg: '',
    appliesTo: 'all',
    enabled: true,
  };
}

export type FeeRulesEditorProps = {
  rules: FeeRuleDraft[];
  onChange: (rules: FeeRuleDraft[]) => void;
  /** Zod paths such as `feeRules.0.value`. */
  fieldErrors?: Record<string, string>;
};

/**
 * The fee table. Order matters: a rule with basis « sous-total » applies to
 * the base plus every line computed before it, which is how a tax on a
 * service fee is expressed.
 *
 * The service fee, the tax and the transfer fee are edited by name in the
 * pricing panel above, so they are hidden here by default — two fields for
 * the same number, side by side, is how an operator ends up charging a fee
 * twice. « Afficher toutes les règles » brings them back, and an invalid
 * hidden rule forces itself into view rather than blocking the save from
 * somewhere the operator cannot see.
 */
export function FeeRulesEditor({ rules, onChange, fieldErrors = {} }: FeeRulesEditorProps) {
  const [showAll, setShowAll] = useState(false);

  function patch(index: number, changes: Partial<FeeRuleDraft>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...changes } : rule)));
  }

  function hasError(index: number): boolean {
    const prefix = `feeRules.${index}.`;
    return Object.keys(fieldErrors).some((key) => key.startsWith(prefix));
  }

  const panelRules = rules.filter((rule) => isPricingRule(rule.id));
  const hiddenProblem = rules.some((rule, index) => isPricingRule(rule.id) && hasError(index));
  const everything = showAll || hiddenProblem;
  const visible = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => everything || !isPricingRule(rule.id));

  const labelClass = 'mb-1 block text-xs font-medium text-ink-soft';

  return (
    <div className="space-y-3">
      {panelRules.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-xs text-ink-muted">
            {everything
              ? 'Les règles réglées dans le panneau de tarification sont incluses.'
              : `${panelRules.length} règle(s) du panneau de tarification ne sont pas listées ici.`}
          </p>
          <label className="inline-flex min-h-11 items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={everything}
              disabled={hiddenProblem}
              onChange={(e) => setShowAll(e.target.checked)}
              className="size-4 rounded border-line accent-ink"
            />
            Afficher toutes les règles
          </label>
        </div>
      ) : null}

      {hiddenProblem ? (
        <p className="rounded-xl bg-coral-soft px-4 py-3 text-sm text-coral-deep">
          Une règle du panneau de tarification est invalide : elle reste affichée ci-dessous le temps de la corriger.
        </p>
      ) : null}

      {rules.length === 0 ? (
        <p className="rounded-xl bg-mist px-4 py-3 text-sm text-ink-soft">
          Aucun frais : le client paie exactement la conversion au taux ci-dessus.
        </p>
      ) : null}

      {rules.length > 0 && visible.length === 0 ? (
        <p className="rounded-xl bg-mist px-4 py-3 text-sm text-ink-soft">
          Aucune règle en dehors de la tarification ci-dessus.
        </p>
      ) : null}

      {visible.map(({ rule, index }) => {
        const errorFor = (field: string) => fieldErrors[`feeRules.${index}.${field}`];
        return (
          <fieldset
            key={rule.id}
            className={cn(
              'rounded-xl border p-4',
              rule.enabled ? 'border-line bg-paper' : 'border-line bg-mist/50',
            )}
          >
            <legend className="px-1 text-xs font-medium text-ink-muted">
              Règle {index + 1}
              {isPricingRule(rule.id) ? ' · réglée dans le panneau de tarification' : ''}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={labelClass} htmlFor={`rule-label-${rule.id}`}>
                  Libellé en français, tel que le client le lit
                </label>
                <Input
                  id={`rule-label-${rule.id}`}
                  value={rule.label}
                  onChange={(e) => patch(index, { label: e.target.value })}
                  maxLength={60}
                  required
                  placeholder="Frais de service"
                  invalid={Boolean(errorFor('label'))}
                />
                {errorFor('label') ? <p className="mt-1 text-xs text-coral-deep">{errorFor('label')}</p> : null}
              </div>

              {/* Half the site reads in Kreyòl. A fee left untranslated keeps
                  its French name on their receipt — never an empty line next
                  to an amount that is charged. */}
              <div className="lg:col-span-2">
                <label className={labelClass} htmlFor={`rule-label-ht-${rule.id}`}>
                  Libellé en kreyòl
                </label>
                <Input
                  id={`rule-label-ht-${rule.id}`}
                  value={rule.labelHt}
                  onChange={(e) => patch(index, { labelHt: e.target.value })}
                  maxLength={60}
                  placeholder="Frè sèvis"
                  invalid={Boolean(errorFor('labelHt'))}
                />
                {errorFor('labelHt') ? (
                  <p className="mt-1 text-xs text-coral-deep">{errorFor('labelHt')}</p>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">
                    Vide : le client sur /ht lit le libellé français.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor={`rule-kind-${rule.id}`}>
                  Type
                </label>
                {/* Changing the type keeps the number and changes its unit: « 3 »
                    becomes 3 %, 3 HTG or 3 $ US — never a silent conversion. */}
                <Select
                  id={`rule-kind-${rule.id}`}
                  value={rule.kind}
                  onChange={(e) => patch(index, { kind: e.target.value as FeeKind })}
                >
                  {FEE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className={labelClass} htmlFor={`rule-value-${rule.id}`}>
                  {VALUE_LABELS[rule.kind]}
                </label>
                <Input
                  id={`rule-value-${rule.id}`}
                  type="number"
                  inputMode="decimal"
                  step={rule.kind === 'fixed' ? '1' : '0.01'}
                  min="0"
                  max={VALUE_MAX[rule.kind]}
                  required
                  value={rule.value}
                  onChange={(e) => patch(index, { value: e.target.value })}
                  mono
                  invalid={Boolean(errorFor('value'))}
                />
                {errorFor('value') ? <p className="mt-1 text-xs text-coral-deep">{errorFor('value')}</p> : null}
                {rule.kind === 'fixed_usd' ? (
                  <p className="mt-1 text-xs text-ink-muted">Converti au taux de chaque commande.</p>
                ) : null}
              </div>

              <div className="lg:col-span-2">
                <label className={labelClass} htmlFor={`rule-basis-${rule.id}`}>
                  Assiette
                </label>
                <Select
                  id={`rule-basis-${rule.id}`}
                  value={rule.basis}
                  onChange={(e) => patch(index, { basis: e.target.value as FeeBasis })}
                  disabled={rule.kind !== 'percent'}
                >
                  {FEE_BASES.map((basis) => (
                    <option key={basis} value={basis}>
                      {BASIS_LABELS[basis]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className={labelClass} htmlFor={`rule-applies-${rule.id}`}>
                  S’applique à
                </label>
                <Select
                  id={`rule-applies-${rule.id}`}
                  value={rule.appliesTo}
                  onChange={(e) => patch(index, { appliesTo: e.target.value as FeeAppliesTo })}
                >
                  {FEE_APPLIES_TO.map((target) => (
                    <option key={target} value={target}>
                      {APPLIES_LABELS[target]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`rule-min-${rule.id}`}>
                    Min. HTG
                  </label>
                  <Input
                    id={`rule-min-${rule.id}`}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    max="75000"
                    value={rule.minHtg}
                    onChange={(e) => patch(index, { minHtg: e.target.value })}
                    mono
                    invalid={Boolean(errorFor('minHtg'))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`rule-max-${rule.id}`}>
                    Max. HTG
                  </label>
                  <Input
                    id={`rule-max-${rule.id}`}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    max="75000"
                    value={rule.maxHtg}
                    onChange={(e) => patch(index, { maxHtg: e.target.value })}
                    mono
                    invalid={Boolean(errorFor('maxHtg'))}
                  />
                </div>
              </div>
            </div>

            {errorFor('maxHtg') ? <p className="mt-2 text-xs text-coral-deep">{errorFor('maxHtg')}</p> : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-11 items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => patch(index, { enabled: e.target.checked })}
                  className="size-4 rounded border-line accent-ink"
                />
                Active
              </label>
              {/* The three pricing rules cannot be deleted here: the panel
                  above would simply recreate them at their default value on
                  the next load, which is a silent price change. Turning one
                  off is what « Active » is for. */}
              {isPricingRule(rule.id) ? (
                <p className="text-xs text-ink-muted">Réglée dans le panneau de tarification.</p>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4 text-coral" aria-hidden="true" />
                  Supprimer
                </Button>
              )}
            </div>
          </fieldset>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        onClick={() => onChange([...rules, newDraft(rules.length)])}
        className="w-full sm:w-auto"
      >
        <Plus className="size-4" aria-hidden="true" />
        Ajouter une règle
      </Button>
    </div>
  );
}
