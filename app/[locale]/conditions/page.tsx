import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { formatHtg, formatUsdShort } from '@/lib/format';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { getSettings } from '@/lib/settings/store';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  'service',
  'pricing',
  'delay',
  'account',
  'refund',
  'expiry',
  'data',
  'notAffiliated',
  'support',
] as const;

type TermsPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'terms' });
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const appLocale = locale as AppLocale;

  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: 'terms' }),
    getSettings(),
  ]);

  const values = {
    business: settings.businessName,
    sla: appLocale === 'ht' ? settings.fulfilmentSlaHt : settings.fulfilmentSlaFr,
    hours: settings.supportHours,
    min: formatUsdShort(settings.minUsdCents, appLocale),
    max: formatUsdShort(settings.maxUsdCents, appLocale),
    walletLimit: formatHtg(HTG_WALLET_MAX),
  };

  return (
    <div className="mx-auto max-w-3xl px-gutter py-10 sm:py-14">
      <header className="space-y-3">
        <h1 className="font-display text-hero font-bold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">{t('lead')}</p>
        <p className="text-sm text-ink-muted">{t('updated')}</p>
      </header>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((key) => (
          <section key={key} aria-labelledby={`terms-${key}`}>
            <h2 id={`terms-${key}`} className="font-display text-lg font-semibold tracking-tight text-ink">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{t(`sections.${key}.body`, values)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
