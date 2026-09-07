/**
 * lib/orders/transitions.ts — the order state machine as a pure table.
 *
 * Every status change in the service layer is a compare-and-set
 * `UPDATE … WHERE id = ? AND status IN (allowedFrom(to)) RETURNING *`; this
 * module is the single source of which origins are allowed for each target.
 * It also derives the two time-based facts the tracking page, the admin and
 * `settleOrder` all agree on: whether a pending order has expired and whether
 * the customer is still inside the « nous vérifions votre paiement » window.
 *
 * No database, no clock of its own: `now` is always a parameter with a
 * default, so tests are deterministic.
 */
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from '@/lib/orders/types';

/**
 * Target statuses reachable from each origin (spec §5).
 *
 * `fulfilled` is terminal: dollars have left the operator's Meru account and
 * cannot be recalled. Every terminal-looking failure (`failed`, `expired`,
 * `cancelled`, `refunded`) can still go to `needs_review`, because a
 * provider may confirm a payment long after we gave up on it and the
 * operator must then look at it.
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = Object.freeze({
  pending_payment: Object.freeze(['paid', 'needs_review', 'failed', 'expired', 'cancelled'] as const),
  paid: Object.freeze(['fulfilled', 'refunded', 'needs_review'] as const),
  needs_review: Object.freeze(['fulfilled', 'refunded', 'failed'] as const),
  fulfilled: Object.freeze([] as const),
  failed: Object.freeze(['needs_review'] as const),
  expired: Object.freeze(['needs_review'] as const),
  cancelled: Object.freeze(['needs_review'] as const),
  refunded: Object.freeze(['needs_review'] as const),
});

/** True when the table allows `from → to`. A status never transitions to itself. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Every origin from which `to` is reachable, in canonical status order — the
 * `status IN (…)` list of the compare-and-set update. Returns a new array
 * each call so callers may sort or extend it freely.
 */
export function allowedFrom(to: OrderStatus): OrderStatus[] {
  return ORDER_STATUSES.filter((from) => TRANSITIONS[from].includes(to));
}

/** Statuses the operator has to act on, in the order they are listed on the dashboard. */
export const ACTIONABLE_STATUSES = ['paid', 'needs_review'] as const satisfies readonly OrderStatus[];
export type ActionableStatus = (typeof ACTIONABLE_STATUSES)[number];

const STATUS_LABELS_FR: Record<OrderStatus, string> = {
  pending_payment: 'En attente de paiement',
  paid: 'Payée',
  needs_review: 'À vérifier',
  fulfilled: 'Rechargée',
  failed: 'Échouée',
  expired: 'Expirée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

/** French label for the admin (the public site translates statuses through next-intl). */
export function statusLabelFr(status: OrderStatus): string {
  return STATUS_LABELS_FR[status];
}

/** Milliseconds since epoch for a Drizzle timestamp, whatever mode the column uses; `null` when absent or unreadable. */
function toMs(value: Date | string | null | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Derived expiry: a pending order whose payment deadline is behind `now`.
 *
 * The cron only materialises `expired` for reporting; the tracking page,
 * order creation, the admin and `settleOrder` all rely on this function so
 * that a payment confirmed after the deadline is routed to review instead of
 * being silently accepted as `paid`.
 */
export function isExpired(order: Pick<OrderRow, 'status' | 'expiresAt'>, now: Date = new Date()): boolean {
  if (order.status !== 'pending_payment') return false;
  const expiresAt = toMs(order.expiresAt);
  return expiresAt !== null && expiresAt < now.getTime();
}

/** How long after a return or a redirect the tracking page keeps saying « nous vérifions votre paiement ». */
export const PENDING_CHECK_WINDOW_MS = 15 * 60_000;

/**
 * True while the tracking page should show the verification state and poll,
 * instead of offering « Payer maintenant » again — so a slow provider never
 * makes a customer pay twice.
 *
 * The window is open for a `pending_payment` order when either
 * - the customer came back from the provider (`returnedAt`) less than
 *   `PENDING_CHECK_WINDOW_MS` ago, whatever any check said since — MonCash
 *   can confirm a payment minutes after the redirect; or
 * - the order was created less than the window ago and no verification has
 *   yet reported it unpaid (`lastUnpaidAt`, the last `verified_unpaid`
 *   event, is `null`) — the customer may still be on the provider's page.
 *
 * A `returnedAt` slightly in the future (clock skew between the database and
 * the runtime) counts as « just now ».
 */
export function inCheckingWindow(
  order: Pick<OrderRow, 'status' | 'returnedAt' | 'redirectExpiresAt' | 'createdAt' | 'lastVerifiedAt'>,
  lastUnpaidAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (order.status !== 'pending_payment') return false;
  const nowMs = now.getTime();
  const within = (at: number | null): boolean => at !== null && nowMs - at < PENDING_CHECK_WINDOW_MS;
  if (within(toMs(order.returnedAt))) return true;
  return lastUnpaidAt === null && within(toMs(order.createdAt));
}
