/**
 * GET /api/cron/tick — the platform's single scheduled job (spec §2, §8).
 *
 * Three passes, always in this order, because each one depends on the state
 * the previous one leaves behind:
 *
 * 1. **Réconciliation** — re-ask the providers about orders nobody confirmed
 *    (10 min to 5 days old, unchecked for an hour, under 24 attempts). A lost
 *    callback, a customer who closed the browser on the provider's page, a
 *    webhook that arrived during a database hiccup: this is what catches them.
 * 2. **Expiration** — write `expired` down for the reports, after one last
 *    provider check on MonCash orders so a late payment lands in
 *    `needs_review` rather than being written off.
 * 3. **Re-alertes admin** — a live `paid` / `needs_review` order the operator
 *    has not been successfully told about after 30 minutes, then a reminder at
 *    24 hours. Money is waiting on a human here; one lost email must not mean
 *    a customer waits forever.
 *
 * BUDGET. Vercel gives the function 60 s (`maxDuration`, mirrored in
 * vercel.json). Reconciliation stops on its own after 45 s and reports how
 * many candidates it left; the two later passes are skipped rather than
 * truncated if the clock has already run out, and the answer says so — the
 * next tick picks them up.
 *
 * GUARD. `CRON_SECRET` via `Authorization: Bearer …` (Vercel Cron sends it):
 * no secret ⇒ 503 (not wired yet), wrong bearer ⇒ 401. Never logs either.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';
import { dbConfigured } from '@/lib/env';
import { notifyOrder } from '@/lib/notifications/dispatch';
import { expireStaleOrders, type ExpireResult } from '@/lib/orders/expire';
import { listAdminReminders } from '@/lib/orders/queries';
import { reconcile, type ReconcileTally } from '@/lib/orders/reconcile';
import { settleOrder } from '@/lib/orders/settle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Reconciliation stops here, leaving the rest to the next tick. */
const RECONCILE_BUDGET_MS = 45_000;
/** How many orders one tick re-verifies at most (each is a provider round trip). */
const RECONCILE_LIMIT = 30;
/** How many stale orders one tick materialises as `expired`. */
const EXPIRE_LIMIT = 25;
/** How many admin re-alerts one tick sends. */
const REMINDER_LIMIT = 50;
/** Past this, the remaining passes are left to the next tick rather than truncated. */
const OVERALL_BUDGET_MS = 52_000;

type ReminderTally = { considered: number; sent: number; skipped: number; failed: number };

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * Re-tells the operator about the orders waiting on them. `notifyOrder` is
 * deduplicated by the database, so an alert that already went out costs
 * nothing here; one that failed or was never inserted goes out again. No
 * `force`: forcing would bypass the dedupe index for the CUSTOMER's copy too
 * and send them the same « paiement reçu » every hour.
 */
async function sendAdminReminders(now: Date): Promise<ReminderTally> {
  const tally: ReminderTally = { considered: 0, sent: 0, skipped: 0, failed: 0 };
  let reminders;
  try {
    reminders = await listAdminReminders(now, REMINDER_LIMIT);
  } catch (err) {
    console.error(`[cron/tick] admin reminders listing failed: ${errorText(err)}`);
    return tally;
  }
  for (const { order, template } of reminders) {
    tally.considered += 1;
    const result = await notifyOrder(order, template);
    tally.sent += result.sent;
    tally.skipped += result.skipped;
    tally.failed += result.failed;
  }
  return tally;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = checkCronAuth(req.headers.get('authorization'));
  const status = cronAuthStatus(auth);
  if (status !== null) {
    return NextResponse.json({ ok: false, reason: auth }, { status, headers: NO_STORE });
  }

  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503, headers: NO_STORE });
  }

  const now = new Date();
  const skipped: string[] = [];

  const reconciled: ReconcileTally = await reconcile({ now, budgetMs: RECONCILE_BUDGET_MS, limit: RECONCILE_LIMIT });

  let expired: ExpireResult = { expired: 0, recovered: 0 };
  if (Date.now() - startedAt < OVERALL_BUDGET_MS) {
    expired = await expireStaleOrders({
      now,
      limit: EXPIRE_LIMIT,
      verifyFirst: (id) => settleOrder(id, { actor: 'system', source: 'cron' }),
    });
  } else {
    skipped.push('expire');
  }

  let reminders: ReminderTally = { considered: 0, sent: 0, skipped: 0, failed: 0 };
  if (Date.now() - startedAt < OVERALL_BUDGET_MS) {
    reminders = await sendAdminReminders(now);
  } else {
    skipped.push('reminders');
  }

  return NextResponse.json(
    { ok: true, ms: Date.now() - startedAt, reconciled, expired, reminders, skipped },
    { headers: NO_STORE },
  );
}
