import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { ORDER_COOKIE } from '@/lib/orders/cookie';
import { normalizeReference } from '@/lib/orders/reference';
import { getSettings } from '@/lib/settings/store';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { TrackForm } from '@/components/site/TrackForm';
import { whatsappLink } from '@/components/site/SiteHeader';

export const dynamic = 'force-dynamic';

type TrackPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'track' });
  return { title: t('meta.title'), description: t('meta.description'), robots: { index: false, follow: true } };
}

/**
 * `/{locale}/suivi` — reference plus the exact WhatsApp number.
 *
 * `?checking=1` is where the payment-return routes land when they could not
 * identify the order at all: the message must reassure (the payment is not
 * lost) and ask for the reference, nothing more.
 */
export default async function TrackPage({ params, searchParams }: TrackPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [t, settings, cookieStore, query] = await Promise.all([
    getTranslations({ locale, namespace: 'track' }),
    getSettings(),
    cookies(),
    searchParams,
  ]);

  const checking = query.checking === '1' || query.checking === 'true';
  const known = normalizeReference(cookieStore.get(ORDER_COOKIE)?.value ?? '');
  const support = whatsappLink(settings.supportWhatsapp, t('help.message'));

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">{t('lead')}</p>
      </header>

      {checking ? <Alert tone="info">{t('checking')}</Alert> : null}

      <Card padding="lg">
        <TrackForm defaultReference={known} />
      </Card>

      <Card tone="mist">
        <CardTitle as="h2" className="text-base">
          {t('help.title')}
        </CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t('help.body')}</p>
        {support ? (
          <a
            href={support}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('ghost', 'md', 'mt-4 w-full sm:w-auto')}
          >
            <MessageCircle className="size-4 text-mint" aria-hidden="true" />
            {t('help.cta')}
          </a>
        ) : null}
      </Card>
    </div>
  );
}
