/**
 * GET|POST /api/webhooks/moncash — Digicel's / Bazik's server-to-server
 * payment notification (the « Link to receive the payment Notification » of
 * the MonCash business portal, and the `webhookUrl` we hand Bazik).
 *
 * MONCASH DOES NOT SIGN THESE CALLBACKS. The body is therefore a HINT and
 * nothing more: it says which order to look at, never that it was paid.
 * `settleOrder` re-asks the provider that created the order — so a forged
 * POST here achieves nothing beyond making us query our own order, and a
 * genuine one cannot skip a single check.
 *
 * BOTH VERBS, ALWAYS 200 once we have looked. Merchants report MonCash using
 * either verb, and a non-2xx would make it redeliver a callback that is
 * already idempotent — the customer's own return
 * (`/api/payments/moncash/retour`) and the hourly reconciliation are two more
 * independent chances at the same order. The one exception is « no database »:
 * 503 asks the provider to come back later, which is exactly right.
 *
 * Everything that arrives is written to `webhook_logs` (raw payload, how the
 * order was matched, what settlement answered) so a disputed payment can be
 * audited months later.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { dbConfigured } from '@/lib/env';
import { appendEvent, logWebhook } from '@/lib/orders/events';
import { isUuid } from '@/lib/orders/queries';
import { resolveOrder } from '@/lib/orders/resolve';
import { settleOrder, type SettleStatus } from '@/lib/orders/settle';
import type { WebhookLogStatus } from '@/lib/orders/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** How much of an unparseable body is worth keeping for the audit trail. */
const RAW_PAYLOAD_MAX = 2_000;

type Fields = Record<string, string>;

/** The first non-empty value among `keys`, whatever spelling the caller used. */
function pick(fields: Fields, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Flattens a query string or a JSON/form body into plain string fields. */
function toFields(source: URLSearchParams | Record<string, unknown>): Fields {
  const out: Fields = {};
  if (source instanceof URLSearchParams) {
    for (const [key, value] of source) if (!(key in out)) out[key] = value;
    return out;
  }
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
  }
  return out;
}

/** Reads the request body as fields, accepting JSON and form encoding. */
async function readBody(req: NextRequest): Promise<{ fields: Fields; payload: unknown }> {
  if (req.method !== 'POST') return { fields: {}, payload: null };
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { fields: {}, payload: null };
  }
  if (!raw.trim()) return { fields: {}, payload: null };
  try {
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return { fields: toFields(json as Record<string, unknown>), payload: json };
    }
    return { fields: {}, payload: json };
  } catch {
    // Not JSON: several integrations post `application/x-www-form-urlencoded`.
    const form = toFields(new URLSearchParams(raw));
    return { fields: form, payload: Object.keys(form).length > 0 ? form : raw.slice(0, RAW_PAYLOAD_MAX) };
  }
}

/** How a settlement answer reads in `webhook_logs`. */
function logStatus(status: SettleStatus): WebhookLogStatus {
  if (status === 'error' || status === 'not_configured') return 'failed';
  if (status === 'unknown_order') return 'ignored';
  return 'processed';
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!dbConfigured()) {
    console.error('[webhooks/moncash] no DATABASE_URL — asking MonCash to redeliver');
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503, headers: NO_STORE });
  }

  const query = toFields(req.nextUrl.searchParams);
  const { fields: body, payload } = await readBody(req);
  const fields: Fields = { ...query, ...body };
  const raw = { query, body: payload ?? null };

  const orderId = pick(fields, ['orderId', 'order_id', 'orderID', 'order']);
  const reference = pick(fields, ['reference', 'ref', 'orderRef']);
  const hint = {
    // Some integrations echo OUR order id in `reference`; a uuid there is an id.
    orderId: orderId ?? (reference && isUuid(reference) ? reference : null),
    providerRef: pick(fields, ['providerRef', 'provider_ref', 'token', 'payment_token']),
    reference: reference && !isUuid(reference) ? reference : null,
    transactionId: pick(fields, ['transactionId', 'transaction_id', 'transaction', 'txId', 'tx_id']),
  };

  const resolved = await resolveOrder(hint);
  if (!resolved) {
    await logWebhook({ source: 'moncash', status: 'ignored', payload: raw, error: 'unresolved' });
    return NextResponse.json({ ok: false, reason: 'no_order' }, { headers: NO_STORE });
  }

  const { order, matchedBy } = resolved;
  await appendEvent({
    orderId: order.id,
    type: 'callback_received',
    actor: 'provider',
    message: `Notification MonCash reçue (${req.method}, correspondance ${matchedBy})`,
    data: { source: 'moncash', matchedBy, ...raw },
  });

  const result = await settleOrder(order.id, { actor: 'provider', source: 'webhook' });
  if (result.status === 'error' || result.status === 'not_configured') {
    console.error(`[webhooks/moncash] order ${order.id}: ${result.status}`);
  }
  await logWebhook({
    source: 'moncash',
    orderId: order.id,
    matchedBy,
    status: logStatus(result.status),
    payload: raw,
    error: result.message ?? null,
  });

  return NextResponse.json({ ok: true, status: result.status }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
