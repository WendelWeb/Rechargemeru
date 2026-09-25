import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { MessageCircle, Receipt, ShieldCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { currentAdmin } from '@/lib/auth/admin';
import { clerkConfigured, currentUserEmail, currentUserId, currentUserName } from '@/lib/auth/clerk';
import { ORDER_COOKIE } from '@/lib/orders/cookie';
import { getOrderByReference } from '@/lib/orders/queries';
import { normalizeReference } from '@/lib/orders/reference';
import { isExpired } from '@/lib/orders/transitions';
import { availableMethods } from '@/lib/payments/checkout';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { PRICE_BOARD_USD, computeQuote } from '@/lib/pricing/quote';
import { getSettings, toQuoteSettings } from '@/lib/settings/store';
import { HowItWorks } from '@/components/site/HowItWorks';
import { PriceBoard, type PriceRow } from '@/components/site/PriceBoard';
import { RechargeWidget } from '@/components/site/RechargeWidget';
import { ResumeBanner } from '@/components/site/ResumeBanner';
import { SupportBlock } from '@/components/site/SupportBlock';

/** Every page reads the live settings and the visitor's cookies. */
export const dynamic = 'force-dynamic';

type HomeProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'home' });
  return { title: t('meta.title'), description: t('meta.description') };
}

/**
 * The home page is the calculator. The server hands the widget a snapshot of
 * the settings (rate, fee rules, bounds and the `settingsUpdatedAt`
 * fingerprint) so the receipt fills itself as the customer types, without a
 * request per keystroke, and the order it eventually posts carries the exact
 * total that was on screen.
 *
 * Which rails appear is decided here too: a rail pointing at a sandbox is
 * only offered to the operator's own browser on the production deployment,
 * so no visitor can create an order that would never move real money.
 *
 * On a phone this page is read top to bottom in the first ten seconds, so
 * what it puts in those ten seconds is the whole design: a two-line title, a
 * one-line promise, and the form — whose first screen already shows the
 * total in gourdes. The reasons to trust the service, the price board and
 * the steps come after; on a desk they sit in the left column instead.
 */
export default async function HomePage({ params }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const appLocale = locale as AppLocale;

  const [settings, admin, userId, t, c] = await Promise.all([
    getSettings(),
    currentAdmin(),
    currentUserId(),
    getTranslations({ locale, namespace: 'home' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);

  // An account changes nothing about the order: it only fills in the two
  // fields Clerk can vouch for and tells the customer where the order will be
  // filed. A guest sees the very same form, in the very same number of steps.
  const accountsEnabled = clerkConfigured();
  const [accountEmail, accountName] =
    userId === null ? [null, null] : await Promise.all([currentUserEmail(), currentUserName()]);
  const account = userId === null ? null : { email: accountEmail, name: accountName };

  const methods = availableMethods(admin !== null)
    .filter((item) => item.available)
    .map((item) => ({ method: item.method, label: item.label, mode: item.mode }));

  const cookieReference = normalizeReference((await cookies()).get(ORDER_COOKIE)?.value ?? '');
  const resumable = cookieReference ? await getOrderByReference(cookieReference) : null;
  const resume =
    resumable &&
    (resumable.status === 'paid' ||
      resumable.status === 'needs_review' ||
      (resumable.status === 'pending_payment' && !isExpired(resumable)))
      ? resumable
      : null;

  const sla = appLocale === 'ht' ? settings.fulfilmentSlaHt : settings.fulfilmentSlaFr;
  const meruHelp = appLocale === 'ht' ? settings.meruHelpHt : settings.meruHelpFr;

  const quoteSettings = toQuoteSettings(settings);

  // « Les prix du jour », run through the same quote engine the receipt uses,
  // for each quick amount and each wallet on offer. Advertising the bare
  // exchange rate above a receipt that charges a fifth more is the one thing
  // a money service cannot afford; the board shows totals, rate in small type.
  // The board prices even the amounts over the wallet ceiling (500 $ US at
  // today's rate) and flags them, rather than hiding a price the customer
  // asked about; the order form keeps refusing them.
  const offered = PRICE_BOARD_USD.filter(
    (usd) => usd * 100 >= settings.minUsdCents && usd * 100 <= settings.maxUsdCents,
  );
  const priceRows: PriceRow[] = offered.map((usd) => {
    const totals: PriceRow['totals'] = {};
    for (const { method } of methods) {
      const result = computeQuote({ usdCents: usd * 100, method, settings: quoteSettings, enforceWalletLimit: false });
      if (result.ok) totals[method] = result.quote.totalHtg;
    }
    const overLimit = Object.values(totals).some((total) => total > HTG_WALLET_MAX);
    return { usdCents: usd * 100, totals, overLimit };
  });
  const priceBoard = (
    <PriceBoard
      rows={priceRows}
      methods={methods.map((m) => m.method)}
      fxRateHtg={settings.fxRateHtg}
      updatedAt={settings.updatedAt ?? new Date(Number.NaN)}
      locale={appLocale}
    />
  );

  const facts = [
    { key: 'fees', Icon: Receipt },
    { key: 'verified', Icon: ShieldCheck },
    { key: 'person', Icon: MessageCircle },
  ] as const;
  const factList = (className: string) => (
    <ul className={className}>
      {facts.map(({ key, Icon }) => (
        <li key={key} className="flex items-start gap-3 text-[15px] leading-snug text-ink-soft">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint-deep">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="pt-0.5">{t(`facts.${key}`)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section className="mx-auto max-w-6xl px-gutter pt-5 pb-section sm:pt-10">
        {resume ? (
          <ResumeBanner
            reference={resume.reference}
            statusLabel={c(`status.${resume.status}`)}
            className="mb-5 animate-rise sm:mb-8"
          />
        ) : null}

        {/*
          One orchestrated arrival — the title, its sentence, then the form —
          and nothing else on the page moves by itself. On a phone the form
          starts well above the fold: the title is two short lines, and the
          reasons to trust the service wait under the form.
        */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
          <div className="lg:sticky lg:top-8 lg:pt-4">
            <h1 className="animate-rise font-display text-[2rem] leading-[1.05] font-bold tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
              {t('hero.title')}
            </h1>
            <p className="mt-3 max-w-md animate-rise stagger text-lead text-ink-soft [--i:2] sm:mt-4">
              {t('hero.sub')}
            </p>
            {factList('mt-8 hidden space-y-3 animate-rise stagger [--i:5] lg:block')}
            <div className="mt-10 hidden animate-rise stagger [--i:6] lg:block">{priceBoard}</div>
          </div>

          <div className="animate-rise stagger [--i:3]">
            <RechargeWidget
              locale={appLocale}
              quoteSettings={quoteSettings}
              methods={methods}
              meruAccountTypes={settings.meruAccountTypes}
              meruHelp={meruHelp}
              supportWhatsapp={settings.supportWhatsapp}
              copyLabel={c('copy')}
              copiedLabel={c('copied')}
              accountsEnabled={accountsEnabled}
              account={account}
            />
            <p className="mt-4 text-center text-sm text-ink-soft">
              {t('trackLink.lead')}{' '}
              <Link
                href="/suivi"
                className="rounded font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
              >
                {t('trackLink.cta')}
              </Link>
            </p>
            {factList('mt-6 space-y-3 lg:hidden')}
          </div>
        </div>
      </section>

      <HowItWorks sla={sla} className="pb-section" />
      <div className="mx-auto max-w-6xl px-gutter pb-section lg:hidden">{priceBoard}</div>
      <SupportBlock supportWhatsapp={settings.supportWhatsapp} supportHours={settings.supportHours} />
    </>
  );
}
