'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { track } from '@/lib/analytics/client';
import { cn } from '@/lib/cn';
import { formatHtg, formatRate, formatUsdShort, type FormatLocale } from '@/lib/format';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { normalizeMeruAccount } from '@/lib/orders/meru-account';
import type { GatewayMode, MeruAccountType, PaymentMethod } from '@/lib/orders/types';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { QUICK_AMOUNTS_USD, computeQuote, type Quote, type QuoteSettings } from '@/lib/pricing/quote';
import { Alert } from '@/components/ui/Alert';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Button } from '@/components/ui/Button';
import { Field, fieldDescribedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { ConfirmStep } from './ConfirmStep';
import { CreatedStep } from './CreatedStep';
import { QuoteLines } from './QuoteReceipt';

/**
 * The calculator that is also the order form — three short screens instead
 * of one long one.
 *
 *   1. « Combien ? »  the amount, the wallet, and the gourde total, live;
 *   2. « Pour qui ? » the name, the Meru identifier, the WhatsApp number;
 *   3. « Vérifiez »   the frozen receipt and the one button that commits.
 *
 * One question per screen is what makes the form readable by somebody who
 * has never bought anything online: each screen asks one thing, in one short
 * sentence, and the progress bar above says how many are left. The total is
 * always on screen and always the biggest thing on it — on a phone it rides
 * in a bar pinned to the bottom, with the button that moves on.
 *
 * The receipt fills itself from `computeQuote` — the very function the server
 * runs — against a snapshot of the settings handed down by the page, so no
 * keystroke costs a request. That snapshot's fingerprint (`settingsUpdatedAt`)
 * and the total the customer saw travel with the order; when the server
 * disagrees it answers 409 with a fresh quote, which the last screen shows
 * before asking for a second, explicit confirmation.
 *
 * « Confirmer » is the last tap the customer owes us: the redirection to the
 * provider leaves on its own as soon as the order exists (`submit`).
 */

/** A rail the visitor may actually pay through (already filtered by the page). */
export type WidgetMethod = { method: PaymentMethod; label: string; mode: GatewayMode };

/**
 * The signed-in customer's Clerk profile, or `null` for a guest — which is
 * the ordinary case and the one that must stay untouched. All an account
 * does here is fill two fields in and say where the order will be filed.
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

type Step = 'amount' | 'details' | 'confirm' | 'created';
const FLOW: readonly Step[] = ['amount', 'details', 'confirm'];

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
const NBSP = ' ';

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

/** The disclosure summary style of « Où le trouver ? ». */
const DISCLOSURE =
  'inline-flex min-h-tap cursor-pointer list-none items-center rounded-lg text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink [&::-webkit-details-marker]:hidden';

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
  const [priceOpen, setPriceOpen] = useState(false);

  const [step, setStep] = useState<Step>('amount');
  /** Which way the last move went; `null` until the first one, so nothing slides on page load. */
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null);
  /** The quote the server returned with a 409: what the customer must confirm now. */
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const [created, setCreated] = useState<CreatedOrder | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  /*
   * After a move between screens: the new screen's title takes the focus (a
   * screen reader announces where it landed) and, on a phone scrolled down to
   * the bottom bar, the card comes back into view from its top.
   */
  useEffect(() => {
    if (direction === null) return;
    headingRef.current?.focus({ preventScroll: true });
    const root = rootRef.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [step, direction]);

  function go(next: Step) {
    setDirection(FLOW.indexOf(next) >= FLOW.indexOf(step) ? 'forward' : 'back');
    setStep(next);
    // The funnel of /admin/visites: which screen each visitor reached.
    track('step', next);
  }

  /** Which fields refused — their names only, never what was typed in them. */
  function trackRefused(next: FieldErrors) {
    const fields = Object.keys(next).filter((key) => next[key as FieldKey]);
    if (fields.length > 0) track('error', 'formulaire', { target: fields.join(',') });
  }

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

  function focusFirst(next: FieldErrors) {
    const firstInvalid = Object.keys(next).find((key) => next[key as FieldKey]);
    if (!firstInvalid) return;
    requestAnimationFrame(() => {
      const control = document.getElementById(firstInvalid);
      control?.focus();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      control?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  function validateDetails(): FieldErrors {
    const next: FieldErrors = {};
    const name = customerName.trim();
    if (name.length < 2 || name.length > 80) next.customerName = t('widget.fields.name');
    if (!normalizeMeruAccount(accountType, meruAccount)) {
      next.meruAccount = singleAccountType ? t(`widget.fields.meru.${accountType}`) : t('widget.fields.meru.either');
    }
    if (!normalizePhone(phone)) next.phone = t('widget.fields.phone');
    if (email.trim() !== '' && !EMAIL_RE.test(email.trim())) next.email = t('widget.fields.email');
    return next;
  }

  function onAmountContinue() {
    if (!quoteResult.ok) {
      const next = { amount: amountError() };
      setErrors(next);
      trackRefused(next);
      focusFirst(next);
      return;
    }
    setErrors({});
    go('details');
  }

  function onDetailsContinue() {
    const next = validateDetails();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      trackRefused(next);
      focusFirst(next);
      return;
    }
    setServerErrorKey(null);
    setServerQuote(null);
    go('confirm');
  }

  async function submit(expected: Quote) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedAccount = normalizeMeruAccount(accountType, meruAccount);
    if (!normalizedPhone || !normalizedAccount) {
      setErrors(validateDetails());
      go('details');
      return;
    }

    setSubmitting(true);
    track('submit', 'commande', { target: method, value: expected.usdCents });
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
        setDirection('forward');
        setStep('created');
        track('step', 'created');
        // Straight to the provider — « Confirmer » was the decision. Nothing
        // is lost by leaving: the response that just arrived carried the
        // `rm_order` cookie, the order's « created » notification has already
        // been dispatched server-side, and /commande/MR-… stays open to
        // whoever holds the reference. The state above is set first so React
        // paints the transition screen — reference, copy button and a working
        // payment link — whatever the navigation then does.
        window.location.assign(redirectUrl);
        return;
      }

      if (response.status === 409 && payload.quote) {
        setServerQuote(payload.quote);
        setServerErrorKey('quote_changed');
        track('error', 'serveur', { target: 'quote_changed' });
        return;
      }

      const refused = payload.error ?? (response.status === 429 ? 'rate_limited' : 'unknown');
      setServerErrorKey(refused);
      track('error', 'serveur', { target: refused });
    } catch {
      setServerErrorKey('network');
      track('error', 'serveur', { target: 'network' });
    } finally {
      setSubmitting(false);
    }
  }

  if (methods.length === 0) {
    return (
      <div className={cn('rounded-[1.75rem] border border-line bg-paper p-card shadow-lift', className)}>
        <Alert tone="danger" title={t('widget.title')}>
          {t('widget.method.none')}
        </Alert>
      </div>
    );
  }

  const stepIndex = step === 'created' ? FLOW.length : FLOW.indexOf(step);
  const motion =
    direction === 'forward' ? 'animate-step-forward' : direction === 'back' ? 'animate-step-back' : undefined;

  let screen: ReactNode;

  if (step === 'created' && created) {
    screen = (
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
    );
  } else if (step === 'confirm' && confirmedQuote) {
    const notice =
      serverErrorKey && serverErrorKey !== 'quote_changed' ? (
        <Alert tone="danger" title={t('errors.title')}>
          {message(serverErrorKey)}
        </Alert>
      ) : null;

    screen = (
      <>
        <BackButton label={t('widget.back')} onClick={() => go('details')} disabled={submitting} />
        <ConfirmStep
          headingRef={headingRef}
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
          onEdit={() => go('details')}
          onSubmit={() => void submit(confirmedQuote)}
        />
      </>
    );
  } else if (step === 'details') {
    screen = (
      <DetailsScreen
        headingRef={headingRef}
        t={t}
        locale={locale}
        quote={localQuote}
        methodLabel={methodLabel}
        accountType={accountType}
        singleAccountType={singleAccountType}
        meruAccountTypes={meruAccountTypes}
        meruHelp={meruHelp}
        customerName={customerName}
        meruAccount={meruAccount}
        phone={phone}
        email={email}
        errors={errors}
        accountsEnabled={accountsEnabled}
        account={account}
        onBack={() => go('amount')}
        onName={(value) => {
          setCustomerName(value);
          setErrors((prev) => ({ ...prev, customerName: undefined }));
        }}
        onMeru={(value) => {
          setMeruAccount(value);
          setErrors((prev) => ({ ...prev, meruAccount: undefined }));
        }}
        onPhone={(value) => {
          setPhone(value);
          setErrors((prev) => ({ ...prev, phone: undefined }));
        }}
        onEmail={(value) => {
          setEmail(value);
          setErrors((prev) => ({ ...prev, email: undefined }));
        }}
        onContinue={onDetailsContinue}
      />
    );
  } else {
    // What the amount field is saying right now, before any « Continuer »:
    // a figure out of bounds is flagged as it is typed, an empty field is not.
    const liveAmountError = usdCents !== null && !quoteResult.ok ? message(quoteResult.error) : null;
    const amountMessage = errors.amount ?? liveAmountError;

    screen = (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onAmountContinue();
        }}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-xl leading-tight font-semibold tracking-tight text-ink outline-none sm:text-2xl"
        >
          {t('widget.amount.title')}
        </h2>

        <div className="mt-4">
          <label htmlFor="amount" className="sr-only">
            {t('widget.amount.label')}
          </label>
          <div className="relative">
            <Input
              id="amount"
              name="amount"
              mono
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              className="min-h-16 rounded-2xl pr-24 text-[2rem] leading-none font-semibold"
              value={amount}
              invalid={Boolean(amountMessage)}
              aria-describedby="amount-hint"
              onChange={(event) => {
                setAmount(event.target.value);
                setErrors((prev) => ({ ...prev, amount: undefined }));
              }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-display text-lg font-semibold whitespace-nowrap text-ink-soft">
              {unit}
            </span>
          </div>
          <p
            id="amount-hint"
            aria-live="polite"
            className={cn('mt-2 text-sm', amountMessage ? 'font-medium text-coral-deep' : 'text-ink-soft')}
          >
            {amountMessage ?? t('widget.amount.hint', { min: minLabel, max: maxLabel })}
          </p>
        </div>

        {quickAmounts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('widget.amount.quickHint')}>
            {quickAmounts.map((usd) => {
              const selected = usdCents === usd * 100;
              return (
                <button
                  key={usd}
                  type="button"
                  aria-pressed={selected}
                  aria-label={formatUsdShort(usd * 100, locale)}
                  onClick={() => {
                    setAmount(String(usd));
                    setErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                  className={cn(
                    'inline-flex min-h-tap min-w-14 items-center justify-center rounded-full border px-4 font-display text-base font-semibold tnum transition-[background-color,border-color,color,transform] duration-200 active:scale-95',
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

        <fieldset className="mt-6">
          <legend className="font-display text-base font-semibold text-ink">{t('widget.method.title')}</legend>
          <div className={cn('mt-2.5 grid gap-2.5', methods.length > 1 && 'grid-cols-2')}>
            {methods.map((item) => {
              const selected = item.method === method;
              return (
                <label
                  key={item.method}
                  data-track={`Payer avec ${item.label}`}
                  className={cn(
                    'relative flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
                    selected
                      ? 'border-ink bg-paper shadow-card'
                      : 'border-line bg-mist/60 hover:border-line-strong hover:bg-paper',
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={item.method}
                    checked={selected}
                    onChange={() => setMethod(item.method)}
                    className="sr-only"
                  />
                  <MethodBadge method={item.method} label={item.label} size="lg" className="min-w-0" />
                  {selected ? (
                    <span
                      className="absolute -top-2 -right-2 flex size-6 animate-pop items-center justify-center rounded-full bg-ink text-paper ring-4 ring-paper"
                      aria-hidden="true"
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          {sandbox ? (
            <p className="mt-2 text-sm text-coral-deep">{t('widget.method.sandbox', { method: methodLabel })}</p>
          ) : null}
        </fieldset>

        {localQuote ? (
          <div className="mt-5">
            <button
              type="button"
              aria-expanded={priceOpen}
              aria-controls="price-detail"
              onClick={() => setPriceOpen((open) => !open)}
              className="inline-flex min-h-tap items-center gap-1.5 rounded-lg text-sm font-medium text-ink"
            >
              {priceOpen ? t('widget.price.hide') : t('widget.price.show')}
              <ChevronDown
                className={cn('size-4 text-ink-soft transition-transform duration-300', priceOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            <div id="price-detail" className="reveal" data-open={priceOpen} inert={!priceOpen}>
              <div>
                <div className="mt-1 rounded-2xl bg-mist px-4 py-3">
                  <QuoteLines quote={localQuote} locale={locale} />
                  <p className="mt-2 border-t border-line pt-2 text-sm font-medium tnum text-ink">
                    {t('receipt.effective', { rate: formatRate(localQuote.effectiveRateHtg, locale) })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <TotalBar
          label={t('widget.total.label')}
          note={
            localQuote
              ? t('widget.total.note', { usd: formatUsdShort(localQuote.usdCents, locale) })
              : t('receipt.placeholder')
          }
          totalHtg={localQuote?.totalHtg ?? null}
        >
          <Button type="submit" variant="dark" size="lg" className="w-full">
            {t('widget.continue')}
          </Button>
        </TotalBar>
      </form>
    );
  }

  return (
    <div
      ref={rootRef}
      // `overflow-x: clip` keeps the sideways slide between screens inside the
      // card — a phone would otherwise widen the page for its 28px — without
      // making the card a scroll container, so the total bar still sticks.
      className={cn('scroll-mt-4 overflow-x-clip rounded-[1.75rem] border border-line bg-paper p-card shadow-lift', className)}
    >
      {step === 'created' ? null : <Stepper current={stepIndex} t={t} />}
      <div key={step} className={cn(step === 'created' ? undefined : 'mt-5', motion)}>
        {screen}
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<'home'>>;

/**
 * Three bars that fill as the customer moves on, each named. The numbers are
 * said to screen readers (« étape 2 sur 3 ») and shown by the bars themselves.
 */
function Stepper({ current, t }: { current: number; t: Translate }) {
  const labels = [t('widget.steps.amount'), t('widget.steps.details'), t('widget.steps.confirm')];
  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {t('widget.stepOf', { current: Math.min(current + 1, labels.length), total: labels.length })}
      </p>
      <ol className="grid grid-cols-3 gap-2" aria-hidden="true">
        {labels.map((label, index) => (
          <li key={label} className="min-w-0">
            <span className="block h-1.5 overflow-hidden rounded-full bg-mist">
              <span
                className={cn(
                  'block h-full origin-left rounded-full bg-ink transition-transform duration-500 ease-out',
                  index <= current ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </span>
            <span
              className={cn(
                'mt-1.5 block truncate text-xs font-semibold transition-colors duration-300',
                index === current ? 'text-ink' : index < current ? 'text-ink-soft' : 'text-ink-muted',
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BackButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="-ml-2 mb-2 inline-flex min-h-tap items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-soft transition-colors hover:bg-mist hover:text-ink disabled:opacity-50"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * The total and the button that moves on, together, always. On a phone the
 * bar is pinned to the bottom of the screen — the total is what the customer
 * checks after every tap, and « continuer » with nothing to continue towards
 * is exactly how a payment page loses somebody. From `lg` up the card is
 * short enough to sit whole beside the page, and the bar is an ordinary footer.
 */
function TotalBar({
  label,
  note,
  totalHtg,
  children,
}: {
  label: string;
  note: string;
  totalHtg: number | null;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-card mt-5 border-t border-line bg-paper/95 px-card pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mx-0 lg:mt-6 lg:bg-transparent lg:px-0 lg:pt-5 lg:pb-0 lg:backdrop-blur-none">
      <div className="flex items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs leading-snug text-ink-soft">{note}</p>
        </div>
        {totalHtg === null ? (
          <span className="font-display text-3xl font-bold text-ink-muted">—</span>
        ) : (
          <AnimatedNumber
            value={totalHtg}
            format={(value) => formatHtg(Math.round(value))}
            className="shrink-0 font-display text-[1.75rem] leading-none font-bold tracking-tight tnum text-ink sm:text-4xl"
          />
        )}
      </div>
      {children}
    </div>
  );
}

type DetailsScreenProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  t: Translate;
  locale: FormatLocale;
  quote: Quote | null;
  methodLabel: string;
  accountType: MeruAccountType;
  singleAccountType: boolean;
  meruAccountTypes: MeruAccountType[];
  meruHelp: string;
  customerName: string;
  meruAccount: string;
  phone: string;
  email: string;
  errors: FieldErrors;
  accountsEnabled: boolean;
  account: WidgetAccount | null;
  onBack: () => void;
  onName: (value: string) => void;
  onMeru: (value: string) => void;
  onPhone: (value: string) => void;
  onEmail: (value: string) => void;
  onContinue: () => void;
};

/** Screen 2: where the dollars go and how to reach the customer. */
function DetailsScreen({
  headingRef,
  t,
  locale,
  quote,
  methodLabel,
  accountType,
  singleAccountType,
  meruAccountTypes,
  meruHelp,
  customerName,
  meruAccount,
  phone,
  email,
  errors,
  accountsEnabled,
  account,
  onBack,
  onName,
  onMeru,
  onPhone,
  onEmail,
  onContinue,
}: DetailsScreenProps) {
  const meruLabel = singleAccountType
    ? t(`widget.details.meruLabel.${accountType}`)
    : t('widget.details.meruLabel.either');
  const meruPlaceholder = singleAccountType
    ? t(`widget.details.meruPlaceholder.${accountType}`)
    : t('widget.details.meruPlaceholder.either');

  // One quiet line under the form: who this order will be filed under, or —
  // for the guest checkout that is and stays the default — that an account is
  // optional and only buys a history. Nothing at all when accounts are off.
  const accountLabel = account?.email ?? account?.name ?? null;
  let accountNote: ReactNode = null;
  if (accountsEnabled && account !== null) {
    accountNote = accountLabel ? (
      <p className="mt-4 text-sm leading-relaxed break-anywhere text-ink-soft">
        {t('widget.account.signedIn', { account: accountLabel })}
      </p>
    ) : null;
  } else if (accountsEnabled) {
    accountNote = (
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        {t('widget.account.guest')}{' '}
        <Link href="/inscription" className="rounded font-medium text-ink underline underline-offset-2">
          {t('widget.account.guestCta')}
        </Link>
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <BackButton label={t('widget.back')} onClick={onBack} />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-xl leading-tight font-semibold tracking-tight text-ink outline-none sm:text-2xl"
      >
        {t('widget.details.title')}
      </h2>

      {quote ? (
        <button
          type="button"
          onClick={onBack}
          data-track="Modifier la recharge"
          className="group mt-4 flex w-full items-center justify-between gap-3 rounded-2xl bg-mist px-4 py-3 text-left transition-colors hover:bg-line/60"
        >
          <span className="min-w-0">
            <span className="block text-xs text-ink-soft">{t('widget.recap.label', { method: methodLabel })}</span>
            <span className="block font-display text-base font-semibold tnum text-ink">
              {formatUsdShort(quote.usdCents, locale)}
              <span className="px-1.5 font-normal text-ink-muted">·</span>
              {formatHtg(quote.totalHtg)}
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 group-hover:decoration-ink">
            {t('widget.recap.edit')}
          </span>
        </button>
      ) : null}

      <div className="mt-5 space-y-4">
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
            onChange={(event) => onName(event.target.value)}
          />
        </Field>

        <Field
          htmlFor="meruAccount"
          label={meruLabel}
          hint={t('widget.details.meruHint')}
          error={errors.meruAccount}
          footer={
            // The operator's help runs to some 175 characters — five lines in
            // the middle of the form. It stays one tap away instead.
            <details className="group">
              <summary className={DISCLOSURE}>{t('widget.details.meruHelpToggle')}</summary>
              <p className="animate-drop pb-1 text-sm leading-relaxed break-anywhere text-ink-soft">{meruHelp}</p>
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
            onChange={(event) => onMeru(event.target.value)}
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
            onChange={(event) => onPhone(event.target.value)}
          />
        </Field>

        {/* Always open: the confirmation by email is on by default, and the
            field only has to be left empty to go without it. */}
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
            enterKeyHint="done"
            placeholder={t('widget.details.emailPlaceholder')}
            value={email}
            invalid={Boolean(errors.email)}
            aria-describedby={fieldDescribedBy('email', { hint: true, error: errors.email })}
            onChange={(event) => onEmail(event.target.value)}
          />
        </Field>
      </div>

      <TotalBar
        label={t('widget.total.label')}
        note={quote ? t('widget.total.note', { usd: formatUsdShort(quote.usdCents, locale) }) : ''}
        totalHtg={quote?.totalHtg ?? null}
      >
        <Button type="submit" variant="dark" size="lg" className="w-full">
          {t('widget.continue')}
        </Button>
      </TotalBar>

      {accountNote}
    </form>
  );
}
