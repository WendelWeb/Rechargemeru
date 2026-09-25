/**
 * POST /api/events — what a visitor did on the public site, in batches.
 *
 * Sent by the browser itself (`lib/analytics/client.ts`): a few seconds after
 * the first event, at fifty, or through `navigator.sendBeacon` when the page
 * is hidden or closed. Body: `{ events: [{ type, name, target?, value?, path,
 * viewId?, age? }] }` as JSON, at most 16 KB — read from raw text, so the
 * `text/plain` body a beacon may send parses too. See `lib/analytics/events.ts`
 * for what each event is cut down to; at most fifty are kept per batch.
 *
 * THE SAME RULES AS `POST /api/visit`, on purpose — the two are one feature:
 * - the device and visit cookies are read (or minted) and re-set on every
 *   answer, so activity on a page keeps the visit alive exactly as a new page
 *   would: a visitor reading the form for twenty minutes is still on the
 *   same visit when he taps « Payer »;
 * - the answer is always 204, uncached, and never waits on the database;
 * - nothing is recorded without a database, without a user-agent, for a
 *   crawler, a script or a headless browser, for a cross-site post, or past
 *   the per-IP rate limit (its own `events` bucket, so a chatty page can
 *   never cost the visit beacon its quota).
 *
 * The batch is written as ONE insert in `after()`, once the answer has gone;
 * a failure is logged without its parameters (cookie values).
 */
import { NextResponse, after, userAgent, type NextRequest } from 'next/server';
import { db, queryFailureText, schema } from '@/db';
import { MAX_EVENTS_BODY_BYTES, parseEventsBody, sanitizeEvents } from '@/lib/analytics/events';
import {
  DEVICE_COOKIE,
  VISIT_COOKIE,
  deviceCookieOptions,
  isAutomatedAgent,
  visitCookieOptions,
  visitorIds,
} from '@/lib/analytics/visitor';
import { dbConfigured } from '@/lib/env';
import { RATE_LIMITS, ipFromHeaders, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** The raw body, or `''` when it is too large to be a batch or cannot be read. */
async function readBody(req: NextRequest): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_EVENTS_BODY_BYTES) return '';
  try {
    return await req.text();
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // The clock the events are dated against: the moment the batch arrived,
  // before anything else could delay it.
  const receivedAt = new Date();

  const { deviceId, visitId } = visitorIds(
    req.cookies.get(DEVICE_COOKIE)?.value,
    req.cookies.get(VISIT_COOKIE)?.value,
  );

  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  response.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions());
  response.cookies.set(VISIT_COOKIE, visitId, visitCookieOptions());

  if (!dbConfigured()) return response;
  if (!req.headers.get('user-agent')) return response;
  const ua = userAgent(req);
  if (ua.isBot || isAutomatedAgent(ua)) return response;
  if (req.headers.get('sec-fetch-site') === 'cross-site') return response;
  if (!rateLimit('events', ipFromHeaders(req.headers), RATE_LIMITS.events)) return response;

  const events = sanitizeEvents(parseEventsBody(await readBody(req)), receivedAt);
  if (events.length === 0) return response;

  after(async () => {
    try {
      await db.insert(schema.siteEvents).values(events.map((event) => ({ deviceId, visitId, ...event })));
    } catch (err) {
      console.error(`[api/events] insert failed: ${queryFailureText(err)}`);
    }
  });
  return response;
}
