/**
 * lib/admin/order-status.ts — how the back-office names and colours an
 * order's state in its lists and filters.
 *
 * The filters are plurals (« Payées », « En attente ») because they name a
 * group; the pill on a row stays singular (`statusLabelFr`). The order of
 * `STATUS_FILTER_ORDER` is the order of the operator's attention: what needs
 * dollars, what needs a look, what is still in flight, and then what is over.
 */
import { timeAgoFr } from '@/lib/admin/time';
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from '@/lib/orders/types';

export const STATUS_FILTER_ORDER: readonly OrderStatus[] = [
  'paid',
  'needs_review',
  'pending_payment',
  'fulfilled',
  'failed',
  'expired',
  'cancelled',
  'refunded',
];

/** Always offered as a filter, even when nothing is in them right now. */
export const PRIMARY_STATUS_FILTERS: readonly OrderStatus[] = [
  'paid',
  'needs_review',
  'pending_payment',
  'fulfilled',
  'failed',
  'expired',
];

export const STATUS_PLURAL_FR: Record<OrderStatus, string> = {
  paid: 'Payées',
  needs_review: 'À vérifier',
  pending_payment: 'En attente',
  fulfilled: 'Rechargées',
  failed: 'Échouées',
  expired: 'Expirées',
  cancelled: 'Annulées',
  refunded: 'Remboursées',
};

/** The dot beside a status, in the palette's meanings: sun = act, coral = look, mint = done. */
export const STATUS_DOT_CLASS: Record<OrderStatus, string> = {
  paid: 'bg-sun-deep',
  needs_review: 'bg-coral',
  pending_payment: 'bg-ink-muted',
  fulfilled: 'bg-mint',
  failed: 'bg-coral-deep',
  expired: 'bg-line-strong',
  cancelled: 'bg-line-strong',
  refunded: 'bg-ink',
};

/** Statuses a paid customer is waiting on: they get the beating dot. */
export function awaitsOperator(status: OrderStatus): boolean {
  return status === 'paid' || status === 'needs_review';
}

/**
 * `?status=paid,needs_review` → the statuses it names, in attention order,
 * unknown words dropped. Empty means « toutes ».
 */
export function parseStatusList(value: string | string[] | undefined): OrderStatus[] {
  const raw = (Array.isArray(value) ? value.join(',') : (value ?? '')).split(',').map((s) => s.trim());
  const wanted = new Set(raw.filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s)));
  return STATUS_FILTER_ORDER.filter((status) => wanted.has(status));
}

/** The inverse of `parseStatusList`: `''` for « toutes ». */
export function formatStatusList(statuses: readonly OrderStatus[]): string {
  const set = new Set(statuses);
  return STATUS_FILTER_ORDER.filter((status) => set.has(status)).join(',');
}

/**
 * The one moment of an order worth reading in a list: when it was recharged,
 * paid, expired or — failing all that — created, said the way people say it.
 */
export function orderMomentFr(
  order: Pick<OrderRow, 'status' | 'createdAt' | 'paidAt' | 'fulfilledAt' | 'expiresAt'>,
  now: Date = new Date(),
): string {
  if (order.status === 'fulfilled' && order.fulfilledAt) return `Rechargée ${timeAgoFr(order.fulfilledAt, now)}`;
  if (order.paidAt) return `Payée ${timeAgoFr(order.paidAt, now)}`;
  if (order.status === 'expired') return `Expirée ${timeAgoFr(order.expiresAt, now)}`;
  return `Créée ${timeAgoFr(order.createdAt, now)}`;
}
