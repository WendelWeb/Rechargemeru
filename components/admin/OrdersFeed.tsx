'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { OrderList } from '@/components/admin/OrderList';
import { StatusChips } from '@/components/admin/StatusChips';
import {
  PRIMARY_STATUS_FILTERS,
  STATUS_FILTER_ORDER,
  STATUS_PLURAL_FR,
  formatStatusList,
} from '@/lib/admin/order-status';
import type { WhatsAppMessage } from '@/lib/admin/whatsapp-messages';
import type { OrderRow, OrderStatus } from '@/lib/orders/types';

export type OrdersFeedProps = {
  orders: OrderRow[];
  moments: Record<string, string>;
  whatsappByOrder: Record<string, WhatsAppMessage[]>;
};

/**
 * « Commandes » on the dashboard: the latest orders and the status chips over
 * them. The filtering happens right here in the browser — the rows are
 * already on the page, so ticking « Payées » answers in the same frame, and
 * the list re-deals itself row by row to show that it changed.
 *
 * The link underneath carries the ticked statuses to `/admin/commandes`,
 * where the same filter runs on every order, not only the latest ones.
 */
export function OrdersFeed({ orders, moments, whatsappByOrder }: OrdersFeedProps) {
  const [selected, setSelected] = useState<OrderStatus[]>([]);
  const [touched, setTouched] = useState(false);

  const counts = useMemo(() => {
    const out: Partial<Record<OrderStatus, number>> = {};
    for (const order of orders) out[order.status] = (out[order.status] ?? 0) + 1;
    return out;
  }, [orders]);

  const statuses = STATUS_FILTER_ORDER.filter(
    (status) => PRIMARY_STATUS_FILTERS.includes(status) || (counts[status] ?? 0) > 0,
  );
  const visible = selected.length === 0 ? orders : orders.filter((order) => selected.includes(order.status));
  const key = formatStatusList(selected) || 'all';
  const moreHref = `/admin/commandes${selected.length > 0 ? `?status=${key}` : ''}`;

  const emptyLabel =
    selected.length === 1
      ? `Aucune commande « ${STATUS_PLURAL_FR[selected[0]].toLowerCase()} » parmi les ${orders.length} dernières.`
      : 'Aucune commande dans ce filtre parmi les dernières.';

  return (
    <>
      <StatusChips
        statuses={statuses}
        counts={counts}
        selected={selected}
        total={orders.length}
        onToggle={(status) => {
          setTouched(true);
          setSelected((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
        }}
        onClear={() => {
          setTouched(true);
          setSelected([]);
        }}
      />

      <div className="mt-4">
        <OrderList
          key={key}
          orders={visible}
          moments={moments}
          whatsappByOrder={whatsappByOrder}
          animate={touched}
          empty={orders.length === 0 ? 'Aucune commande pour l’instant.' : emptyLabel}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-ink-muted tnum" aria-live="polite">
          {visible.length} affichée{visible.length > 1 ? 's' : ''} sur les {orders.length} dernières
        </p>
        <Link
          href={moreHref}
          className="inline-flex min-h-tap items-center rounded font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
        >
          Voir toutes les commandes
        </Link>
      </div>
    </>
  );
}
