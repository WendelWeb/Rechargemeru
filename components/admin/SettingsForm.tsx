'use client';

import { useActionState, useMemo, useState, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { saveSettingsAction, type SettingsFormState } from '@/lib/admin/actions';
import { formatDateTime } from '@/lib/format';
import { MERU_ACCOUNT_TYPES, NOTIFICATION_TEMPLATES, type NotificationTemplate } from '@/lib/orders/types';
import { meruAccountLabelFr } from '@/lib/orders/meru-account';
import type { Settings } from '@/lib/settings/types';
import { FeeRulesEditor, draftsToRules, toDraft, type FeeRuleDraft } from './FeeRulesEditor';
import { PricingPanel, withPricingRules } from './PricingPanel';

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  created: 'Commande créée',
  paid: 'Paiement reçu',
  fulfilled: 'Dollars envoyés',
  failed: 'Échec',
  expired: 'Expirée',
  needs_review: 'À vérifier',
  refunded: 'Remboursement',
  reminder_24h: 'Rappel 24 h (opérateur)',
};

/** Integer cents to the plain dollars string the form edits (« 500 » → « 5.00 »). */
function centsToPlain(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

function toNumber(raw: string): number {
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

function plainToCents(raw: string): number {
  return Math.round(toNumber(raw) * 100);
}

const textareaBase =
  'block w-full rounded-xl border bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted transition-colors hover:border-ink focus-visible:border-ink';

/**
 * The border colour is chosen, never layered: `cn()` has no tailwind-merge and
 * the generated sheet lists `.border-line-strong` after `.border-coral-deep`,
 * so an element carrying both would quietly keep the grey one and a refused
 * field would look accepted.
 */
function textareaClasses(invalid: unknown): string {
  return cn(textareaBase, invalid ? 'border-coral-deep' : 'border-line-strong');
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-paper p-4 shadow-card sm:p-6">
      <CardTitle as="h2">{title}</CardTitle>
      {description ? <p className="mt-1 mb-4 text-sm leading-snug text-ink-soft">{description}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

function FieldBlock({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-coral-deep">{error}</p> : null}
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function CheckboxGrid({
  name,
  legend,
  description,
  options,
  selected,
}: {
  name: string;
  legend: string;
  description: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <p className="mt-0.5 mb-2 text-xs text-ink-muted">{description}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.includes(option.value)}
              className="size-4 rounded border-line accent-ink"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type SettingsFormProps = { settings: Settings };

/**
 * The operator's control panel. Saving here stamps `updated_at`, which is the
 * fingerprint every customer receipt carries: an order whose quote was built
 * on the previous settings is refused with a 409 and the fresh price, so
 * nobody is ever charged an amount they did not see.
 */
export function SettingsForm({ settings }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, {});
  // The three well-known pricing rules are guaranteed present once, here, so
  // the panel always has something to edit and the advanced list always has
  // the same indexes as the Zod error paths.
  const [rules, setRules] = useState<FeeRuleDraft[]>(() => withPricingRules(settings.feeRules.map(toDraft)));
  const [rate, setRate] = useState(String(settings.fxRateHtg));
  const [minUsd, setMinUsd] = useState(centsToPlain(settings.minUsdCents));
  const [maxUsd, setMaxUsd] = useState(centsToPlain(settings.maxUsdCents));

  const errors = state.fieldErrors ?? {};
  const serialisedRules = useMemo(() => JSON.stringify(draftsToRules(rules)), [rules]);

  const templateOptions = NOTIFICATION_TEMPLATES.map((template) => ({
    value: template,
    label: TEMPLATE_LABELS[template],
  }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="feeRules" value={serialisedRules} />

      <PricingPanel
        rate={rate}
        onRateChange={setRate}
        rules={rules}
        onRulesChange={setRules}
        minUsdCents={plainToCents(minUsd)}
        maxUsdCents={plainToCents(maxUsd)}
        fieldErrors={errors}
      />

      <Section
        title="Règles de frais avancées"
        description="Pour ce qui sort des quatre valeurs ci-dessus : un frais propre à une méthode, un plancher, un plafond. Les règles s’appliquent dans l’ordre où elles sont listées."
      >
        {errors.feeRules ? <p className="mb-2 text-xs text-coral-deep">{errors.feeRules}</p> : null}
        <FeeRulesEditor rules={rules} onChange={setRules} fieldErrors={errors} />
      </Section>

      <Section title="Limites et délais">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldBlock id="minUsd" label="Montant minimum ($ US)" error={errors.minUsdCents}>
            <Input
              id="minUsd"
              name="minUsd"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              required
              value={minUsd}
              onChange={(e) => setMinUsd(e.target.value)}
              mono
              invalid={Boolean(errors.minUsdCents)}
            />
          </FieldBlock>
          <FieldBlock id="maxUsd" label="Montant maximum ($ US)" error={errors.maxUsdCents}>
            <Input
              id="maxUsd"
              name="maxUsd"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              required
              value={maxUsd}
              onChange={(e) => setMaxUsd(e.target.value)}
              mono
              invalid={Boolean(errors.maxUsdCents)}
            />
          </FieldBlock>
          <FieldBlock
            id="amountToleranceHtg"
            label="Tolérance de montant (HTG)"
            hint="Écart accepté sous le total avant de passer « À vérifier »."
            error={errors.amountToleranceHtg}
          >
            <Input
              id="amountToleranceHtg"
              name="amountToleranceHtg"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              max="5000"
              required
              defaultValue={String(settings.amountToleranceHtg)}
              mono
              invalid={Boolean(errors.amountToleranceHtg)}
            />
          </FieldBlock>
          <FieldBlock
            id="orderTtlMinutes"
            label="Durée de validité (minutes)"
            hint="Au-delà, la commande expire et le client en recrée une."
            error={errors.orderTtlMinutes}
          >
            <Input
              id="orderTtlMinutes"
              name="orderTtlMinutes"
              type="number"
              inputMode="numeric"
              step="1"
              min="5"
              max="1440"
              required
              defaultValue={String(settings.orderTtlMinutes)}
              mono
              invalid={Boolean(errors.orderTtlMinutes)}
            />
          </FieldBlock>
        </div>
      </Section>

      <Section
        title="Notifications"
        description="L’email est le canal qui déclenche vraiment une recharge : gardez au moins une adresse d’opérateur."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock
            id="adminEmails"
            label="Emails de l’opérateur"
            hint="Une adresse par ligne, dix au maximum."
            error={errors.adminEmails}
          >
            <textarea
              id="adminEmails"
              name="adminEmails"
              rows={3}
              defaultValue={settings.adminEmails.join('\n')}
              aria-invalid={Boolean(errors.adminEmails) || undefined}
              className={textareaClasses(errors.adminEmails)}
            />
          </FieldBlock>
          <FieldBlock
            id="adminWhatsappNumbers"
            label="WhatsApp de l’opérateur"
            hint="Format international, par exemple +50937001234. Une par ligne."
            error={errors.adminWhatsappNumbers}
          >
            <textarea
              id="adminWhatsappNumbers"
              name="adminWhatsappNumbers"
              rows={3}
              defaultValue={settings.adminWhatsappNumbers.join('\n')}
              aria-invalid={Boolean(errors.adminWhatsappNumbers) || undefined}
              className={textareaClasses(errors.adminWhatsappNumbers)}
            />
          </FieldBlock>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <CheckboxGrid
            name="notifyAdminEvents"
            legend="Ce qui alerte l’opérateur"
            description="Décochez avec prudence : « Paiement reçu » est ce qui vous dit d’envoyer les dollars."
            options={templateOptions}
            selected={settings.notifyAdminEvents}
          />
          <CheckboxGrid
            name="notifyCustomerEvents"
            legend="Ce que reçoit le client"
            description="Envoyé dans la langue de sa commande, en français ou en kreyòl."
            options={templateOptions.filter((o) => o.value !== 'reminder_24h')}
            selected={settings.notifyCustomerEvents}
          />
        </div>
      </Section>

      <Section title="Identifiant Meru">
        <CheckboxGrid
          name="meruAccountTypes"
          legend="Types d’identifiant acceptés"
          description="Jamais un numéro de téléphone : Meru n’en utilise pas pour recevoir des dollars."
          options={MERU_ACCOUNT_TYPES.map((type) => ({ value: type, label: meruAccountLabelFr(type) }))}
          selected={settings.meruAccountTypes}
        />
        {errors.meruAccountTypes ? <p className="mt-1 text-xs text-coral-deep">{errors.meruAccountTypes}</p> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <FieldBlock id="meruHelpFr" label="Aide, en français" error={errors.meruHelpFr}>
            <textarea
              id="meruHelpFr"
              name="meruHelpFr"
              rows={4}
              maxLength={600}
              required
              defaultValue={settings.meruHelpFr}
              aria-invalid={Boolean(errors.meruHelpFr) || undefined}
              className={textareaClasses(errors.meruHelpFr)}
            />
          </FieldBlock>
          <FieldBlock id="meruHelpHt" label="Aide, en kreyòl" error={errors.meruHelpHt}>
            <textarea
              id="meruHelpHt"
              name="meruHelpHt"
              rows={4}
              maxLength={600}
              required
              defaultValue={settings.meruHelpHt}
              aria-invalid={Boolean(errors.meruHelpHt) || undefined}
              className={textareaClasses(errors.meruHelpHt)}
            />
          </FieldBlock>
        </div>
      </Section>

      <Section title="Identité et support">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldBlock id="businessName" label="Nom commercial" error={errors.businessName}>
            <Input
              id="businessName"
              name="businessName"
              maxLength={60}
              required
              defaultValue={settings.businessName}
              invalid={Boolean(errors.businessName)}
            />
          </FieldBlock>
          <FieldBlock
            id="supportWhatsapp"
            label="WhatsApp support"
            hint="Laissez vide pour masquer le bouton support."
            error={errors.supportWhatsapp}
          >
            <Input
              id="supportWhatsapp"
              name="supportWhatsapp"
              placeholder="+50937001234"
              defaultValue={settings.supportWhatsapp ?? ''}
              invalid={Boolean(errors.supportWhatsapp)}
            />
          </FieldBlock>
          <FieldBlock id="supportHours" label="Horaires annoncés" error={errors.supportHours}>
            <Input
              id="supportHours"
              name="supportHours"
              maxLength={80}
              required
              defaultValue={settings.supportHours}
              invalid={Boolean(errors.supportHours)}
            />
          </FieldBlock>
          <FieldBlock
            id="fulfilmentSlaFr"
            label="Délai annoncé, en français"
            hint="Phrase courte : « moins de 2 heures »."
            error={errors.fulfilmentSlaFr}
          >
            <Input
              id="fulfilmentSlaFr"
              name="fulfilmentSlaFr"
              maxLength={80}
              required
              defaultValue={settings.fulfilmentSlaFr}
              invalid={Boolean(errors.fulfilmentSlaFr)}
            />
          </FieldBlock>
          <FieldBlock id="fulfilmentSlaHt" label="Délai annoncé, en kreyòl" error={errors.fulfilmentSlaHt}>
            <Input
              id="fulfilmentSlaHt"
              name="fulfilmentSlaHt"
              maxLength={80}
              required
              defaultValue={settings.fulfilmentSlaHt}
              invalid={Boolean(errors.fulfilmentSlaHt)}
            />
          </FieldBlock>
        </div>
      </Section>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending} loadingLabel="Enregistrement…" className="w-full sm:w-auto">
          <Save className="size-4" aria-hidden="true" />
          Enregistrer les paramètres
        </Button>
        <p className="text-xs text-ink-muted">
          {settings.updatedAt
            ? `Dernière modification : ${formatDateTime(settings.updatedAt)}.`
            : 'Aucune modification enregistrée : les valeurs par défaut sont utilisées.'}
        </p>
      </div>
    </form>
  );
}
