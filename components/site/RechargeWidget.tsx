'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatHtg, formatUsdShort, type FormatLocale } from '@/lib/format';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { normalizeMeruAccount } from '@/lib/orders/meru-account';
import type { GatewayMode, MeruAccountType, PaymentMethod } from '@/lib/orders/types';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { QUICK_AMOUNTS_USD, computeQuote, type Quote, type QuoteSettings } from '@/lib/pricing/quote';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, fieldDescribedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { Select } from '@/components/ui/Select';
import { ConfirmStep } from './ConfirmStep';
import { CreatedStep } from './CreatedStep';
import { QuoteReceipt } from './QuoteReceipt';

/**
 * The calculator that is also the order form.
 *
 * The receipt fills itself from `computeQuote` — the very function the server
 * runs — against a snapshot of the settings handed down by the page, so no
 * keystroke costs a request. That snapshot's fingerprint (`settingsUpdatedAt`)
 * and the total the customer saw travel with the order; when the server
 * disagrees it answers 409 with a fresh quote, which this component shows
 * before asking for a second, explicit confirmation.
 *
 * Three steps, one card: amount + method + details, confirmation, created.
 */

/** A rail the visitor may actually pay through (already filtered by the page). */
export type WidgetMethod = { method: PaymentMethod; label: string; mode: GatewayMode };

/**
 * The signed-in customer's Clerk profile, or `null` for a guest — which is
 * the ordinary case and the one that must stay untouched. All an account
 * does here is fill two fields in and say where the order will be filed;
 * nothing about the form, the validation or the request changes.
 */
export type WidgetAccount = { email: string | null; name: string | null };

export type RechargeWidgetProps = {
  locale: FormatLocale;
  quoteSettings: QuoteSettings;
  methods: WidgetMethod[];
  meruAccountTypes: MeruAccountType[];
  /** Operator-written help text explaining where to find the Meru identifier. */
  meruHelp: string;
  supportWhatsapp: string | null;
  copyLabel: string;
  copiedLabel: string;
  /** `false` when Clerk is not configured: the widget then says nothing about accounts. */
  accountsEnabled?: boolean;
  account?: WidgetAccount | null;
};

type FieldKey = 'amount' | 'customerName' | 'meruAccount' | 'phone' | 'email';
type FieldErrors = Partial<Record<FieldKey, string>>;

type CreatedOrder = { reference: string; redirectUrl: string; totalHtg: number; expiresAt: string | null };

/** Exactly the keys under `home.errors`; anything else falls back to `unknown`. */
const ERROR_KEYS: readonly string[] = [
  'not_configured',
  'method_unavailable',
  'bad_phone',
  'bad_meru_account',
  'account_type_disabled',
  'bad_amount',
  'below_minimum',
  'above_maximum',
  'wallet_limit',
  'quote_changed',
  'provider_unreachable',
  'provider_error',
  'db_error',
  'rate_limited',
  'validation',
  'network',
  'unknown',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** « 20 », « 20,50 », « 20.5 » → cents; anything else → null. */
export function parseUsdCents(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function RechargeWidget({
  locale,
  quoteSettings,
  methods,
  meruAccountTypes,
  meruHelp,
  supportWhatsapp,
  copyLabel,
  copiedLabel,
  accountsEnabled = false,
  account = null,
}: RechargeWidgetProps) {
  const t = useTranslations('home');

  const quickAmounts = useMemo(
    () =>
      QUICK_AMOUNTS_USD.filter(
        (usd) => usd * 100 >= quoteSettings.minUsdCents && usd * 100 <= quoteSettings.maxUsdCents,
      ),
    [quoteSettings.minUsdCents, quoteSettings.maxUsdCents],
  );

  const [amount, setAmount] = useState(() => {
    const preferred = quickAmounts.includes(20) ? 20 : quickAmounts[0];
    return String(preferred ?? Math.ceil(quoteSettings.minUsdCents / 100));
  });
  const [method, setMethod] = useState<PaymentMethod>(methods[0]?.method ?? 'moncash');
  // Prefilled from the Clerk profile when there is one, and editable like any
  // other field: the name on Meru is not always the name on the account.
  const [customerName, setCustomerName] = useState(account?.name ?? '');
  const [accountType, setAccountType] = useState<MeruAccountType>(meruAccountTypes[0] ?? 'email');
  const [meruAccount, setMeruAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(account?.email ?? '');

  const [step, setStep] = useState<'form' | 'confirm' | 'created'>('form');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null);
  /** The quote the server returned with a 409: what the customer must confirm now. */
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const [created, setCreated] = useState<CreatedOrder | null>(null);

  const usdCents = parseUsdCents(amount);
  const quoteResult = useMemo(
    () =>
      usdCents === null
        ? ({ ok: false, error: 'bad_amount' } as const)
        : computeQuote({ usdCents, method, settings: quoteSettings }),
    [usdCents, method, quoteSettings],
  );
  const localQuote = quoteResult.ok ? quoteResult.quote : null;
  const confirmedQuote = serverQuote ?? localQuote;

  const activeMethod = methods.find((item) => item.method === method) ?? methods[0] ?? null;
  const methodLabel = activeMethod?.label ?? '';
  const sandbox = activeMethod?.mode === 'sandbox';

  const minLabel = formatUsdShort(quoteSettings.minUsdCents, locale);
  const maxLabel = formatUsdShort(quoteSettings.maxUsdCents, locale);
  const unit = locale === 'ht' ? 'dola US' : '$ US';

  /** One place for every error sentence that needs the amounts or the rail's name. */
  function message(key: string): string {
    const known = ERROR_KEYS.includes(key) ? key : 'unknown';
    return t(`errors.${known}`, {
      method: methodLabel,
      min: minLabel,
      max: maxLabel,
      limit: formatHtg(HTG_WALLET_MAX),
    });
  }

  function amountError(): string {
    if (quoteResult.ok) return '';
    return quoteResult.error === 'bad_amount' ? t('widget.fields.amount') : message(quoteResult.error);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!quoteResult.ok) next.amount = amountError();
    const name = customerName.trim();
    if (name.length < 2 || name.length > 80) next.customerName = t('widget.fields.name');
    if (!normalizeMeruAccount(accountType, meruAccount)) next.meruAccount = t(`widget.fields.meru.${accountType}`);
    if (!normalizePhone(phone)) next.phone = t('widget.fields.phone');
    if (email.trim() !== '' && !EMAIL_RE.test(email.trim())) next.email = t('widget.fields.email');
    return next;
  }

  function onContinue() {
    const next = validate();
    setErrors(next);
    const firstInvalid = Object.keys(next)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setServerErrorKey(null);
    setServerQuote(null);
    setStep('confirm');
  }

  function onEdit() {
    setServerErrorKey(null);
    setServerQuote(null);
    setStep('form');
  }

  async function submit(expected: Quote) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedAccount = normalizeMeruAccount(accountType, meruAccount);
    if (!normalizedPhone || !normalizedAccount) {
      setErrors(validate());
      setStep('form');
      return;
    }

    setSubmitting(true);
    setServerErrorKey(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          usdCents: expected.usdCents,
          method,
          customerName: customerName.trim(),
          customerPhone: normalizedPhone,
          customerEmail: email.trim() === '' ? null : email.trim().toLowerCase(),
          meruAccountType: accountType,
          meruAccount: normalizedAccount,
          locale,
          expectedTotalHtg: expected.totalHtg,
          settingsUpdatedAt: expected.settingsUpdatedAt,
        }),
      });

      const body: unknown = await response.json().catch(() => null);
      const payload = (body ?? {}) as {
        ok?: boolean;
        error?: string;
        quote?: Quote;
        reference?: string;
        redirectUrl?: string;
        totalHtg?: number;
        expiresAt?: string;
      };

      if (response.ok && payload.ok === true && payload.reference && payload.redirectUrl) {
        setCreated({
          reference: payload.reference,
          redirectUrl: payload.redirectUrl,
          totalHtg: payload.totalHtg ?? expected.totalHtg,
          expiresAt: payload.expiresAt ?? null,
        });
        setStep('created');
        return;
      }

      if (response.status === 409 && payload.quote) {
        setServerQuote(payload.quote);
        setServerErrorKey('quote_changed');
        return;
      }

      setServerErrorKey(payload.error ?? (response.status === 429 ? 'rate_limited' : 'unknown'));
    } catch {
      setServerErrorKey('network');
    } finally {
      setSubmitting(false);
    }
  }

  if (methods.length === 0) {
    return (
      <Card>
        <Alert tone="danger" title={t('widget.title')}>
          {t('widget.method.none')}
        </Alert>
      </Card>
    );
  }

  if (step === 'created' && created) {
    return (
      <Card>
        <CreatedStep
          reference={created.reference}
          redirectUrl={created.redirectUrl}
          totalHtg={created.totalHtg}
          method={method}
          expiresAt={created.expiresAt ? new Date(created.expiresAt) : null}
          supportWhatsapp={supportWhatsapp}
          sandbox={sandbox}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      </Card>
    );
  }

  if (step === 'confirm' && confirmedQuote) {
    const notice =
      serverErrorKey && serverErrorKey !== 'quote_changed' ? (
        <Alert tone="danger" title={t('errors.title')}>
          {message(serverErrorKey)}
        </Alert>
      ) : null;

    return (
      <Card>
        <ConfirmStep
          locale={locale}
          quote={confirmedQuote}
          method={method}
          customerName={customerName.trim()}
          meruAccount={normalizeMeruAccount(accountType, meruAccount) ?? meruAccount.trim()}
          meruAccountLabel={t(`widget.details.meruTypes.${accountType}`)}
          phone={formatPhone(normalizePhone(phone) ?? phone)}
          email={email.trim() === '' ? null : email.trim().toLowerCase()}
          sandbox={sandbox}
          submitting={submitting}
          changed={serverQuote !== null}
          notice={notice}
          onEdit={onEdit}
          onSubmit={() => void submit(confirmedQuote)}
        />
      </Card>
    );
  }

  // One quiet line under the form, in the same place whichever it is: who
  // this order will be filed under, or — for the guest checkout that is and
  // stays the default — that an account is optional and only buys a history.
  // Nothing at all when accounts are switched off.
  const accountLabel = account?.email ?? account?.name ?? null;
  let accountNote: ReactNode = null;
  if (accountsEnabled && account !== null) {
    accountNote = accountLabel ? (
      <p className="text-sm leading-relaxed text-ink-soft">
        {t('widget.account.signedIn', { account: accountLabel })}
      </p>
    ) : null;
  } else if (accountsEnabled) {
    accountNote = (
      <p className="text-sm leading-relaxed text-ink-soft">
        {t('widget.account.guest')}{' '}
        <Link href="/inscription" className="rounded font-medium text-ink underline underline-offset-2">
          {t('widget.account.guestCta')}
        </Link>
      </p>
    );
  }

  return (
    <Card padding="none">
      <div className="space-y-7 p-5 sm:p-6">
        <section>
          <h2 className="font-display text-base font-semibold text-ink">{t('widget.amount.title')}</h2>

          {quickAmounts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('widget.amount.quick')}>
              {quickAmounts.map((usd) => {
                const selected = usdCents === usd * 100;
                return (
                  <button
                    key={usd}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAmount(String(usd));
                      setErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                    className={cn(
                      'min-h-10 rounded-xl border px-3.5 font-display tnum text-[15px] font-semibold transition-colors',
                      selected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line bg-paper text-ink hover:border-ink-muted hover:bg-mist',
                    )}
                  >
                    {formatUsdShort(usd * 100, locale)}
                  </button>
                );
              })}
            </div>
          ) : null}

          <Field
            htmlFor="amount"
            label={t('widget.amount.label')}
            hint={t('widget.amount.hint', { min: minLabel, max: maxLabel })}
            error={errors.amount}
            className="mt-4"
          >
            <div className="relative">
              <Input
                id="amount"
                name="amount"
                mono
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="next"
                className="pr-20 text-xl"
                value={amount}
                invalid={Boolean(errors.amount)}
                aria-describedby={fieldDescribedBy('amount', { hint: true, error: errors.amount })}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-soft">
                {unit}
              </span>
            </div>
          </Field>
        </section>

        <section>
          <fieldset>
            <legend className="font-display text-base font-semibold text-ink">{t('widget.method.title')}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {methods.map((item) => {
                const selected = item.method === method;
                return (
                  <label
                    key={item.method}
                    className={cn(
                      'flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                      selected ? 'border-ink bg-mist' : 'border-line bg-paper hover:border-ink-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={item.method}
                      checked={selected}
                      onChange={() => setMethod(item.method)}
                      className="size-4 shrink-0 accent-ink"
                    />
                    <MethodBadge method={item.method} label={item.label} />
                  </label>
                );
              })}
            </div>
          </fieldset>
          {sandbox ? (
            <p className="mt-2 text-sm text-coral-deep">{t('widget.method.sandbox', { method: methodLabel })}</p>
          ) : null}
        </section>

        <QuoteReceipt quote={localQuote} locale={locale} method={method} emptyMessage={amountError() || undefined} />

        <section className="space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">{t('widget.details.title')}</h2>

          <Field
            htmlFor="customerName"
            label={t('widget.details.name')}
            hint={t('widget.details.nameHint')}
            error={errors.customerName}
          >
            <Input
              id="customerName"
              name="customerName"
              autoComplete="name"
              placeholder={t('widget.details.namePlaceholder')}
              value={customerName}
              invalid={Boolean(errors.customerName)}
              aria-describedby={fieldDescribedBy('customerName', { hint: true, error: errors.customerName })}
              onChange={(event) => {
                setCustomerName(event.target.value);
                setErrors((prev) => ({ ...prev, customerName: undefined }));
              }}
            />
          </Field>

          {meruAccountTypes.length > 1 ? (
            <Field htmlFor="meruAccountType" label={t('widget.details.meruType')}>
              <Select
                id="meruAccountType"
                name="meruAccountType"
                value={accountType}
                onChange={(event) => {
                  setAccountType(event.target.value as MeruAccountType);
                  setErrors((prev) => ({ ...prev, meruAccount: undefined }));
                }}
              >
                {meruAccountTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`widget.details.meruTypes.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            htmlFor="meruAccount"
            label={t(`widget.details.meruLabel.${accountType}`)}
            hint={meruHelp}
            error={errors.meruAccount}
          >
            <Input
              id="meruAccount"
              name="meruAccount"
              autoComplete={accountType === 'email' ? 'email' : 'username'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode={accountType === 'email' ? 'email' : 'text'}
              placeholder={t(`widget.details.meruPlaceholder.${accountType}`)}
              value={meruAccount}
              invalid={Boolean(errors.meruAccount)}
              aria-describedby={fieldDescribedBy('meruAccount', { hint: true, error: errors.meruAccount })}
              onChange={(event) => {
                setMeruAccount(event.target.value);
                setErrors((prev) => ({ ...prev, meruAccount: undefined }));
              }}
            />
          </Field>

          <Field
            htmlFor="phone"
            label={t('widget.details.phone')}
            hint={t('widget.details.phoneHint')}
            error={errors.phone}
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              mono
              inputMode="tel"
              autoComplete="tel"
              placeholder={t('widget.details.phonePlaceholder')}
              value={phone}
              invalid={Boolean(errors.phone)}
              aria-describedby={fieldDescribedBy('phone', { hint: true, error: errors.phone })}
              onChange={(event) => {
                setPhone(event.target.value);
                setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
            />
          </Field>

          <Field
            htmlFor="email"
            label={t('widget.details.email')}
            optional={t('widget.details.optional')}
            hint={t('widget.details.emailHint')}
            error={errors.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('widget.details.emailPlaceholder')}
              value={email}
              invalid={Boolean(errors.email)}
              aria-describedby={fieldDescribedBy('email', { hint: true, error: errors.email })}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
          </Field>
        </section>

        {serverErrorKey ? (
          <Alert tone="danger" title={t('errors.title')}>
            {message(serverErrorKey)}
          </Alert>
        ) : null}

        <Button variant="dark" size="lg" className="w-full" onClick={onContinue}>
          {t('widget.continue')}
        </Button>

        {accountNote}
      </div>
    </Card>
  );
}
