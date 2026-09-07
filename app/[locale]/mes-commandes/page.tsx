import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { currentUserEmail, currentUserId } from '@/lib/auth/clerk';
import { listOrdersForUser } from '@/lib/orders/queries';
import { MyOrdersList, type MyOrderSummary } from '@/components/site/MyOrdersList';

/** The account's own orders, read live on every visit. */
export const dynamic = 'force-dynamic';

type MyOrdersPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: MyOrdersPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'account' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    // Somebody's order history has no business in a search index.
    robots: { index: false, follow: false },
  };
}

/**
 * `/{locale}/mes-commandes` — the one page an account buys.
 *
 * Signed out (and that includes « Clerk is not configured here »), it sends
 * the visitor to `/connexion`, which explains that ordering never needed an
 * account in the first place. Signed in, it lists exactly the orders that
 * carry this Clerk user id — guest orders, this account's own included, are
 * not adopted after the fact and are found by their reference on `/suivi`.
 */
export default async function MyOrdersPage({ params }: MyOrdersPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const appLocale = locale as AppLocale;

  const userId = await currentUserId();
  // `redirect` throws; returning it is only how TypeScript learns that the
  // lines below run with a user id in hand.
  if (userId === null) return redirect({ href: '/connexion', locale: appLocale });

  const [rows, email, t] = await Promise.all([
    listOrdersForUser(userId),
    currentUserEmail(),
    getTranslations({ locale, namespace: 'account' }),
  ]);

  const orders: MyOrderSummary[] = rows.map((order) => ({
    reference: order.reference,
    createdAt: order.createdAt,
    status: order.status,
    method: order.method,
    mode: order.mode,
    usdCents: order.usdCents,
    totalHtg: order.totalHtg,
  }));

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">{t('lead')}</p>
        {email ? <p className="text-sm text-ink-muted">{t('signedInAs', { email })}</p> : null}
      </header>

      <div className="mt-8">
        <MyOrdersList orders={orders} locale={appLocale} />
      </div>

      <p className="mt-8 text-sm leading-relaxed text-ink-soft">
        {t('guest.note')}{' '}
        <Link href="/suivi" className="rounded font-medium text-ink underline underline-offset-2">
          {t('guest.cta')}
        </Link>
      </p>
    </section>
  );
}
