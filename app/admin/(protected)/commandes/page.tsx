import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { OrderFilters } from '@/components/admin/OrderFilters';
import { OrderList } from '@/components/admin/OrderList';
import { UrlStatusFilter } from '@/components/admin/StatusChips';
import {
  PRIMARY_STATUS_FILTERS,
  STATUS_FILTER_ORDER,
  formatStatusList,
  orderMomentFr,
  parseStatusList,
} from '@/lib/admin/order-status';
import { orderFiltersToQuery, parseOrderFilters, toOrderFilters } from '@/lib/admin/queries';
import { buildWhatsAppMessages, type WhatsAppMessage } from '@/lib/admin/whatsapp-messages';
import { countOrdersByStatus, listOrders } from '@/lib/orders/queries';
import { getSettings } from '@/lib/settings/store';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Commandes' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Every order, searchable. The status chips accept several statuses at once
 * (`?status=paid,pending_payment`); the search and the folded filters narrow
 * the same list, and the chip counts follow them — « Payées 3 » always means
 * three among what the search currently matches.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = parseOrderFilters(sp);
  const statuses = parseStatusList(sp.status);
  const statusParam = formatStatusList(statuses);
  const base = { ...toOrderFilters(filters), status: 'all' as const };

  const [{ orders, total }, counts, settings] = await Promise.all([
    listOrders({ ...base, statuses }),
    countOrdersByStatus(base),
    getSettings(),
  ]);

  const now = new Date();
  // Écrire au client est la suite la plus fréquente de la lecture d'une liste.
  const ctx = { siteUrl: siteUrl(), businessName: settings.businessName };
  const whatsappByOrder: Record<string, WhatsAppMessage[]> = {};
  const moments: Record<string, string> = {};
  for (const order of orders) {
    const messages = buildWhatsAppMessages(order, ctx);
    if (messages.length > 0) whatsappByOrder[order.id] = messages;
    moments[order.id] = orderMomentFr(order, now);
  }

  const chipStatuses = STATUS_FILTER_ORDER.filter(
    (status) => PRIMARY_STATUS_FILTERS.includes(status) || (counts[status] ?? 0) > 0 || statuses.includes(status),
  );
  const allCount = Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);

  const firstShown = total === 0 ? 0 : filters.offset + 1;
  const lastShown = filters.offset + orders.length;
  const hasPrevious = filters.page > 1;
  const hasNext = lastShown < total;
  const pageHref = (page: number) =>
    `/admin/commandes${orderFiltersToQuery(filters, { status: statusParam, page: page > 1 ? String(page) : '' })}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Commandes</h1>
        <p className="mt-1 text-sm text-ink-soft tnum">
          {allCount.toLocaleString('fr-FR')} commande{allCount > 1 ? 's' : ''}
          {filters.q ? ` pour « ${filters.q} »` : ''}. Touchez une commande pour l’ouvrir.
        </p>
      </header>

      <OrderFilters filters={filters} statusParam={statusParam} />

      <UrlStatusFilter statuses={chipStatuses} counts={counts} selected={statuses} total={allCount}>
        <OrderList
          orders={orders}
          moments={moments}
          whatsappByOrder={whatsappByOrder}
          empty={
            filters.q
              ? `Aucune commande ne correspond à « ${filters.q} » avec ces filtres.`
              : 'Aucune commande ne correspond à ces filtres.'
          }
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted tnum">
            {total === 0 ? 'Aucun résultat' : `${firstShown}–${lastShown} sur ${total.toLocaleString('fr-FR')}`}
          </p>
          {hasPrevious || hasNext ? (
            <nav aria-label="Pagination" className="flex items-center gap-2">
              {hasPrevious ? (
                <Link href={pageHref(filters.page - 1)} className={buttonClasses('ghost', 'sm')}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Précédentes
                </Link>
              ) : null}
              {hasNext ? (
                <Link href={pageHref(filters.page + 1)} className={buttonClasses('ghost', 'sm')}>
                  Suivantes
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </UrlStatusFilter>
    </div>
  );
}
