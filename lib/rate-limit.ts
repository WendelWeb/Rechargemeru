/**
 * lib/rate-limit.ts — shared in-memory sliding-window rate limiter guarding
 * every surface an anonymous caller can reach: order creation (by IP and by
 * phone), the recheck action, the payment-return routes, order tracking, the
 * admin login, the visit beacon and the journey events.
 *
 * HONEST LIMITATION, on purpose: this is IN-MEMORY and PER-INSTANCE. On a
 * serverless deploy every instance keeps its own window and a cold start
 * resets it — the real guarantee is "slows a casual abuser down", not "hard
 * global quota". The persistent account lock on the admin login (settings
 * store) is the second layer where a hard guarantee matters.
 *
 * One shared, bounded map behind every caller — `rateLimit(bucket, key, …)`
 * keys it by `${bucket}:${key}` so callers never share a quota by accident.
 */

export type RateWindow = { max: number; windowMs: number };

/**
 * Pure sliding-window check-and-record: prunes hits older than `windowMs`,
 * then either records `now` and allows (true) or refuses (false) when the
 * key already has `max` live hits. Mutates `hits` — the caller owns the map.
 */
export function allowHit(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  { max, windowMs }: RateWindow,
): boolean {
  const live = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (live.length >= max) {
    hits.set(key, live);
    return false;
  }
  live.push(now);
  hits.set(key, live);
  return true;
}

const sharedHits = new Map<string, number[]>();

/** Named windows, one per guarded surface. Keys are an IP unless noted. */
export const RATE_LIMITS = {
  /** `POST /api/orders` per IP — generous: CGNAT puts many customers behind one address. */
  orderIp: { max: 60, windowMs: 600_000 },
  /** `POST /api/orders` per normalized phone number — one person, a handful of tries. */
  orderPhone: { max: 5, windowMs: 600_000 },
  /** `recheckOrder` server action per IP — the tracking page polls every 5 s for 2 min. */
  recheck: { max: 30, windowMs: 60_000 },
  /** `GET /api/payments/{moncash,natcash}/retour` per IP. */
  retour: { max: 20, windowMs: 300_000 },
  /** `lookupOrder` (reference + phone) per IP — enumeration guard. */
  track: { max: 20, windowMs: 300_000 },
  /** `POST /admin/login` per IP — the persistent account lock is the hard limit. */
  login: { max: 10, windowMs: 900_000 },
  /**
   * `POST /api/visit` per IP — one beacon per page shown, so a whole school or
   * cybercafé behind one CGNAT address browsing at once must fit; past it the
   * view is simply not recorded (the visitor never notices).
   */
  visit: { max: 120, windowMs: 600_000 },
  /**
   * `POST /api/events` per IP — batches of up to 50 journey events, sent a
   * few seconds after the first one and whenever the tab is hidden, so a
   * busy visitor posts a few times a page; twice the page-view budget keeps
   * the same shared-address headroom. Past it a batch is simply dropped.
   */
  events: { max: 240, windowMs: 600_000 },
} as const satisfies Record<string, RateWindow>;

/**
 * bucket+key keyed sliding-window check against the one shared, bounded map.
 * `key` is whatever identifies the caller for that bucket: an IP from
 * `ipFromHeaders`, or a normalized phone number. Buckets never interfere
 * with each other's quota — the key embeds both.
 */
export function rateLimit(
  bucket: string,
  key: string,
  window: RateWindow,
  now = Date.now(),
): boolean {
  // Bound the map so a rotating-key flood across every bucket can't grow
  // memory forever: once it gets large, drop fully-expired entries.
  if (sharedHits.size > 5000) {
    for (const [k, times] of sharedHits) {
      if (times.every((t) => now - t >= window.windowMs)) sharedHits.delete(k);
    }
  }
  return allowHit(sharedHits, `${bucket}:${key}`, now, window);
}

/**
 * Extracts the caller's IP the same way every guarded route does: the first
 * hop of `x-forwarded-for` (what Vercel sets), `'unknown'` if absent — never
 * throws, never blocks a request whose proxy chain is unusual.
 */
export function ipFromHeaders(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
