import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { currentAdmin } from '@/lib/auth/admin';
import { clerkConfigured, currentUserEmail, currentUserId, currentUserName } from '@/lib/auth/clerk';
import { formatHtg, formatRate, formatUsdShort } from '@/lib/format';
import { ORDER_COOKIE } from '@/lib/orders/cookie';
import { getOrderByReference } from '@/lib/orders/queries';
import { normalizeReference } from '@/lib/orders/reference';
import { isExpired } from '@/lib/orders/transitions';
import { availableMethods } from '@/lib/payments/checkout';
import { QUICK_AMOUNTS_USD, computeQuote } from '@/lib/pricing/quote';
import { getSettings, toQuoteSettings } from '@/lib/settings/store';
import { HowItWorks } from '@/components/site/HowItWorks';
import { RechargeWidget } from '@/components/site/RechargeWidget';
import { ResumeBanner } from '@/components/site/ResumeBanner';
import { TrustLine } from '@/components/site/TrustLine';
import { TrustStrip } from '@/components/site/TrustStrip';

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
 * what it puts in those ten seconds is the whole design. A short title, the
 * price a real order actually costs — not the bare exchange rate, which is a
 * fifth cheaper than the truth — and then the form. The long lead paragraph
 * and the three trust lines belong to the left column of a wide screen; on a
 * narrow one they would push the amount field below the fold, so the lead
 * waits for `lg` and the trust lines move under the card.
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

  const minLabel = formatUsdShort(settings.minUsdCents, appLocale);
  const maxLabel = formatUsdShort(settings.maxUsdCents, appLocale);
  const sla = appLocale === 'ht' ? settings.fulfilmentSlaHt : settings.fulfilmentSlaFr;
  const meruHelp = appLocale === 'ht' ? settings.meruHelpHt : settings.meruHelpFr;

  const quoteSettings = toQuoteSettings(settings);

  // The headline price, run through the same quote engine the receipt uses,
  // on the amount the widget starts with. Advertising « 1 $ US = 140 HTG »
  // above a receipt that charges 168 all-in is the one thing a money service
  // cannot afford; the exchange rate stays, in small type, named for what it
  // is.
  const offered = QUICK_AMOUNTS_USD.filter(
    (usd) => usd * 100 >= settings.minUsdCents && usd * 100 <= settings.maxUsdCents,
  );
  const previewUsd = (offered.includes(20) ? 20 : offered[0]) ?? Math.ceil(settings.minUsdCents / 100);
  const previewResult = computeQuote({
    usdCents: previewUsd * 100,
    method: methods[0]?.method ?? 'moncash',
    settings: quoteSettings,
  });
  const preview = previewResult.ok ? previewResult.quote : null;

  return (
    <>
      <section className="mx-auto max-w-6xl px-gutter pt-5 pb-section sm:pt-10">
        {resume ? (
          <ResumeBanner
            reference={resume.reference}
            statusLabel={c(`status.${resume.status}`)}
            className="mb-5 sm:mb-8"
          />
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14">
          <div className="max-w-xl">
            <h1 className="font-display text-title font-bold tracking-tight text-ink lg:text-hero">
              {t('hero.title')}
            </h1>
            <p className="mt-4 hidden text-lead leading-relaxed text-ink-soft lg:block">{t('hero.lead')}</p>

            <div className="mt-3 lg:mt-6">
              <p className="inline-flex items-center rounded-xl bg-sun-soft px-3.5 py-2 text-[15px] font-semibold text-ink">
                <span className="tnum">
                  {preview
                    ? t('hero.price', {
                        usd: formatUsdShort(preview.usdCents, appLocale),
                        total: formatHtg(preview.totalHtg),
                      })
                    : t('hero.rate', { rate: formatRate(settings.fxRateHtg, appLocale) })}
                </span>
              </p>
              {preview ? (
                <p className="mt-1.5 tnum text-caption text-ink-soft">
                  {t('hero.rateNote', { rate: formatRate(settings.fxRateHtg, appLocale) })}
                </p>
              ) : null}
            </div>

            <div className="mt-8 hidden space-y-3 lg:block">
              <TrustLine kind="feesVisible" />
              <TrustLine kind="verified" />
              <TrustLine kind="tracking" />
            </div>
          </div>

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
        </div>

        {/* The other two reasons to trust the service, right under the card —
            the widget already carries « les frais sont affichés » next to the
            fees themselves. Above `lg` all three live in the left column. */}
        <div className="mt-5 space-y-2 lg:hidden">
          <TrustLine kind="verified" />
          <TrustLine kind="tracking" />
        </div>
      </section>

      <HowItWorks min={minLabel} max={maxLabel} sla={sla} className="pb-section" />
      <TrustStrip supportHours={settings.supportHours} />
    </>
  );
}
