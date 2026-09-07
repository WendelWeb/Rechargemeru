import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { currentUserId } from '@/lib/auth/clerk';
import { ORDER_COOKIE } from '@/lib/orders/cookie';
import { lastEventOfType } from '@/lib/orders/events';
import { canSeeFullOrder, toFullOrder, toPublicOrder } from '@/lib/orders/public';
import { getOrderByReference } from '@/lib/orders/queries';
import { normalizeReference } from '@/lib/orders/reference';
import { getSettings } from '@/lib/settings/store';
import { OrderStatusView } from '@/components/site/OrderStatusView';

export const dynamic = 'force-dynamic';

type OrderPageProps = {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: OrderPageProps): Promise<Metadata> {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'order' });
  return {
    title: t('meta.title', { reference: normalizeReference(reference) ?? reference }),
    description: t('meta.description'),
    // A reference is a bearer token of sorts: never let it into a search index.
    robots: { index: false, follow: false },
  };
}

/**
 * `/{locale}/commande/{reference}` — the page a customer comes back to.
 *
 * It shows the same order to everybody who has the reference. The full
 * details and the stored payment link are for two viewers only: the browser
 * whose `rm_order` cookie names it (the one that created the order, or one
 * that passed reference + exact phone through `/suivi`), and the signed-in
 * account the order was placed from — which is what makes « Mes commandes »
 * lead somewhere the next morning, and from a second device.
 *
 * `lastEventOfType(…, 'verified_unpaid')` is what closes the verification
 * window: a redirect issued minutes ago still counts as « we are checking »
 * until the provider has actually told us the order is unpaid.
 */
export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const appLocale = locale as AppLocale;

  const normalized = normalizeReference(reference);
  if (!normalized) notFound();

  const order = await getOrderByReference(normalized);
  if (!order) notFound();

  const [lastUnpaid, settings, cookieStore, query, viewerUserId] = await Promise.all([
    lastEventOfType(order.id, 'verified_unpaid'),
    getSettings(),
    cookies(),
    searchParams,
    currentUserId(),
  ]);

  const full = canSeeFullOrder(order, cookieStore.get(ORDER_COOKIE)?.value ?? null, viewerUserId);
  const lastUnpaidAt = lastUnpaid?.createdAt ?? null;
  const now = new Date();
  const view = full ? toFullOrder(order, lastUnpaidAt, now) : toPublicOrder(order, lastUnpaidAt, now);
  const cancelled = query.cancelled === '1' || query.cancelled === 'true';

  return (
    <OrderStatusView
      order={view}
      locale={appLocale}
      businessName={settings.businessName}
      supportWhatsapp={settings.supportWhatsapp}
      supportHours={settings.supportHours}
      sla={appLocale === 'ht' ? settings.fulfilmentSlaHt : settings.fulfilmentSlaFr}
      cancelled={cancelled}
      now={now}
    />
  );
}
