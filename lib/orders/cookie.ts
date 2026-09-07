/**
 * lib/orders/cookie.ts — the `rm_order` cookie that ties a browser to the
 * order it created.
 *
 * `POST /api/orders` sets it on a successful creation, the payment-return
 * routes read it as the last resort of the resolution chain (orderId →
 * transactionId → cookie) and the tracking page uses it to decide whether
 * the full details may be shown. It carries nothing but the customer-facing
 * `MR-…` reference, HttpOnly, for the order's TTL plus one hour (spec §3.4).
 *
 * `lib/orders/actions.ts` is a `'use server'` module and may only export
 * async functions, so it keeps a private copy of the same name and options;
 * the two must stay identical.
 */
import { isProduction } from '@/lib/env';
import { normalizeReference } from '@/lib/orders/reference';

export const ORDER_COOKIE = 'rm_order';

export type OrderCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  /** Seconds. */
  maxAge: number;
};

/** One hour of grace after the order itself expires, so the tracking page still recognises the browser. */
const GRACE_MINUTES = 60;

/**
 * Cookie attributes for an order whose TTL is `ttlMinutes`: HttpOnly, Lax
 * (the provider redirects back with a top-level GET, which Lax allows),
 * Secure in production only (local dev is plain http), root path.
 */
export function orderCookieOptions(ttlMinutes: number): OrderCookieOptions {
  const minutes = Number.isFinite(ttlMinutes) ? Math.max(0, Math.floor(ttlMinutes)) : 0;
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: (minutes + GRACE_MINUTES) * 60,
  };
}

/**
 * The normalised reference carried by the `rm_order` cookie of a raw
 * `Cookie` request header, or `null` when absent or not a reference. Pure:
 * accepts `req.headers.get('cookie')` directly and never throws.
 */
export function readOrderCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== ORDER_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return null;
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      return null;
    }
    return normalizeReference(value);
  }
  return null;
}
