/**
 * lib/orders/expire.ts — materialising `expired` for the reports.
 *
 * Expiry is DERIVED everywhere that matters (`isExpired` in
 * lib/orders/transitions): the tracking page, order creation, the admin and
 * `settleOrder` all read `expires_at` directly. This sweep only writes the
 * status down for lists and statistics — after one last provider check on
 * MonCash orders, because MonCash can confirm a payment minutes after the
 * deadline and a customer who paid must land in `needs_review`, not
 * `expired`. NatCash orders are expired directly: without a signed webhook a
 * read can only ever reach `needs_review`, and the reconciliation keeps
 * checking `expired` orders anyway.
 */
import { notifyOrder } from '@/lib/notifications/dispatch';
import { appendEvent } from '@/lib/orders/events';
import { listExpiredPending, transitionOrder } from '@/lib/orders/queries';
import type { SettleResult } from '@/lib/orders/settle';

export type ExpireInput = {
  now: Date;
  limit: number;
  /** One last settlement attempt (source `cron`) before a MonCash order is written off. */
  verifyFirst: (id: string) => Promise<SettleResult>;
};

export type ExpireResult = { expired: number; recovered: number };

/** Settlement answers after which the order is no longer ours to expire. */
const RECOVERED = new Set<SettleResult['status']>(['granted', 'review', 'already']);

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export async function expireStaleOrders({ now, limit, verifyFirst }: ExpireInput): Promise<ExpireResult> {
  const tally: ExpireResult = { expired: 0, recovered: 0 };
  let stale;
  try {
    stale = await listExpiredPending(now, limit);
  } catch (err) {
    console.error(`[orders/expire] listing failed: ${errorText(err)}`);
    return tally;
  }

  for (const order of stale) {
    try {
      if (order.method === 'moncash') {
        const last = await verifyFirst(order.id);
        if (RECOVERED.has(last.status)) {
          if (last.status !== 'already') tally.recovered += 1;
          continue;
        }
      }
      const expired = await transitionOrder(order.id, 'expired', {});
      if (!expired) continue;
      tally.expired += 1;
      await appendEvent({
        orderId: order.id,
        type: 'expired',
        actor: 'system',
        message: 'Commande expirée sans paiement confirmé',
        data: { expiresAt: order.expiresAt, verifyAttempts: order.verifyAttempts },
      });
      await appendEvent({
        orderId: order.id,
        type: 'status_changed',
        actor: 'system',
        message: 'pending_payment → expired',
        data: { from: 'pending_payment', to: 'expired', source: 'cron' },
      });
      await notifyOrder(expired, 'expired');
    } catch (err) {
      console.error(`[orders/expire] ${order.id} failed: ${errorText(err)}`);
    }
  }
  return tally;
}
