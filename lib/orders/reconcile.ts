/**
 * lib/orders/reconcile.ts — asking the providers again about orders nobody
 * confirmed.
 *
 * A callback can be lost, a customer can close the browser on the
 * provider's page, a webhook can arrive while the database hiccups. This
 * sweep re-settles every `pending_payment` or `expired` order between ten
 * minutes and five days old that has not been checked for an hour, in
 * creation order, sequentially (the providers share one token cache and one
 * database), and stops when its time budget runs out so the cron never hits
 * the platform's function timeout. An order checked `maxAttempts` times is
 * marked `reconcile_gave_up` and left to the operator.
 */
import { appendEvent } from '@/lib/orders/events';
import { countReconcileCandidates, listReconcileCandidates } from '@/lib/orders/queries';
import { settleOrder, type SettleResult } from '@/lib/orders/settle';

export const RECONCILE_DEFAULTS = {
  minAgeMs: 10 * 60_000,
  maxAgeMs: 5 * 24 * 3_600_000,
  notVerifiedSinceMs: 60 * 60_000,
  maxAttempts: 24,
} as const;

export type ReconcileInput = {
  now: Date;
  /** Stop (leaving `remaining`) once this much time has passed. */
  budgetMs: number;
  limit: number;
  settle?: (id: string) => Promise<SettleResult>;
  minAgeMs?: number;
  maxAgeMs?: number;
  notVerifiedSinceMs?: number;
  maxAttempts?: number;
};

export type ReconcileTally = {
  checked: number;
  granted: number;
  review: number;
  unpaid: number;
  pending: number;
  failed: number;
  /** Candidates still waiting after this run (out of budget or over the limit). */
  remaining: number;
  gaveUp: number;
};

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export async function reconcile(input: ReconcileInput): Promise<ReconcileTally> {
  const tally: ReconcileTally = { checked: 0, granted: 0, review: 0, unpaid: 0, pending: 0, failed: 0, remaining: 0, gaveUp: 0 };
  const window = {
    now: input.now,
    minAgeMs: input.minAgeMs ?? RECONCILE_DEFAULTS.minAgeMs,
    maxAgeMs: input.maxAgeMs ?? RECONCILE_DEFAULTS.maxAgeMs,
    notVerifiedSinceMs: input.notVerifiedSinceMs ?? RECONCILE_DEFAULTS.notVerifiedSinceMs,
    maxAttempts: input.maxAttempts ?? RECONCILE_DEFAULTS.maxAttempts,
  };
  const settle = input.settle ?? ((id: string) => settleOrder(id, { actor: 'system', source: 'cron' }));
  const startedAt = Date.now();

  let candidates;
  let total: number;
  try {
    [candidates, total] = await Promise.all([
      listReconcileCandidates({ ...window, limit: input.limit }),
      countReconcileCandidates(window),
    ]);
  } catch (err) {
    console.error(`[orders/reconcile] listing failed: ${errorText(err)}`);
    return tally;
  }

  let processed = 0;
  for (const order of candidates) {
    if (Date.now() - startedAt >= input.budgetMs) break;
    processed += 1;
    tally.checked += 1;
    let result: SettleResult;
    try {
      result = await settle(order.id);
    } catch (err) {
      result = { status: 'error', order: null, message: errorText(err) };
    }
    switch (result.status) {
      case 'granted':
        tally.granted += 1;
        break;
      case 'review':
        tally.review += 1;
        break;
      case 'unpaid':
        tally.unpaid += 1;
        break;
      case 'pending':
        tally.pending += 1;
        break;
      case 'error':
      case 'not_configured':
        tally.failed += 1;
        break;
      default:
        break;
    }
    const settled = result.status === 'granted' || result.status === 'review' || result.status === 'already';
    if (!settled && order.verifyAttempts + 1 >= window.maxAttempts) {
      tally.gaveUp += 1;
      await appendEvent({
        orderId: order.id,
        type: 'reconcile_gave_up',
        actor: 'system',
        message: `Réconciliation abandonnée après ${window.maxAttempts} vérifications sans paiement confirmé`,
        data: { attempts: order.verifyAttempts + 1, lastStatus: result.status, message: result.message ?? null },
      });
    }
  }

  tally.remaining = Math.max(total - processed, 0);
  return tally;
}
