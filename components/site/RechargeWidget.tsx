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
import { ConfirmStep } from './ConfirmStep';
import { CreatedStep } from './CreatedStep';
import { QuoteReceipt } from './QuoteReceipt';
import { TrustLine } from './TrustLine';

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
 * Three steps, one card: amount + method + details, confirmation, created —
 * and the third is a passage, not a stop: the redirection to the provider
 * leaves on its own as soon as the order exists (`submit`), so « Confirmer »
 * is the last tap the customer owes us.
 *
 * Shaped for a 360px phone first. Three things make it work there:
 * - it is a real `<form>`, so the keyboard's « Suivant » and « OK » keys do
 *   what they promise and the browser can autofill a group of fields;
 * - the total and the button that commits to it never separate: a sticky bar
 *   at the foot of the card carries both, so at no point in a 1 500px form is
 *   the customer asked to continue without seeing what they are about to pay;
 * - every control it can drop, it drops. The « type d'identifiant » select is
 *   inferred from the « @ », the long Meru help sits behind a disclosure, and
 *   the optional email is folded away. Six controls became four.
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
  className?: string;
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

/** No-break space, as in lib/format: « 20 $ US » never splits across lines. */
const NBSP = '\u00a0';

/** « 20 », « 20,50 », « 20.5 » → cents; anything else → null. */
export function parseUsdCents(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Which kind of Meru identifier the customer just typed.
 *
 * An « @ » says « email » and nothing else does — a whole select, ninety
 * pixels and one decision were being spent on a question the value answers
 * by itself. When the operator allows only one kind, that is the answer.
 */
export function inferMeruAccountType(value: string, allowed: MeruAccountType[]): MeruAccountType {
  if (allowed.length === 1) return allowed[0];
  const wantsEmail = value.includes('@');
  if (wantsEmail && allowed.includes('email')) return 'email';
  if (!wantsEmail && allowed.includes('username')) return 'username';
  return allowed[0] ?? 'email';
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
  className,
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
  const [meruAccount, setMeruAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(account?.email ?? '');
  const [emailOpen, setEmailOpen] = useState(Boolean(account?.email));

  const [step, setStep] = useState<'form' | 'confirm' | 'created'>('form');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null);
  /** The quote the server returned with a 409: what the customer must confirm now. */
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const [created, setCreated] = useState<CreatedOrder | null>(null);

  const accountType = inferMeruAccountType(meruAccount, meruAccountTypes);
  const singleAccountType = meruAccountTypes.length === 1;

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
  const unit = locale === 'ht' ? `dola${NBSP}US` : `$${NBSP}US`;

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
    if (!normalizeMeruAccount(accountType, meruAccount)) {
      next.meruAccount = singleAccountType ? t(`widget.fields.meru.${accountType}`) : t('widget.fields.meru.either');
    }
    if (!normalizePhone(phone)) next.phone = t('widget.fields.phone');
    if (email.trim() !== '' && !EMAIL_RE.test(email.trim())) next.email = t('widget.fields.email');
    return next;
  }

  function onContinue() {
    const next = validate();
    setErrors(next);
    // The optional email lives inside a closed disclosure; opening it before
    // the focus lands is the difference between « corrigez ce champ » and a
    // form that refuses without showing why.
    if (next.email) setEmailOpen(true);
    const firstInvalid = Object.keys(next)[0];
    if (firstInvalid) {
      requestAnimationFrame(() => {
        const control = document.getElementById(firstInvalid);
        control?.focus();
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        control?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      });
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
        // Same-origin is already the default; it is written down because the
        // `rm_order` cookie this response sets is what brings the customer
        // back to their order — dropping it would be a silent regression.
        credentials: 'same-origin',
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
        const { redirectUrl } = payload;
        setCreated({
          reference: payload.reference,
          redirectUrl,
          totalHtg: payload.totalHtg ?? expected.totalHtg,
          expiresAt: payload.expiresAt ?? null,
        });
        setStep('created');
        // Straight to the provider — « Confirmer » was the decision, and a
        // second tap on « Payer » only lost people. Nothing is lost by
        // leaving: the response that just arrived carried the `rm_order`
        // cookie (the browser stored it before this line runs), the order's
        // « created » notification has already been dispatched server-side,
        // and /commande/MR-… stays open to whoever holds the reference.
        //
        // The state above is set first so React paints the transition screen
        // — reference, copy button and a working payment link — whatever the
        // navigation then does: on a slow network it is what the customer
        // reads while waiting, and if a blocker swallows the call it is what
        // they act on.
        window.location.assign(redirectUrl);
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
      <Card className={className}>
        <Alert tone="danger" title={t('widget.title')}>
          {t('widget.method.none')}
        </Alert>
      </Card>
    );
  }

  if (step === 'created' && created) {
    return (
      <Card className={className}>
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
      <Card className={className}>
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
      <p className="px-card pb-card text-sm leading-relaxed break-anywhere text-ink-soft">
        {t('widget.account.signedIn', { account: accountLabel })}
      </p>
    ) : null;
  } else if (accountsEnabled) {
    accountNote = (
      <p className="px-card pb-card text-sm leading-relaxed text-ink-soft">
        {t('widget.account.guest')}{' '}
        <Link href="/inscription" className="rounded font-medium text-ink underline underline-offset-2">
          {t('widget.account.guestCta')}
        </Link>
      </p>
    );
  }

  const meruLabel = singleAccountType
    ? t(`widget.details.meruLabel.${accountType}`)
    : t('widget.details.meruLabel.either');
  const meruPlaceholder = singleAccountType
    ? t(`widget.details.meruPlaceholder.${accountType}`)
    : t('widget.details.meruPlaceholder.either');

  return (
    <Card padding="none" className={className}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
        className="space-y-stack p-card"
      >
        <section>
          <h2 className="font-display text-base font-semibold text-ink">{t('widget.amount.title')}</h2>

          {quickAmounts.length > 0 ? (
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label={t('widget.amount.quickHint')}
            >
              {quickAmounts.map((usd) => {
                const selected = usdCents === usd * 100;
                return (
                  <button
                    key={usd}
                    type="button"
                    aria-pressed={selected}
                    // The unit is said once, by the heading and by the field's
                    // own suffix. Repeating « $ US » on five chips cost three
                    // rows of scrolling and told nobody anything new; the
                    // accessible name still carries it in full.
                    aria-label={formatUsdShort(usd * 100, locale)}
                    onClick={() => {
                      setAmount(String(usd));
                      setErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                    className={cn(
                      'inline-flex min-h-tap min-w-12 items-center justify-center rounded-xl border px-3.5 font-display tnum text-base font-semibold transition-colors',
                      selected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line-strong bg-paper text-ink hover:border-ink hover:bg-mist',
                    )}
                  >
                    {usd}
                  </button>
                );
              })}
            </div>
          ) : null}

          <Field
            htmlFor="amount"
            label={t('widget.amount.label')}
            labelHidden
            hint={t('widget.amount.hint', { min: minLabel, max: maxLabel })}
            error={errors.amount}
            className="mt-3"
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
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm whitespace-nowrap text-ink-soft">
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
                      selected ? 'border-ink bg-mist' : 'border-line-strong bg-paper hover:border-ink',
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

        <div className="space-y-3">
          <QuoteReceipt quote={localQuote} locale={locale} method={method} emptyMessage={amountError() || undefined} />
          {/* The one trust sentence that belongs exactly here, where the fees
              are. The other two sit under the card; on a desk all three are in
              the left column and this copy would be a duplicate. */}
          <TrustLine kind="feesVisible" className="lg:hidden" />
        </div>

        <section className="space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">{t('widget.details.title')}</h2>

          <Field htmlFor="customerName" label={t('widget.details.name')} error={errors.customerName}>
            <Input
              id="customerName"
              name="customerName"
              autoComplete="name"
              enterKeyHint="next"
              placeholder={t('widget.details.namePlaceholder')}
              value={customerName}
              invalid={Boolean(errors.customerName)}
              aria-describedby={fieldDescribedBy('customerName', { hint: false, error: errors.customerName })}
              onChange={(event) => {
                setCustomerName(event.target.value);
                setErrors((prev) => ({ ...prev, customerName: undefined }));
              }}
            />
          </Field>

          <Field
            htmlFor="meruAccount"
            label={meruLabel}
            hint={t('widget.details.meruHint')}
            error={errors.meruAccount}
            footer={
              // The operator's help runs to some 175 characters — five lines
              // in the middle of the form. It stays one tap away instead.
              <details className="group">
                <summary className="inline-flex min-h-tap cursor-pointer list-none items-center rounded-lg text-sm font-medium text-ink underline underline-offset-2 [&::-webkit-details-marker]:hidden">
                  {t('widget.details.meruHelpToggle')}
                </summary>
                <p className="pb-1 text-sm leading-relaxed break-anywhere text-ink-soft">{meruHelp}</p>
              </details>
            }
          >
            <Input
              id="meruAccount"
              name="meruAccount"
              autoComplete={accountType === 'email' ? 'email' : 'username'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              // The keyboard must not swap under the thumb as soon as an « @ »
              // is typed: it is chosen from what the operator allows, once.
              inputMode={meruAccountTypes.includes('email') ? 'email' : 'text'}
              placeholder={meruPlaceholder}
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
              enterKeyHint="send"
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

          <details
            open={emailOpen || Boolean(errors.email)}
            onToggle={(event) => setEmailOpen(event.currentTarget.open)}
          >
            <summary className="inline-flex min-h-tap cursor-pointer list-none items-center rounded-lg text-sm font-medium text-ink underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              {t('widget.details.emailToggle')}
            </summary>
            <Field
              htmlFor="email"
              label={t('widget.details.email')}
              optional={t('widget.details.optional')}
              hint={t('widget.details.emailHint')}
              error={errors.email}
              className="pt-2"
            >
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
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
          </details>
        </section>

        {serverErrorKey ? (
          <Alert tone="danger" title={t('errors.title')}>
            {message(serverErrorKey)}
          </Alert>
        ) : null}

        {/*
          The total and the button that commits to it, together, always. On a
          phone this bar is pinned to the bottom of the screen for the whole
          length of the form — the receipt is 900px above by the time the last
          field is filled, and « continuer » with nothing to continue towards
          is exactly how a payment page loses somebody. On `lg` the receipt is
          permanently in view beside the form, so the bar goes back to being
          an ordinary button.
        */}
        <div className="sticky bottom-0 z-20 -mx-card border-t border-line-strong bg-paper/95 px-card pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          {localQuote ? (
            <p className="flex items-baseline justify-between gap-3 pb-2 lg:hidden">
              <span className="text-caption font-medium text-ink-soft">{t('receipt.total')}</span>
              <span className="font-display tnum text-xl font-bold text-ink">{formatHtg(localQuote.totalHtg)}</span>
            </p>
          ) : null}
          <Button type="submit" variant="dark" size="lg" className="w-full">
            {t('widget.continue')}
          </Button>
        </div>
      </form>

      {accountNote}
    </Card>
  );
}
