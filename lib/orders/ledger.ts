/**
 * lib/orders/ledger.ts — reconciling against the provider's own books.
 *
 * WHY THIS EXISTS. Every other check in this codebase starts from one of OUR
 * orders and asks the provider "was this paid?". That question can only be as
 * good as the reference we stored and the endpoint we call — and on
 * 2026-09-13 both were wrong at once, so a real 9 387 HTG payment stayed
 * invisible until it was written off.
 *
 * This sweep runs the other way round. It reads the provider's list of
 * payments — the money they say they actually received — and, for each one
 * they consider settled, checks that a matching order here reflects it. It
 * cannot be fooled by a bad reference on our side, because it does not start
 * from our side.
 *
 * Three outcomes, each acted on:
 *
 *   - the order exists and is already paid, fulfilled or refunded ⇒ nothing
 *     to do, the books agree;
 *   - the order exists and is NOT settled ⇒ `settleOrder` is run, which goes
 *     through the same strict verification as every other path and lands the
 *     order in `paid` or, past its deadline, `needs_review`;
 *   - no order matches at all ⇒ an ORPHAN: the provider took money this
 *     platform has no record of. That is never routine, and it is recorded in
 *     `webhook_logs` so /admin/sante shows it rather than losing it in a
 *     server log nobody reads.
 *
 * NEVER THROWS, and never writes `paid` by itself: it only ever asks
 * `settleOrder` to look again. The provider's ledger decides WHICH orders
 * deserve a second look; the settlement rules still decide what is true.
 */
import type { OrderStatus } from '@/lib/orders/types';
import { logWebhook } from '@/lib/orders/events';
import { getOrderById, getOrderByProviderRef, isUuid } from '@/lib/orders/queries';
import { listKobaraPayments } from '@/lib/payments/natcash/kobara';
import { natcashConfigured } from '@/lib/payments/natcash';
import type { SettleResult } from '@/lib/orders/settle';

export type LedgerTally = {
  /** Settled payments the provider reported inside the window. */
  examined: number;
  /** Orders this sweep pushed through settlement. */
  settled: number;
  /** Orders whose books already agreed. */
  agreed: number;
  /** Payments the provider settled with no order here to match. */
  orphans: number;
  /** Payments that could not be checked (database or settlement failure). */
  failed: number;
  /** Set when the provider's ledger itself could not be read. */
  unavailable?: string;
};

export type LedgerInput = {
  now: Date;
  /** How far back to trust the ledger. Older money is a support case, not a sweep. */
  maxAgeMs: number;
  /** How many ledger entries to read at most. */
  limit: number;
  settle: (orderId: string) => Promise<SettleResult>;
};

/** Statuses that already reflect the money — nothing for the sweep to do. */
const SETTLED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'paid',
  'fulfilled',
  'refunded',
  'needs_review',
]);

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * Compares Kobara's settled payments with this platform's orders.
 *
 * Read-only towards the provider, and idempotent: running it twice settles
 * nothing twice, because `settleOrder` is itself a compare-and-set.
 */
export async function sweepKobaraLedger({ now, maxAgeMs, limit, settle }: LedgerInput): Promise<LedgerTally> {
  const tally: LedgerTally = { examined: 0, settled: 0, agreed: 0, orphans: 0, failed: 0 };
  if (!natcashConfigured()) return { ...tally, unavailable: 'not_configured' };

  const ledger = await listKobaraPayments(limit);
  if (!Array.isArray(ledger)) {
    console.error(`[orders/ledger] kobara ledger unreadable: ${ledger.message}`);
    return { ...tally, unavailable: ledger.message };
  }

  const floor = now.getTime() - maxAgeMs;

  for (const entry of ledger) {
    if (entry.status !== 'paid') continue;
    const when = (entry.paidAt ?? entry.createdAt)?.getTime();
    if (typeof when === 'number' && when < floor) continue;

    tally.examined += 1;

    try {
      const order =
        (entry.paymentId ? await getOrderByProviderRef(entry.paymentId, 'kobara') : null) ??
        (isUuid(entry.orderId) ? await getOrderById(entry.orderId) : null);

      if (!order) {
        tally.orphans += 1;
        console.error(
          `[orders/ledger] ORPHELIN : Kobara a encaissé ${entry.amountHtg ?? '?'} HTG ` +
            `(paiement ${entry.paymentId ?? '?'}) sans commande correspondante ici`,
        );
        await logWebhook({
          source: 'natcash',
          orderId: null,
          status: 'failed',
          error:
            `Paiement encaissé chez Kobara sans commande correspondante : ` +
            `${entry.amountHtg ?? '?'} HTG, transaction ${entry.transactionId ?? '?'}`,
          payload: { ...entry, paidAt: entry.paidAt?.toISOString() ?? null, createdAt: entry.createdAt?.toISOString() ?? null },
        });
        continue;
      }

      if (SETTLED.has(order.status)) {
        tally.agreed += 1;
        continue;
      }

      const result = await settle(order.id);
      if (result.status === 'granted' || result.status === 'review') {
        tally.settled += 1;
        console.log(
          `[orders/ledger] ${order.reference} récupérée depuis le registre Kobara (${result.status})`,
        );
      } else if (result.status === 'already') {
        tally.agreed += 1;
      } else {
        tally.failed += 1;
        console.error(`[orders/ledger] ${order.reference} : règlement impossible (${result.status})`);
      }
    } catch (err) {
      tally.failed += 1;
      console.error(`[orders/ledger] entrée ${entry.paymentId ?? '?'} : ${errorText(err)}`);
    }
  }

  return tally;
}
