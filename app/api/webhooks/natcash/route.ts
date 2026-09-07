/**
 * POST /api/webhooks/natcash — Kobara's signed `payment.succeeded` event.
 *
 * THIS ENDPOINT IS THE AUTHORITY ON THIS RAIL. Kobara documents no retrieve
 * endpoint, so a plain read can only ever reach `needs_review` (settle's
 * strict rule); the one thing that reaches `paid` on its own is this
 * notification, proved by an HMAC-SHA256 signature over the RAW request body
 * with a mandatory, fresh timestamp (`Kobara-Signature: t=…,v1=…`, five-minute
 * window — see `verifyKobaraSignature`).
 *
 * NOTHING IS TRUSTED BEFORE THE SIGNATURE VERIFIES. Unsigned, wrongly signed,
 * replayed, or unverifiable-because-no-secret: refused before a single row is
 * read. Otherwise anyone who guessed an order id could grant themselves a
 * « paid » — and on this platform « paid » is the operator being told to send
 * real dollars.
 *
 * Once verified it always answers 200 (Kobara redelivers on anything else and
 * settlement is idempotent), except « no database », where 503 asks for a
 * redelivery we can actually use. Refusals and successes alike are written to
 * `webhook_logs`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { dbConfigured } from '@/lib/env';
import { appendEvent, logWebhook } from '@/lib/orders/events';
import { resolveOrder } from '@/lib/orders/resolve';
import { settleOrder, type SettleStatus } from '@/lib/orders/settle';
import type { WebhookLogStatus } from '@/lib/orders/types';
import { kobaraWebhookSecret, readKobaraEvent, verifyKobaraSignature } from '@/lib/payments/natcash/kobara';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** How much of a refused body is kept for the audit trail. */
const RAW_PAYLOAD_MAX = 2_000;

/** How a settlement answer reads in `webhook_logs`. */
function logStatus(status: SettleStatus): WebhookLogStatus {
  if (status === 'error' || status === 'not_configured') return 'failed';
  if (status === 'unknown_order') return 'ignored';
  return 'processed';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = kobaraWebhookSecret();
  if (!secret) {
    // No secret means no way to tell a genuine notification from a forged one.
    // A configuration failure the operator must see, and a redelivery later is
    // exactly the right behaviour.
    console.error('[webhooks/natcash] KOBARA_WEBHOOK_SECRET is not set — refusing to trust any notification');
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503, headers: NO_STORE });
  }

  // The RAW bytes, before any parsing: the signature covers exactly these.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400, headers: NO_STORE });
  }

  if (!verifyKobaraSignature(raw, req.headers.get('kobara-signature'), secret, Date.now())) {
    console.error('[webhooks/natcash] signature verification failed');
    // Logged as a refusal, with the body truncated: it is unauthenticated text.
    await logWebhook({
      source: 'natcash',
      status: 'rejected',
      payload: { unverified: raw.slice(0, RAW_PAYLOAD_MAX), bytes: raw.length },
      error: 'bad_signature',
    });
    return NextResponse.json({ ok: false, reason: 'bad_signature' }, { status: 401, headers: NO_STORE });
  }

  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : null;
  } catch {
    await logWebhook({ source: 'natcash', status: 'rejected', payload: { unparsed: raw.slice(0, RAW_PAYLOAD_MAX) }, error: 'bad_json' });
    return NextResponse.json({ ok: false, reason: 'bad_json' }, { status: 400, headers: NO_STORE });
  }

  const event = readKobaraEvent(parsed);
  if (!event) {
    await logWebhook({ source: 'natcash', status: 'ignored', payload: parsed, error: 'no_payment' });
    return NextResponse.json({ ok: true, ignored: 'no_payment' }, { headers: NO_STORE });
  }
  if (!event.paid) {
    await logWebhook({ source: 'natcash', status: 'ignored', payload: parsed, error: `status_${event.eventType}` });
    return NextResponse.json({ ok: true, ignored: `status_${event.eventType}` }, { headers: NO_STORE });
  }

  if (!dbConfigured()) {
    console.error('[webhooks/natcash] no DATABASE_URL — asking Kobara to redeliver');
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503, headers: NO_STORE });
  }

  // OUR order id travels in `metadata.order_id`, set at creation; the query
  // string of the `webhookUrl` we registered carries it too, and the payment
  // id Kobara reports is the `provider_ref` we stored.
  const resolved = await resolveOrder({
    orderId: event.orderId ?? req.nextUrl.searchParams.get('orderId'),
    providerRef: event.paymentId,
  });
  if (!resolved) {
    console.error(`[webhooks/natcash] verified event ${event.paymentId ?? '?'} matches no order`);
    await logWebhook({ source: 'natcash', status: 'ignored', payload: parsed, error: 'unresolved' });
    return NextResponse.json({ ok: true, ignored: 'no_order' }, { headers: NO_STORE });
  }

  const { order, matchedBy } = resolved;
  await appendEvent({
    orderId: order.id,
    type: 'callback_received',
    actor: 'provider',
    message: `Webhook NatCash signé reçu (${event.eventType}, correspondance ${matchedBy})`,
    data: {
      source: 'natcash',
      matchedBy,
      eventType: event.eventType,
      paymentId: event.paymentId,
      amountHtg: event.amountHtg,
      transactionId: event.transactionId,
    },
  });

  // The signature IS the proof: settlement does not re-read the payment.
  const result = await settleOrder(order.id, {
    proof: {
      paid: true,
      amountHtg: event.amountHtg,
      transactionId: event.transactionId,
      payer: null,
      raw: parsed,
    },
    actor: 'provider',
    source: 'webhook',
  });
  if (result.status === 'error' || result.status === 'not_configured') {
    console.error(`[webhooks/natcash] order ${order.id}: ${result.status}`);
  }
  await logWebhook({
    source: 'natcash',
    orderId: order.id,
    matchedBy,
    status: logStatus(result.status),
    payload: parsed,
    error: result.message ?? null,
  });

  return NextResponse.json({ ok: true, status: result.status }, { headers: NO_STORE });
}
