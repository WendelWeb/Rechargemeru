/**
 * lib/payments/natcash/kobara.ts — NatCash, reached through Kobara.
 *
 * Kobara (api.kobara.app) is a Haitian payment gateway that fronts BOTH
 * MonCash and NatCash. This platform uses it for NatCash only; MonCash has
 * its own providers (lib/payments/moncash/). If Kobara ever needs to serve
 * MonCash too, it slots in beside `direct` and `bazik` — the provider
 * contract is shared (lib/payments/gateway.ts) precisely so that is small.
 *
 * HOW A PAYMENT GOES:
 *   1. POST /api/v1/payments with `provider: "natcash"` → a `checkout_url`.
 *   2. The customer confirms in NatCash and is returned to `success_url`.
 *   3. We read the payment back from Kobara's payment LIST (see below).
 *
 * WHAT WENT WRONG ON 2026-09-13, AND WHY THIS FILE READS A LIST.
 * Order MR-EKMQDW33 was really paid — Kobara has it as `succeeded`, 9 387 HTG,
 * 21:56:42 — and this app expired it. Two assumptions were both false:
 *
 *   - THE WEBHOOK NEVER COMES. `webhook_url` is sent on every create and
 *     Kobara stores it as `null`; no signed notification has ever reached this
 *     app, nor the other app sharing the account. A rail whose only proof
 *     never arrives cannot confirm anything.
 *   - THERE IS NO RETRIEVE BY ID. `GET /api/v1/payments/{id}` answers with a
 *     404 HTML page, which this module dutifully read as "cannot tell", so
 *     settlement stayed pending until the cron expired the order.
 *
 * What DOES exist, verified against the live API: `GET /api/v1/payments`,
 * paginated with `limit`/`offset`, returning every payment of the merchant
 * with its true `status`, `amount`, `paid_at` and `metadata.order_id`. No
 * filter is honoured (`?id=`, `?reference=` are ignored), so the lookup pages
 * through recent payments and matches on `id`. That is now the rail's source
 * of truth, and it is a sound one: settlement still refuses to reach `paid`
 * on it unless every identifier matches strictly (`matchedOrderId` /
 * `matchedPaymentId`, compared in lib/orders/settle.ts).
 *
 * The signature verification below stays: if the operator ever configures a
 * webhook in the Kobara dashboard, that proof is stronger still and the
 * endpoint is ready for it.
 *
 * Throughout, "I could not find out" must never be reported as "not paid": a
 * false unpaid on a real payment is the one answer that costs a customer
 * their money.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  GatewayCreateInput,
  GatewayFailure,
  GatewayMode,
  GatewayOrder,
  GatewayPayment,
} from '../gateway';

const DEFAULT_BASE = 'https://api.kobara.app';
const TIMEOUT_MS = 15_000;

/** Server-side secret key (`kbr_sk_live_…` / `kbr_sk_test_…`). NEVER public. */
function secretKey(): string | undefined {
  return process.env.KOBARA_SECRET_KEY?.trim() || undefined;
}

export function kobaraWebhookSecret(): string | undefined {
  return process.env.KOBARA_WEBHOOK_SECRET?.trim() || undefined;
}

function apiBase(): string {
  return (process.env.KOBARA_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, '');
}

export function kobaraConfigured(): boolean {
  return Boolean(secretKey());
}

/**
 * Which environment the current key points at, read off the key itself.
 *
 * DEFAULTS TO 'live' when the prefix is unfamiliar — the same deliberate
 * inversion as the Bazik provider. Everything downstream uses this to decide
 * whether an order is a TEST that must never be recharged. Guessing 'sandbox'
 * about a key that turns out to be live would stamp TEST on a real debit;
 * guessing 'live' about a test key only shows a warning that wasn't needed.
 * Only one of those two mistakes takes someone's money.
 */
export function kobaraMode(): GatewayMode {
  const explicit = process.env.KOBARA_MODE?.trim().toLowerCase();
  if (explicit === 'sandbox') return 'sandbox';
  if (explicit === 'live') return 'live';
  return secretKey()?.includes('_test_') ? 'sandbox' : 'live';
}

export function kobaraLabel(): string {
  return `Kobara (${kobaraMode()}) — NatCash`;
}

async function kobaraFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string },
): Promise<{ ok: true; status: number; body: unknown } | GatewayFailure> {
  const key = secretKey();
  if (!key) return { ok: false, message: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Kobara recommends this to make a retried create idempotent — which
        // is exactly the protection a customer who double-taps "Payer" needs.
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      // 429/5xx are worth retrying, 4xx are answers — `isTransient` in
      // lib/payments/retry.ts keys off exactly this shape.
      const detail =
        (body as { message?: string; error?: { message?: string } } | null)?.message ??
        (body as { error?: { message?: string } } | null)?.error?.message ??
        '';
      return { ok: false, message: `HTTP ${res.status}${detail ? ` ${detail}` : ''}` };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    const message = e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/** Kobara's payment object, as documented. */
type KobaraPayment = {
  id?: string;
  kobara_reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  provider?: string;
  checkout_url?: string;
  paid_at?: string | null;
  MonCash_transaction_id?: string | null;
  transaction_id?: string | null;
  metadata?: Record<string, unknown>;
};

/** Kobara may wrap its payload in `data` — accept both, as the Bazik client
 *  had to. Docs and live responses disagree about this often enough that
 *  assuming one shape is how an integration breaks in production. */
function unwrap(body: unknown): KobaraPayment {
  const b = body as ({ data?: KobaraPayment } & KobaraPayment) | null;
  return (b?.data ?? b ?? {}) as KobaraPayment;
}

function paymentId(p: KobaraPayment): string | null {
  return p.id ?? p.kobara_reference ?? null;
}

function orderIdOf(p: KobaraPayment): string | null {
  return typeof p.metadata?.order_id === 'string' ? p.metadata.order_id : null;
}

function amountOf(p: KobaraPayment): number | null {
  return typeof p.amount === 'number' && p.amount > 0 ? Math.round(p.amount) : null;
}

/**
 * The wallet's own transaction number, which support and reconciliation quote.
 * Kobara puts it in `metadata.provider_transaction_id` (e.g. the NatCash
 * `178933654959448362`); the flat fields are older shapes, kept as fallbacks.
 */
function transactionOf(p: KobaraPayment): string | null {
  const fromMeta = p.metadata?.provider_transaction_id;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  return p.transaction_id ?? p.MonCash_transaction_id ?? p.kobara_reference ?? null;
}

/** One page of `GET /api/v1/payments`. */
type KobaraPage = {
  data?: KobaraPayment[];
  pagination?: { has_more?: boolean; next_offset?: number };
};

/** Payments per request, and how far back to look before giving up. */
const LIST_PAGE_SIZE = 50;
const LIST_MAX_PAGES = 6;

/**
 * Finds one payment in Kobara's list. No query filter is honoured, so this
 * pages from the newest until it matches `providerRef`, then stops.
 *
 * Bounded on purpose: this runs inside a customer's own return request and
 * inside the reconciliation cron. Three hundred payments back is far more
 * than any order still open, and an unbounded walk would be a way to hang
 * the page a buyer is waiting on.
 *
 * `not_found` is a distinct answer from a transport failure, and neither
 * means "not paid" — only a payment that Kobara returns with a non-success
 * status does.
 */
async function findKobaraPayment(
  providerRef: string,
): Promise<{ ok: true; payment: KobaraPayment } | GatewayFailure> {
  let offset = 0;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const res = await kobaraFetch(`/api/v1/payments?limit=${LIST_PAGE_SIZE}&offset=${offset}`, {
      method: 'GET',
    });
    if (!res.ok) return res;

    const body = (res.body ?? null) as KobaraPage | null;
    const rows = Array.isArray(body?.data) ? body.data : [];
    const hit = rows.find((p) => p.id === providerRef || p.kobara_reference === providerRef);
    if (hit) return { ok: true, payment: hit };

    if (rows.length === 0 || body?.pagination?.has_more !== true) break;
    const next = body.pagination?.next_offset;
    offset = typeof next === 'number' && next > offset ? next : offset + LIST_PAGE_SIZE;
  }
  return { ok: false, message: 'not_found' };
}

export async function createKobaraOrder(
  input: GatewayCreateInput,
): Promise<GatewayOrder | GatewayFailure> {
  const res = await kobaraFetch('/api/v1/payments', {
    method: 'POST',
    idempotencyKey: input.orderId,
    body: JSON.stringify({
      amount: Math.round(input.amountHtg),
      currency: 'HTG',
      // Explicitly NatCash, not Kobara's unified checkout: this rail is
      // presented to the customer as "NatCash" and must not silently land
      // them on a MonCash page they didn't choose.
      provider: 'natcash',
      description: input.description ?? 'Recharge Meru',
      // OUR order id travels in metadata so a webhook can be tied back to the
      // order row even if Kobara's own reference is all it echoes.
      metadata: { order_id: input.orderId },
      success_url: input.successUrl,
      error_url: input.errorUrl,
      webhook_url: input.webhookUrl,
    }),
  });
  if (!res.ok) return res;

  const p = unwrap(res.body);
  const checkoutUrl = p.checkout_url;
  const providerRef = paymentId(p);
  if (!checkoutUrl || !providerRef) {
    return { ok: false, message: 'malformed_create_response' };
  }
  return {
    ok: true,
    // Never hand a customer an http:// redirect for a payment page.
    redirectUrl: checkoutUrl.replace(/^http:\/\//i, 'https://'),
    providerRef,
    mode: kobaraMode(),
  };
}

/**
 * What a retrieve answers, plus the two identifiers settlement compares
 * before it will believe a retrieve-only "paid" (the strict rule): the
 * payment id Kobara reports must equal the `provider_ref` we stored, and the
 * `metadata.order_id` it echoes must equal our order id. Either missing ⇒
 * `needs_review`, never `paid`.
 */
export type KobaraCheck = GatewayPayment & {
  /** `metadata.order_id` as Kobara echoes it — OUR order id, or null. */
  matchedOrderId: string | null;
  /** `id ?? kobara_reference` — what we stored as `provider_ref`, or null. */
  matchedPaymentId: string | null;
};

/**
 * Asks Kobara about an order, through the payment list — the only read this
 * gateway actually serves (see the file header for how that was established).
 *
 * `paid: false` means Kobara returned the payment and it is not a success.
 * Everything else is a failure message, never a false "unpaid": callers turn
 * `paid: false` into "go and pay", which would charge twice somebody who has
 * already paid.
 */
export async function checkKobaraOrder(providerRef: string): Promise<KobaraCheck | GatewayFailure> {
  const found = await findKobaraPayment(providerRef);
  if (!found.ok) return found;

  const p = found.payment;
  return {
    ok: true,
    paid: isKobaraPaid(p.status),
    transactionId: transactionOf(p),
    amountHtg: amountOf(p),
    payer: null,
    raw: p,
    matchedOrderId: orderIdOf(p),
    matchedPaymentId: paymentId(p),
  };
}

/** Pure — only an explicit success counts. 'pending' is not a maybe-yes. */
export function isKobaraPaid(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    ['succeeded', 'success', 'completed', 'paid'].includes(status.trim().toLowerCase())
  );
}

/* ----------------------------- webhook proof ------------------------------ */

/** How stale a signed webhook may be before we refuse it (replay protection). */
const MAX_SIGNATURE_AGE_S = 5 * 60;

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** `t=<unix>,v1=<hex>` → { t, v1 }; a pair without `=` is dropped. */
function parseSignatureHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

/**
 * Verifies a `Kobara-Signature: t=<unix>,v1=<hex>` header against the RAW
 * request body. Pure and exported so it can be tested without a live gateway.
 *
 * THE TIMESTAMP IS MANDATORY. A signature is proof that Kobara wrote these
 * bytes, not proof of WHEN — and on this rail a webhook that verifies is a
 * real `paid`. Without `t`, a notification captured once could be replayed
 * forever. So a missing, blank or non-numeric `t` is refused outright, and a
 * numeric one must sit within five minutes of now, in either direction.
 *
 * TWO PAYLOAD FORMS ARE ACCEPTED, deliberately. Kobara's docs show the HMAC
 * computed over `JSON.stringify(payload)` — i.e. a RE-serialised object —
 * while the Stripe-style convention this header format comes from signs
 * `"<t>.<raw body>"`. Re-serialising is unreliable (key order and whitespace
 * are not guaranteed to survive a round trip), so this checks the raw body
 * both ways and accepts either. Both are keyed HMACs over the exact bytes we
 * received; accepting two encodings of the same proof costs no security,
 * whereas guessing the wrong one rejects every genuine payment notification.
 *
 * Returns false for a missing secret: an unverifiable webhook is not a
 * trusted one, and this rail reaches `paid` on that trust alone.
 */
export function verifyKobaraSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowMs: number,
): boolean {
  if (!secret || !header) return false;

  const parts = parseSignatureHeader(header);
  const v1 = parts.v1;
  if (!v1) return false;

  const tRaw = parts.t;
  if (tRaw === undefined || tRaw === '') return false;
  const t = Number(tRaw);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(nowMs / 1000 - t) > MAX_SIGNATURE_AGE_S) return false;

  const hmac = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');
  return safeEqualHex(hmac(rawBody), v1) || safeEqualHex(hmac(`${tRaw}.${rawBody}`), v1);
}

/** Shape of the `payment.succeeded` event body Kobara delivers. */
export type KobaraEvent = {
  id?: string;
  type?: string;
  data?: { payment?: KobaraPayment };
};

/** The useful bits of a verified event. */
export type KobaraEventSummary = {
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
  paid: boolean;
  amountHtg: number | null;
  transactionId: string | null;
};

/** Pure — the useful bits of a verified event, or null if it isn't one. */
export function readKobaraEvent(body: unknown): KobaraEventSummary | null {
  const evt = body as KobaraEvent | null;
  if (!evt || typeof evt !== 'object') return null;
  const payment = evt.data?.payment;
  if (!payment || typeof payment !== 'object') return null;
  return {
    eventType: typeof evt.type === 'string' ? evt.type : 'unknown',
    paymentId: paymentId(payment),
    orderId: orderIdOf(payment),
    paid: isKobaraPaid(payment.status),
    amountHtg: amountOf(payment),
    transactionId: payment.transaction_id ?? payment.kobara_reference ?? null,
  };
}
