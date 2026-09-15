import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { OrderFilters } from '@/components/admin/OrderFilters';
import { OrdersTable } from '@/components/admin/OrdersTable';
import { buildWhatsAppMessages, type WhatsAppMessage } from '@/lib/admin/whatsapp-messages';
import { getSettings } from '@/lib/settings/store';
import { siteUrl } from '@/lib/site-url';
import { orderFiltersToQuery, parseOrderFilters, toOrderFilters } from '@/lib/admin/queries';
import { listOrders } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Commandes' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseOrderFilters(await searchParams);
  const [{ orders, total }, settings] = await Promise.all([
    listOrders(toOrderFilters(filters)),
    getSettings(),
  ]);

  // Écrire au client est la suite la plus fréquente de la lecture d'une liste.
  const ctx = { siteUrl: siteUrl(), businessName: settings.businessName };
  const whatsappByOrder: Record<string, WhatsAppMessage[]> = {};
  for (const order of orders) {
    const messages = buildWhatsAppMessages(order, ctx);
    if (messages.length > 0) whatsappByOrder[order.id] = messages;
  }

  const firstShown = total === 0 ? 0 : filters.offset + 1;
  const lastShown = filters.offset + orders.length;
  const hasPrevious = filters.page > 1;
  const hasNext = lastShown < total;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Commandes</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Recherche par référence, téléphone, identifiant Meru ou nom. Les commandes de test portent la pastille TEST.
        </p>
      </header>

      <OrderFilters filters={filters} />

      <p className="text-sm text-ink-soft tnum">
        {total === 0 ? 'Aucun résultat.' : `${firstShown}–${lastShown} sur ${total} commande(s).`}
      </p>

      <OrdersTable
        orders={orders}
        empty="Aucune commande ne correspond à ces filtres."
        whatsappByOrder={whatsappByOrder}
      />

      {hasPrevious || hasNext ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          {hasPrevious ? (
            <Link
              href={`/admin/commandes${orderFiltersToQuery(filters, { page: filters.page - 1 > 1 ? String(filters.page - 1) : '' })}`}
              className={buttonClasses('ghost', 'sm')}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Page précédente
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              href={`/admin/commandes${orderFiltersToQuery(filters, { page: String(filters.page + 1) })}`}
              className={buttonClasses('ghost', 'sm')}
            >
              Page suivante
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
