'use server';

/**
 * lib/orders/actions.ts — the public site's Server Functions.
 *
 * - `recheckOrder` is what the tracking page polls while « nous vérifions
 *   votre paiement » is showing. It is rate-limited per IP and throttled per
 *   order (one provider call every 20 s), because a page left open must
 *   never turn into a provider flood.
 * - `lookupOrder` is `/suivi`: reference + exact phone, the same 404 for
 *   « unknown » and « wrong phone », then the `rm_order` cookie and a
 *   redirect to the order page.
 * - `resumeReference` reads that cookie for the « Reprendre ma dernière
 *   commande » banner.
 *
 * A file marked `'use server'` may only export async functions; the cookie
 * name and options are therefore local constants. They must stay identical
 * to lib/orders/cookie.ts (`ORDER_COOKIE`, `orderCookieOptions`), which
 * `POST /api/orders` uses to set the same cookie.
 */
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { isProduction } from '@/lib/env';
import { normalizePhone } from '@/lib/phone';
import { RATE_LIMITS, ipFromHeaders, rateLimit } from '@/lib/rate-limit';
import { getOrderByReference } from '@/lib/orders/queries';
import { normalizeReference } from '@/lib/orders/reference';
import { settleOrder, type SettleStatus } from '@/lib/orders/settle';
import type { OrderStatus } from '@/lib/orders/types';
import { getSettings } from '@/lib/settings/store';

const ORDER_COOKIE = 'rm_order';
/** One provider call per order per this many milliseconds from the tracking page. */
const RECHECK_THROTTLE_MS = 20_000;
const LOCALES = ['fr', 'ht'] as const;

export type RecheckResult = { status: SettleStatus | 'rate_limited' | 'throttled'; orderStatus: OrderStatus | null };

export type LookupState = { error?: 'not_found' | 'rate_limited' };

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** The order cookie: HttpOnly, for the order's TTL plus one hour (spec §3.4). */
function orderCookieOptions(ttlMinutes: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction(),
    path: '/',
    maxAge: (ttlMinutes + 60) * 60,
  };
}

/**
 * Re-asks the provider about one order, for the tracking page. Never
 * throws; `orderStatus` is the status as it stands after the call so the
 * poller knows when to stop.
 */
export async function recheckOrder(reference: string): Promise<RecheckResult> {
  try {
    const normalized = normalizeReference(String(reference ?? ''));
    if (!normalized) return { status: 'unknown_order', orderStatus: null };

    const ip = ipFromHeaders(await headers());
    if (!rateLimit('recheck', ip, RATE_LIMITS.recheck)) return { status: 'rate_limited', orderStatus: null };

    const order = await getOrderByReference(normalized);
    if (!order) return { status: 'unknown_order', orderStatus: null };

    const lastVerified = order.lastVerifiedAt?.getTime() ?? null;
    if (lastVerified !== null && Date.now() - lastVerified < RECHECK_THROTTLE_MS) {
      return { status: 'throttled', orderStatus: order.status };
    }

    const result = await settleOrder(order.id, { actor: 'customer', source: 'recheck', retryOnUnpaid: false });
    for (const locale of LOCALES) revalidatePath(`/${locale}/commande/${normalized}`);
    return { status: result.status, orderStatus: result.order?.status ?? order.status };
  } catch (err) {
    console.error(`[orders/actions] recheckOrder failed: ${errorText(err)}`);
    return { status: 'error', orderStatus: null };
  }
}

/**
 * `/suivi`: finds the order by reference and exact WhatsApp number, sets the
 * `rm_order` cookie and redirects to the order page. Unknown reference and
 * non-matching phone are the same answer, on purpose.
 */
export async function lookupOrder(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const ip = ipFromHeaders(await headers());
  if (!rateLimit('track', ip, RATE_LIMITS.track)) return { error: 'rate_limited' };

  const rawReference = formData.get('reference');
  const rawPhone = formData.get('phone');
  const reference = normalizeReference(typeof rawReference === 'string' ? rawReference : '');
  const phone = normalizePhone(typeof rawPhone === 'string' ? rawPhone : '');
  if (!reference || !phone) return { error: 'not_found' };

  let found = false;
  let ttlMinutes = 30;
  try {
    const order = await getOrderByReference(reference);
    found = order !== null && order.customerPhone === phone;
    if (found) ttlMinutes = (await getSettings()).orderTtlMinutes;
  } catch (err) {
    console.error(`[orders/actions] lookupOrder failed: ${errorText(err)}`);
    return { error: 'not_found' };
  }
  if (!found) return { error: 'not_found' };

  (await cookies()).set(ORDER_COOKIE, reference, orderCookieOptions(ttlMinutes));
  const locale = await getLocale();
  redirect(`/${locale}/commande/${reference}`);
}

/** The reference in the `rm_order` cookie, normalised, or `null`. Never throws. */
export async function resumeReference(): Promise<string | null> {
  try {
    const value = (await cookies()).get(ORDER_COOKIE)?.value;
    return value ? normalizeReference(value) : null;
  } catch {
    return null;
  }
}
