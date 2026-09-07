/**
 * POST /api/orders — the only way an order comes into being.
 *
 * The receipt the customer saw was computed in their browser from a snapshot
 * of the settings; they send back the total they read (`expectedTotalHtg`)
 * and the fingerprint of that snapshot (`settingsUpdatedAt`). `createOrder`
 * recomputes the quote server-side and refuses with **409 `quote_changed`**
 * — carrying the fresh quote — before anything is stored or any provider is
 * called, so nobody is ever debited an amount they did not see.
 *
 * Two rate limits guard it: one per IP (generous — Haitian CGNAT puts many
 * customers behind one address) and one per normalised phone number (a
 * handful of tries per person). Both are in-memory and per-instance: a
 * speed bump, not a quota (see lib/rate-limit).
 *
 * WHO IS ORDERING: the Clerk user id is read from the session server-side and
 * never from the body, so no request can file an order under somebody else's
 * account. There is nothing to read for a guest — the ordinary case — and the
 * order is then created exactly as it always was.
 *
 * WHAT NEVER LEAVES THIS ROUTE: provider messages. A failure answers with a
 * stable machine code the UI translates (`home.errors.*`); the raw reason is
 * logged server-side and written on the order's timeline instead. Callback
 * URLs derive from `req.nextUrl.origin`, so every Vercel preview settles its
 * own orders and never a production one.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { currentAdmin } from '@/lib/auth/admin';
import { currentUserId } from '@/lib/auth/clerk';
import { dbConfigured } from '@/lib/env';
import { ORDER_COOKIE, orderCookieOptions } from '@/lib/orders/cookie';
import { createOrder, createOrderSchema, type CreateOrderError } from '@/lib/orders/create';
import type { OrderRow } from '@/lib/orders/types';
import { normalizePhone } from '@/lib/phone';
import { RATE_LIMITS, ipFromHeaders, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** The HTTP answer each creation failure deserves. */
const STATUS_BY_ERROR: Record<CreateOrderError, number> = {
  // Nothing is wired yet (no database) or this rail is not offered here.
  not_configured: 503,
  method_unavailable: 503,
  // The customer can fix these by editing the form.
  bad_phone: 400,
  bad_meru_account: 400,
  account_type_disabled: 400,
  bad_amount: 400,
  below_minimum: 400,
  above_maximum: 400,
  wallet_limit: 400,
  // The receipt moved under them: 409 carries the new one.
  quote_changed: 409,
  // The provider is the one that failed, not the request.
  provider_unreachable: 502,
  provider_error: 502,
  db_error: 500,
};

/** Order TTL in minutes, read back off the row the database actually wrote. */
function ttlMinutesOf(order: OrderRow): number {
  const ms = order.expiresAt.getTime() - order.createdAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 30;
  return Math.max(1, Math.round(ms / 60_000));
}

/** Which fields Zod refused — names only, never the values the customer typed. */
function invalidFields(issues: readonly { path: readonly PropertyKey[] }[]): string[] {
  const fields = issues.map((issue) => issue.path.map(String).join('.')).filter((name) => name.length > 0);
  return Array.from(new Set(fields));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = ipFromHeaders(req.headers);
  if (!rateLimit('order-ip', ip, RATE_LIMITS.orderIp)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: NO_STORE });
  }

  // Answered before the body is even read: without a database no order can
  // exist, and the customer must see « indisponible », not « champ invalide ».
  if (!dbConfigured()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_input', fields: invalidFields(parsed.error.issues) },
      { status: 400, headers: NO_STORE },
    );
  }

  // Keyed on the normalised number so spelling variants of one phone share a
  // quota. An unparseable number is left to `createOrder` (`bad_phone`).
  const phone = normalizePhone(parsed.data.customerPhone);
  if (phone && !rateLimit('order-phone', phone, RATE_LIMITS.orderPhone)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: NO_STORE });
  }

  const [admin, clerkUserId] = await Promise.all([currentAdmin(), currentUserId()]);

  const result = await createOrder({
    ...parsed.data,
    origin: req.nextUrl.origin,
    hasAdminSession: admin !== null,
    clerkUserId,
  });

  if (!result.ok) {
    if (result.message) console.error(`[api/orders] ${result.error}: ${result.message}`);
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.quote ? { quote: result.quote } : {}) },
      { status: STATUS_BY_ERROR[result.error], headers: NO_STORE },
    );
  }

  const { order, quote, redirectUrl } = result;
  const response = NextResponse.json(
    {
      ok: true,
      reference: order.reference,
      orderId: order.id,
      redirectUrl,
      totalHtg: order.totalHtg,
      expiresAt: order.expiresAt.toISOString(),
      quote,
    },
    { headers: NO_STORE },
  );
  // Ties this browser to the order: the return routes fall back to it and the
  // tracking page shows the full details only to whoever carries it.
  response.cookies.set(ORDER_COOKIE, order.reference, orderCookieOptions(ttlMinutesOf(order)));
  return response;
}
