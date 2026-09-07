/**
 * GET /api/payments/natcash/retour — where the CUSTOMER's browser lands after
 * paying with NatCash (Kobara's `success_url`).
 *
 * A route handler rather than a page so the order can be identified before
 * anything is shown, and so the tracking page the customer reaches already
 * reflects whatever settlement learnt.
 *
 * IT DOES NOT DECIDE ANYTHING. On this rail the signed webhook is the
 * authority (`/api/webhooks/natcash`) and it usually arrives first; a plain
 * read only ever reaches `needs_review` (settle's strict rule). So this route
 * ASKS, and when it cannot get a definitive answer the customer sees « nous
 * vérifions », never « vous n'avez pas payé » — sending someone who has just
 * been debited back to the payment page is how a person pays twice.
 *
 * THE RESOLUTION CHAIN (spec §3.6): `orderId` in the query (what we put in the
 * `successUrl`) → Kobara's own payment id → the customer-facing `MR-…` → a
 * transaction id → the `rm_order` cookie. Whichever link matched is recorded
 * in `webhook_logs.matched_by`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { readOrderCookie } from '@/lib/orders/cookie';
import { appendEvent, logWebhook } from '@/lib/orders/events';
import { isUuid, updateOrder } from '@/lib/orders/queries';
import { resolveOrder } from '@/lib/orders/resolve';
import { settleOrder, type SettleStatus } from '@/lib/orders/settle';
import type { WebhookLogStatus } from '@/lib/orders/types';
import { RATE_LIMITS, ipFromHeaders, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REDIRECT_INIT = { status: 303, headers: { 'cache-control': 'no-store' } } as const;

/** The first non-empty value among `keys` of the query string. */
function pick(params: URLSearchParams, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** How a settlement answer reads in `webhook_logs`. */
function logStatus(status: SettleStatus): WebhookLogStatus {
  if (status === 'error' || status === 'not_configured') return 'failed';
  if (status === 'unknown_order') return 'ignored';
  return 'processed';
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const cookieReference = readOrderCookie(req.headers.get('cookie'));

  const orderId = pick(params, ['orderId', 'order_id', 'orderID', 'order']);
  const reference = pick(params, ['reference', 'ref', 'orderRef']);
  const hint = {
    // Some integrations echo OUR order id in `reference`; a uuid there is an id.
    orderId: orderId ?? (reference && isUuid(reference) ? reference : null),
    providerRef: pick(params, ['paymentId', 'payment_id', 'kobara_reference', 'providerRef', 'provider_ref', 'token']),
    reference: reference && !isUuid(reference) ? reference : null,
    transactionId: pick(params, ['transactionId', 'transaction_id', 'transaction', 'txId', 'tx_id']),
    cookieReference,
  };

  // Public by necessity and also a « check again » link: over the limit the
  // customer still lands on their order, we simply do not ask the gateway
  // again. Resolution without the transaction id stays inside our database.
  if (!rateLimit('retour-natcash', ipFromHeaders(req.headers), RATE_LIMITS.retour)) {
    const known = await resolveOrder({ ...hint, transactionId: null });
    const target = known
      ? `${origin}/${known.order.locale}/commande/${known.order.reference}`
      : `${origin}/${routing.defaultLocale}/suivi?checking=1`;
    return NextResponse.redirect(target, REDIRECT_INIT);
  }

  const raw = { query: Object.fromEntries(params), cookie: cookieReference !== null };
  const resolved = await resolveOrder(hint);
  if (!resolved) {
    await logWebhook({ source: 'natcash_retour', status: 'ignored', payload: raw, error: 'unresolved' });
    return NextResponse.redirect(`${origin}/${routing.defaultLocale}/suivi?checking=1`, REDIRECT_INIT);
  }

  const { order, matchedBy } = resolved;
  try {
    await updateOrder(order.id, { returnedAt: new Date() });
  } catch (err) {
    console.error(`[payments/natcash/retour] returnedAt for ${order.id}: ${errorText(err)}`);
  }
  await appendEvent({
    orderId: order.id,
    type: 'callback_received',
    actor: 'customer',
    message: `Retour du client depuis NatCash (correspondance ${matchedBy})`,
    data: { source: 'natcash_retour', matchedBy, ...raw },
  });

  // `retryOnUnpaid`: the signed webhook and the browser race each other, and
  // Kobara's read may lag both. Asking twice more (400 / 900 ms) costs a
  // second and spares a customer the « payez à nouveau » they must not see.
  const result = await settleOrder(order.id, { actor: 'customer', source: 'retour', retryOnUnpaid: true });
  if (result.status === 'error' || result.status === 'not_configured') {
    console.error(`[payments/natcash/retour] order ${order.id}: ${result.status}`);
  }
  await logWebhook({
    source: 'natcash_retour',
    orderId: order.id,
    matchedBy,
    status: logStatus(result.status),
    payload: raw,
    error: result.message ?? null,
  });

  const locale = result.order?.locale ?? order.locale;
  return NextResponse.redirect(`${origin}/${locale}/commande/${order.reference}?checked=1`, REDIRECT_INIT);
}
