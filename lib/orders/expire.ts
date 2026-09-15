/**
 * lib/orders/expire.ts — materialising `expired`, and never on a guess.
 *
 * Expiry is DERIVED everywhere that matters (`isExpired` in
 * lib/orders/transitions): the tracking page, order creation, the admin and
 * `settleOrder` all read `expires_at` directly. This sweep only writes the
 * status down for lists and statistics.
 *
 * WHAT THIS FILE GOT WRONG, AND WHAT IT NOW GUARANTEES. Until 2026-09-14 it
 * asked the provider before writing off a MonCash order but expired NatCash
 * orders outright, on the reasoning that "without a signed webhook a read can
 * only ever reach needs_review". That reasoning was built on a read that did
 * not work (see lib/payments/natcash/kobara.ts), and it cost a customer
 * 9 387 HTG: Kobara held the payment as `succeeded` while this sweep marked
 * the order expired.
 *
 * The rule is now absolute and applies to every rail:
 *
 *   AN ORDER IS ONLY EXPIRED WHEN THE PROVIDER HAS POSITIVELY SAID IT WAS NOT
 *   PAID — or when there is no provider reference to ask about, because then
 *   no payment can exist.
 *
 * Anything else — a network failure, an endpoint that has moved, a status
 * word nobody recognises — leaves the order pending so the next sweep can try
 * again. An order that keeps failing to verify is escalated to
 * `needs_review`, which puts it in front of the operator, rather than being
 * written off in silence. The asymmetry is the whole point: an unnecessary
 * review costs a minute of attention, a wrongly-expired order costs a
 * customer their money and the business its reputation.
 */
import { notifyOrder } from '@/lib/notifications/dispatch';
import { appendEvent } from '@/lib/orders/events';
import { listExpiredPending, transitionOrder } from '@/lib/orders/queries';
import type { SettleResult } from '@/lib/orders/settle';

export type ExpireInput = {
  now: Date;
  limit: number;
  /** One last settlement attempt (source `cron`) before an order is written off. */
  verifyFirst: (id: string) => Promise<SettleResult>;
};

export type ExpireResult = {
  expired: number;
  recovered: number;
  /** Left pending because the provider could not be asked — will be retried. */
  unverified: number;
  /** Escalated to `needs_review` after too many failed verifications. */
  escalated: number;
};

/** Settlement answers after which the order is no longer ours to expire. */
const RECOVERED = new Set<SettleResult['status']>(['granted', 'review', 'already']);

/**
 * How many failed verifications before an order stops being retried quietly
 * and goes to the operator instead. Six is roughly a day of hourly sweeps,
 * and a week of daily ones on the Hobby plan.
 */
const MAX_UNVERIFIED_ATTEMPTS = 6;

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export async function expireStaleOrders({ now, limit, verifyFirst }: ExpireInput): Promise<ExpireResult> {
  const tally: ExpireResult = { expired: 0, recovered: 0, unverified: 0, escalated: 0 };
  let stale;
  try {
    stale = await listExpiredPending(now, limit);
  } catch (err) {
    console.error(`[orders/expire] listing failed: ${errorText(err)}`);
    return tally;
  }

  for (const order of stale) {
    try {
      // No reference means the provider never created anything to pay, so
      // there is nothing to ask about and nothing that could have been paid.
      const askable = Boolean(order.providerRef);

      if (askable) {
        const last = await verifyFirst(order.id);

        if (RECOVERED.has(last.status)) {
          if (last.status !== 'already') tally.recovered += 1;
          continue;
        }

        // 'unpaid' is the ONLY answer that authorises writing the order off.
        if (last.status !== 'unpaid') {
          const attempts = (order.verifyAttempts ?? 0) + 1;

          if (attempts < MAX_UNVERIFIED_ATTEMPTS) {
            tally.unverified += 1;
            await appendEvent({
              orderId: order.id,
              type: 'verification_failed',
              actor: 'system',
              message: `Expiration refusée : le fournisseur n'a pas confirmé l'absence de paiement (${last.status})`,
              data: { settleStatus: last.status, attempts },
            });
            continue;
          }

          const flagged = await transitionOrder(order.id, 'needs_review', {
            failureReason: `Impossible de vérifier ce paiement auprès du fournisseur après ${attempts} tentatives`,
          });
          if (!flagged) continue;
          tally.escalated += 1;
          await appendEvent({
            orderId: order.id,
            type: 'review_flagged',
            actor: 'system',
            message: 'Vérification impossible : à contrôler à la main avant toute conclusion',
            data: { settleStatus: last.status, attempts },
          });
          await appendEvent({
            orderId: order.id,
            type: 'status_changed',
            actor: 'system',
            message: 'pending_payment → needs_review',
            data: { from: 'pending_payment', to: 'needs_review', source: 'cron' },
          });
          await notifyOrder(flagged, 'needs_review');
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
        message: askable
          ? 'Commande expirée : le fournisseur confirme qu’aucun paiement n’a été reçu'
          : 'Commande expirée : aucune référence fournisseur, aucun paiement possible',
        data: { expiresAt: order.expiresAt, verifyAttempts: order.verifyAttempts, askable },
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
