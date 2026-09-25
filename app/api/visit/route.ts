/**
 * POST /api/visit — one page of the public site was shown.
 *
 * Sent by the browser itself (`components/site/VisitBeacon.tsx`) on the first
 * render and on every client-side navigation, so a crawler that runs no
 * JavaScript never shows up and a visitor needs no account to be counted.
 * Body: `{ path, referrer?, locale?, utm?, viewId?, screen?, net?, lang? }` as
 * JSON — read from raw text, so a `text/plain` body parses too. `viewId` is
 * the random id the browser gave this page view, repeated on the events of
 * `POST /api/events` it causes; a malformed optional field is stored as null,
 * never a reason to drop the view.
 *
 * WHO IS VISITING is two random ids in first-party cookies, minted here the
 * first time and re-set on every answer: `rm_device` (400 days, « same
 * browser ») and `rm_visit` (30 minutes, rolling — one visit is every page
 * seen without a half-hour pause). No IP address and no raw user-agent are
 * stored; see `lib/analytics/visitor.ts` for what a beacon is cut down to.
 *
 * THE ANSWER IS ALWAYS 204, fast and uncached, whether or not anything was
 * recorded: a beacon's reply is never read, and a visitor must never wait on
 * — or be shown — analytics. Nothing is recorded without a database, for a
 * crawler (`isBot`), a script or a headless browser, a request with no
 * user-agent, a cross-site post, a path we do not keep (the back-office, the
 * API) or past the per-IP rate limit. The row itself is written in `after()`,
 * once the answer has gone.
 *
 * `proxy.ts` does not match this route (only `/api/orders` gets Clerk's
 * stamp), which is right: nothing here needs a session.
 */
import { NextResponse, after, userAgent, type NextRequest } from 'next/server';
import { db, queryFailureText, schema } from '@/db';
import {
  DEVICE_COOKIE,
  MAX_VISIT_BODY_BYTES,
  VISIT_COOKIE,
  deviceCookieOptions,
  isAutomatedAgent,
  pageViewFields,
  visitCookieOptions,
  visitorIds,
} from '@/lib/analytics/visitor';
import { dbConfigured } from '@/lib/env';
import { RATE_LIMITS, ipFromHeaders, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** The raw body, or `''` when it is too large to be a beacon or cannot be read. */
async function readBody(req: NextRequest): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VISIT_BODY_BYTES) return '';
  try {
    return await req.text();
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Kept when well-formed, minted otherwise (see `visitorIds`).
  const { deviceId, visitId } = visitorIds(
    req.cookies.get(DEVICE_COOKIE)?.value,
    req.cookies.get(VISIT_COOKIE)?.value,
  );

  // Both cookies go out on every answer: the device one to keep its 400
  // days rolling, the visit one because re-setting it IS the 30-minute idle
  // window.
  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  response.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions());
  response.cookies.set(VISIT_COOKIE, visitId, visitCookieOptions());

  if (!dbConfigured()) return response;
  if (!req.headers.get('user-agent')) return response;
  const ua = userAgent(req);
  if (ua.isBot || isAutomatedAgent(ua)) return response;
  // Our own beacon is same-origin; another site posting here would only be
  // inflating the figures.
  if (req.headers.get('sec-fetch-site') === 'cross-site') return response;
  if (!rateLimit('visit', ipFromHeaders(req.headers), RATE_LIMITS.visit)) return response;

  const fields = pageViewFields({
    body: await readBody(req),
    ua,
    ownHost: req.nextUrl.host,
    country: req.headers.get('x-vercel-ip-country'),
    city: req.headers.get('x-vercel-ip-city'),
  });
  if (!fields) return response;

  after(async () => {
    try {
      await db.insert(schema.pageViews).values({ deviceId, visitId, ...fields });
    } catch (err) {
      console.error(`[api/visit] insert failed: ${queryFailureText(err)}`);
    }
  });
  return response;
}
