import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Chip } from '@/components/ui/Chip';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { WhatsAppMenu } from '@/components/admin/WhatsAppMenu';
import { STATUS_DOT_CLASS, awaitsOperator } from '@/lib/admin/order-status';
import type { WhatsAppKit } from '@/lib/whatsapp/render';
import type { WhatsAppStyle } from '@/lib/whatsapp/types';
import { formatHtg, formatUsd } from '@/lib/format';
import { statusLabelFr } from '@/lib/orders/transitions';
import type { OrderRow } from '@/lib/orders/types';

/**
 * The orders, as one list that is a card stack on a phone and a table on a
 * desk — one set of rows, not two renderings of the same data.
 *
 * Every row is a link from edge to edge: the pointer turns into a hand and
 * the row lights up the moment it is over any part of it — reference, name,
 * amount or empty space — and a tap anywhere opens the order. The chevron
 * slides a few pixels to say where the click goes. The WhatsApp button sits
 * on top of the row, never inside the link: a button inside an anchor is a
 * keyboard trap and, under a thumb, a target that steals the tap meant for
 * the row.
 *
 * A paid order — somebody waiting for their dollars — carries a yellow edge
 * and a dot that beats. A sandbox order always carries TEST next to its
 * reference: recharging one would send real dollars for a payment that never
 * happened.
 */

export type OrderListProps = {
  orders: OrderRow[];
  /** « Payée il y a 5 min », per order id — computed once on the server. */
  moments: Record<string, string>;
  whatsappByOrder?: Record<string, WhatsAppKit>;
  /** The operator's coaching, needed by the message menu. */
  whatsappStyle?: WhatsAppStyle;
  empty?: ReactNode;
  /** Rows enter one after the other (after a filter change, not on page load). */
  animate?: boolean;
};

/** The desk layout: the same five cells in every row and in the header. */
const GRID =
  'md:grid md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,7rem)_minmax(0,8.5rem)_minmax(0,9rem)] md:items-center md:gap-5';

export function OrderList({
  orders,
  moments,
  whatsappByOrder,
  whatsappStyle,
  empty = 'Aucune commande.',
  animate = false,
}: OrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-10 text-center text-[15px] text-ink-soft">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-paper shadow-card">
      <div
        aria-hidden="true"
        className={cn('hidden border-b border-line bg-mist/60 py-2.5 pr-24 pl-5 text-xs font-medium text-ink-soft', GRID)}
      >
        <span>Commande</span>
        <span>Client</span>
        <span>Paiement</span>
        <span className="text-right">Montant</span>
        <span>Statut</span>
      </div>
      <ul className="divide-y divide-line">
        {orders.map((order, index) => (
          <OrderListRow
            key={order.id}
            order={order}
            moment={moments[order.id] ?? ''}
            whatsappKit={whatsappStyle ? whatsappByOrder?.[order.id] : undefined}
            whatsappStyle={whatsappStyle}
            rank={animate ? Math.min(index, 10) : null}
          />
        ))}
      </ul>
    </div>
  );
}

export type OrderListRowProps = {
  order: OrderRow;
  moment: string;
  whatsappKit?: WhatsAppKit;
  whatsappStyle?: WhatsAppStyle;
  /** Position in the entrance sequence; `null` for no entrance. */
  rank?: number | null;
};

export function OrderListRow({ order, moment, whatsappKit, whatsappStyle, rank = null }: OrderListRowProps) {
  const hasWhatsapp = Boolean(whatsappKit && whatsappStyle);
  const waiting = awaitsOperator(order.status) && order.mode === 'live';
  const htg = order.paidHtg ?? order.totalHtg;

  const amount = (
    <>
      <p className="font-display text-lg leading-none font-semibold tnum text-ink">{formatUsd(order.usdCents, 'fr')}</p>
      <p className="mt-1 text-xs tnum text-ink-soft">
        {order.paidHtg === null ? 'devis ' : 'reçu '}
        {formatHtg(htg)}
      </p>
    </>
  );

  return (
    <li
      className={cn('group relative', rank !== null && 'animate-rise stagger')}
      style={rank !== null ? ({ '--i': rank } as CSSProperties) : undefined}
    >
      {waiting ? (
        <span aria-hidden="true" className="absolute inset-y-2.5 left-0 z-10 w-1 rounded-r-full bg-sun-deep" />
      ) : null}

      <Link
        href={`/admin/commandes/${order.id}`}
        className={cn(
          'block px-4 py-3.5 transition-colors duration-150 hover:bg-mist/70 focus-visible:bg-mist/70 focus-visible:outline-offset-[-3px] sm:px-5',
          GRID,
          hasWhatsapp ? 'md:pr-24' : 'md:pr-14',
        )}
      >
        <div className="flex items-start justify-between gap-3 md:block">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0 rounded-full', STATUS_DOT_CLASS[order.status], waiting && 'animate-beat')}
              />
              <span className="font-display text-[15px] font-semibold tracking-wide tnum text-ink">
                {order.reference}
              </span>
              {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
            </p>
            <p className="mt-0.5 pl-4 text-xs text-ink-muted">{moment}</p>
          </div>
          <div className="shrink-0 text-right md:hidden">{amount}</div>
        </div>

        <div className="mt-2 min-w-0 pl-4 md:mt-0 md:pl-0">
          <p className="truncate text-[15px] leading-snug font-medium text-ink">{order.customerName}</p>
          <p className="truncate text-xs text-ink-muted">{order.meruAccount}</p>
        </div>

        <div className="hidden md:block">
          <MethodBadge method={order.method} size="sm" />
        </div>

        <div className="hidden text-right md:block">{amount}</div>

        <div className={cn('mt-2.5 flex flex-wrap items-center gap-2 pl-4 md:mt-0 md:pl-0', hasWhatsapp && 'pr-14 md:pr-0')}>
          <StatusPill status={order.status} label={statusLabelFr(order.status)} size="sm" />
          <MethodBadge method={order.method} size="sm" className="md:hidden" />
        </div>

        <ChevronRight
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 hidden size-5 -translate-y-1/2 text-ink-muted transition-[transform,color] duration-200 group-hover:translate-x-1 group-hover:text-ink md:block',
            hasWhatsapp ? 'right-16' : 'right-5',
          )}
        />
        {order.failureReason ? (
          <p className="mt-2 line-clamp-2 pl-4 text-sm leading-snug text-coral-deep md:col-span-5 md:mt-0 md:pl-0">
            {order.failureReason}
          </p>
        ) : null}
      </Link>

      {whatsappKit && whatsappStyle ? (
        <div className="absolute right-3 bottom-2.5 md:top-1/2 md:bottom-auto md:-translate-y-1/2">
          <WhatsAppMenu kit={whatsappKit} style={whatsappStyle} variant="compact" />
        </div>
      ) : null}
    </li>
  );
}
