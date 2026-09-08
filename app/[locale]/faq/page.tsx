import type { Metadata } from 'next';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { formatHtg, formatUsdShort } from '@/lib/format';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { getSettings } from '@/lib/settings/store';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { whatsappLink } from '@/components/site/SiteHeader';

export const dynamic = 'force-dynamic';

/** Order matters: the two questions people actually arrive with come early. */
const ITEMS = [
  'what',
  'identifier',
  'fees',
  'delay',
  'pendingAfterPay',
  'limits',
  'wrongAccount',
  'refund',
  'track',
] as const;

type FaqPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: FaqPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'faq' });
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const appLocale = locale as AppLocale;

  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: 'faq' }),
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
  const support = whatsappLink(settings.supportWhatsapp, t('stillStuck.message'));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-gutter py-10 sm:py-14">
      <header className="space-y-3">
        <h1 className="font-display text-hero font-bold tracking-tight text-ink">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">{t('lead')}</p>
      </header>

      <div className="space-y-3">
        {ITEMS.map((key) => (
          <details key={key} className="group rounded-card border border-line bg-paper px-5 shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {t(`items.${key}.q`, values)}
              <ChevronDown
                className="size-5 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-5 text-[15px] leading-relaxed text-ink-soft">{t(`items.${key}.a`, values)}</p>
          </details>
        ))}
      </div>

      <Card tone="mist">
        <CardTitle as="h2" size="sm">
          {t('stillStuck.title')}
        </CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {t('stillStuck.body', { hours: settings.supportHours })}
        </p>
        {support ? (
          <a
            href={support}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('ghost', 'md', 'mt-4 w-full sm:w-auto')}
          >
            <MessageCircle className="size-4 text-mint" aria-hidden="true" />
            {t('stillStuck.cta')}
          </a>
        ) : null}
      </Card>
    </div>
  );
}
