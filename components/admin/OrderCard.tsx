import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import { statusLabelFr } from '@/lib/orders/transitions';
import type { OrderRow } from '@/lib/orders/types';

export type OrderCardProps = {
  order: OrderRow;
  /** Turns the card into a call to action (« Recharger » on the dashboard queue). */
  cta?: string;
};

/**
 * One order, as the operator reads it on a phone.
 *
 * Deliberately not a table row: six columns in 328 px push the amount and the
 * status off screen, and those two are exactly what is being looked for. Here
 * the reference, the name, the dollars and the gourdes are on the first line
 * of sight, and the state of the order is a pill underneath.
 *
 * The whole card is the link, so the tap target is the card itself — nothing
 * inside it competes for the thumb, and a mis-tap still opens the right order.
 */
export function OrderCard({ order, cta }: OrderCardProps) {
  const when = order.paidAt
    ? `Payée le ${formatDateTime(order.paidAt)}`
    : `Créée le ${formatDateTime(order.createdAt)}`;

  return (
    <li>
      <Link
        href={`/admin/commandes/${order.id}`}
        className="block rounded-card border border-line bg-paper p-4 shadow-card transition-colors hover:border-ink-muted"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-wide tnum text-ink">{order.reference}</p>
            <p className="mt-1 truncate text-[15px] leading-snug font-medium text-ink">{order.customerName}</p>
            <p className="truncate text-xs text-ink-muted">{order.meruAccount}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-xl leading-none font-semibold tnum text-ink">
              {formatUsd(order.usdCents, 'fr')}
            </p>
            <p className="mt-1 text-xs tnum text-ink-soft">
              {order.paidHtg === null ? 'devis ' : 'reçu '}
              {formatHtg(order.paidHtg ?? order.totalHtg)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} label={statusLabelFr(order.status)} size="sm" />
          <MethodBadge method={order.method} size="sm" />
          {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
        </div>

        {order.failureReason ? (
          <p className="mt-2 text-sm leading-snug text-coral-deep">{order.failureReason}</p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="min-w-0 text-xs text-ink-muted">{when}</span>
          {cta ? (
            <span className={buttonClasses('primary', 'sm', 'shrink-0')}>
              {cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-ink">
              Ouvrir
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
