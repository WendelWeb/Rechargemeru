import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { currentAdmin } from '@/lib/auth/admin';
import { clerkConfigured, currentUserEmail, currentUserId, currentUserName } from '@/lib/auth/clerk';
import { formatRate, formatUsdShort } from '@/lib/format';
import { ORDER_COOKIE } from '@/lib/orders/cookie';
import { getOrderByReference } from '@/lib/orders/queries';
import { normalizeReference } from '@/lib/orders/reference';
import { isExpired } from '@/lib/orders/transitions';
import { availableMethods } from '@/lib/payments/checkout';
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

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 sm:pt-12 sm:pb-16">
        {resume ? (
          <ResumeBanner
            reference={resume.reference}
            statusLabel={c(`status.${resume.status}`)}
            className="mb-8"
          />
        ) : null}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14">
          <div className="max-w-xl">
            <h1 className="font-display text-3xl leading-[1.1] font-bold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {t('hero.title')}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">{t('hero.lead')}</p>
            <p className="mt-6 inline-flex items-center rounded-xl bg-sun-soft px-3.5 py-2 text-sm font-medium text-ink">
              <span className="tnum">{t('hero.rate', { rate: formatRate(settings.fxRateHtg, appLocale) })}</span>
            </p>
            <div className="mt-8 hidden space-y-3 lg:block">
              <TrustLine kind="feesVisible" />
              <TrustLine kind="verified" />
              <TrustLine kind="tracking" />
            </div>
          </div>

          <RechargeWidget
            locale={appLocale}
            quoteSettings={toQuoteSettings(settings)}
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
      </section>

      <HowItWorks min={minLabel} max={maxLabel} sla={sla} className="pb-12 sm:pb-16" />
      <TrustStrip supportHours={settings.supportHours} />
    </>
  );
}
