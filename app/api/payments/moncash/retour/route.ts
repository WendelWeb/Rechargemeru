/**
 * GET /api/payments/moncash/retour — where the CUSTOMER's browser lands after
 * paying (Digicel's « Thank you page », Bazik's `success_url`).
 *
 * It is a route handler rather than a page for two reasons. First, Digicel
 * stores ONE fixed return URL per merchant account and it carries only a
 * `transactionId` — the order has to be found before anything can be shown.
 * Second, settling here means the tracking page the customer lands on already
 * tells the truth instead of guessing.
 *
 * THE RESOLUTION CHAIN (spec §3.6): `orderId` in the query (what we put in the
 * `successUrl`) → the provider's own reference → the customer-facing `MR-…` →
 * Digicel's `transactionId`, resolved by asking Digicel which order it belongs
 * to → the `rm_order` cookie. Whichever link matched is recorded in
 * `webhook_logs.matched_by`.
 *
 * A RETURN IS NOT A PAYMENT. Nothing here believes the URL: `settleOrder`
 * re-asks the provider (with one retry on « not yet paid », because the
 * customer's browser often beats MonCash's own bookkeeping), and it is
 * idempotent, so a refresh can never double-grant. When no order can be
 * identified at all the customer goes to `/suivi?checking=1` — « give us your
 * reference » — never to an error page that implies they did not pay.
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
    providerRef: pick(params, ['providerRef', 'provider_ref', 'token', 'payment_token']),
    reference: reference && !isUuid(reference) ? reference : null,
    transactionId: pick(params, ['transactionId', 'transaction_id', 'transaction', 'txId', 'tx_id']),
    cookieReference,
  };

  // This URL is public by necessity and doubles as a « check again » link, so
  // it invites held-down refreshes — each one costing a round trip to Digicel.
  // Over the limit the customer still lands somewhere useful; we simply do not
  // ask the provider again. Resolution without the transaction id stays inside
  // our own database.
  if (!rateLimit('retour-moncash', ipFromHeaders(req.headers), RATE_LIMITS.retour)) {
    const known = await resolveOrder({ ...hint, transactionId: null });
    const target = known
      ? `${origin}/${known.order.locale}/commande/${known.order.reference}`
      : `${origin}/${routing.defaultLocale}/suivi?checking=1`;
    return NextResponse.redirect(target, REDIRECT_INIT);
  }

  const raw = { query: Object.fromEntries(params), cookie: cookieReference !== null };
  const resolved = await resolveOrder(hint);
  if (!resolved) {
    await logWebhook({ source: 'moncash_retour', status: 'ignored', payload: raw, error: 'unresolved' });
    return NextResponse.redirect(`${origin}/${routing.defaultLocale}/suivi?checking=1`, REDIRECT_INIT);
  }

  const { order, matchedBy } = resolved;
  try {
    await updateOrder(order.id, { returnedAt: new Date() });
  } catch (err) {
    console.error(`[payments/moncash/retour] returnedAt for ${order.id}: ${errorText(err)}`);
  }
  await appendEvent({
    orderId: order.id,
    type: 'callback_received',
    actor: 'customer',
    message: `Retour du client depuis MonCash (correspondance ${matchedBy})`,
    data: { source: 'moncash_retour', matchedBy, ...raw },
  });

  // `retryOnUnpaid`: the browser regularly comes back a beat before Digicel
  // has finished writing the payment down. Two extra tries (400 / 900 ms) turn
  // « pas encore payé » into the truth instead of a wrong « payez à nouveau ».
  const result = await settleOrder(order.id, { actor: 'customer', source: 'retour', retryOnUnpaid: true });
  if (result.status === 'error' || result.status === 'not_configured') {
    console.error(`[payments/moncash/retour] order ${order.id}: ${result.status}`);
  }
  await logWebhook({
    source: 'moncash_retour',
    orderId: order.id,
    matchedBy,
    status: logStatus(result.status),
    payload: raw,
    error: result.message ?? null,
  });

  const locale = result.order?.locale ?? order.locale;
  return NextResponse.redirect(`${origin}/${locale}/commande/${order.reference}?checked=1`, REDIRECT_INIT);
}
