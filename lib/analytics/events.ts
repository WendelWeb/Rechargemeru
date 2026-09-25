/**
 * lib/analytics/events.ts — the pure half of the visitor journeys: how a batch
 * the browser sent to `POST /api/events` is cut down to the rows `site_events`
 * keeps.
 *
 * WHAT AN EVENT IS. Something a visitor did on a page, in six kinds:
 * - `click`    a button or link tapped (`name` is the site's own label for it);
 * - `step`     the order form reached a step (`details`, `confirm`…);
 * - `error`    a field was refused (`target` says which);
 * - `submit`   the order form was sent;
 * - `page_end` the page stayed on screen `value` active milliseconds — sent
 *              every time the tab goes to the background, each one the time
 *              added since the previous, so a page's time is their SUM;
 * - `scroll`   the page was scrolled down to `value` percent — its depth is
 *              the MAX.
 *
 * WHAT IS KEPT. `name` and `target` are labels the site's own code chose,
 * never something the visitor typed — still, both are trimmed, stripped of
 * control characters and cut short, because the body comes from a browser
 * and a browser can be anyone. The path goes through the same `sanitizePath`
 * as a page view (no query string, no back-office, no order reference), and
 * an event whose path is not one we record is dropped whole. Numbers are
 * whole and clamped to what the kind can mean.
 *
 * WHEN IT HAPPENED. The browser does not send its clock (a phone set to the
 * wrong day would scatter its events across the calendar) but each event's
 * AGE — how many milliseconds ago it happened when the batch left. The row
 * is dated `now − age`, on the server's clock; an age past ten minutes is
 * held at ten minutes, since a batch never waits that long.
 *
 * Everything here is total: whatever arrives, the answer is a clean list
 * (possibly empty), never an exception.
 */
import { isViewId, sanitizePath } from '@/lib/analytics/visitor';

export const EVENT_TYPES = ['click', 'step', 'error', 'submit', 'page_end', 'scroll'] as const;
export type SiteEventType = (typeof EVENT_TYPES)[number];

/** The kinds a journey lists one by one; `page_end` and `scroll` are measures of a page instead. */
export const JOURNEY_EVENT_TYPES = ['click', 'step', 'error', 'submit'] as const satisfies readonly SiteEventType[];

/** A batch body is a few kilobytes at most; anything past this is not ours and is not read. */
export const MAX_EVENTS_BODY_BYTES = 16_384;
/** Events kept from one batch — the browser sends at most this many at once. */
export const MAX_EVENTS_PER_BATCH = 50;

const MAX_NAME_LENGTH = 80;
const MAX_TARGET_LENGTH = 200;
/** How far back an event may be dated: ten minutes. */
export const MAX_EVENT_AGE_MS = 600_000;

/** `page_end`: active time on one page, capped at thirty minutes — past that, a tab was forgotten open. */
const MAX_PAGE_END_MS = 1_800_000;
/** `scroll`: a percentage. */
const MAX_SCROLL_PCT = 100;
/** Anything else: a count, bounded only so a forged value cannot overflow a Postgres `integer`. */
const MAX_OTHER_VALUE = 10_000_000;

/** One row of `site_events`, minus the two ids the route adds from the cookies. */
export type SanitizedEvent = {
  type: SiteEventType;
  name: string;
  target: string | null;
  value: number | null;
  path: string;
  viewId: string | null;
  createdAt: Date;
};

/** Control characters (C0, DEL, C1) and the line / paragraph separators that break a log line. */
const CONTROL_RE = /[\p{Cc}\u2028\u2029]/gu;

/**
 * Cut at `max` UTF-16 units without leaving half of a surrogate pair (an
 * emoji) at the end: a lone surrogate is not valid text for Postgres.
 */
function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = value.slice(0, max);
  const last = head.charCodeAt(head.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}

/** A label: control characters removed, trimmed, cut at `max`; `null` when nothing is left or it is not a string. */
function cleanLabel(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const clean = cut(raw.replace(CONTROL_RE, '').trim(), max).trim();
  return clean || null;
}

function isEventType(value: unknown): value is SiteEventType {
  return (EVENT_TYPES as readonly unknown[]).includes(value);
}

function valueCeiling(type: SiteEventType): number {
  if (type === 'page_end') return MAX_PAGE_END_MS;
  if (type === 'scroll') return MAX_SCROLL_PCT;
  return MAX_OTHER_VALUE;
}

/** A whole number within `[0, ceiling]`; `null` for anything that is not a finite number. */
function cleanValue(raw: unknown, type: SiteEventType): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(valueCeiling(type), Math.max(0, Math.round(raw)));
}

/** Milliseconds since the event happened, within `[0, 10 min]`; 0 when absent or unusable. */
function cleanAge(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(MAX_EVENT_AGE_MS, Math.max(0, Math.round(raw)));
}

/**
 * The batch's JSON body, read from raw text so a `text/plain` body (what
 * `navigator.sendBeacon` sends for a string) parses as well as
 * `application/json`. `null` for an empty, oversized or unparsable body.
 */
export function parseEventsBody(text: string): unknown {
  if (typeof text !== 'string' || !text || text.length > MAX_EVENTS_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The events array of a body `{ events: [...] }` — or the array itself; `[]` for anything else. */
function eventList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { events?: unknown }).events)) {
    return (raw as { events: unknown[] }).events;
  }
  return [];
}

/**
 * A batch reduced to the rows `site_events` keeps, in the order they came.
 * `raw` is the parsed body (`{ events: [...] }`, or the bare array); only its
 * first 50 entries are read. An entry is dropped when it is not an object,
 * its `type` is not one of `EVENT_TYPES`, its `name` is empty once cleaned,
 * or its `path` is not one we record; every other field that is malformed
 * becomes `null` (or, for the age, zero) rather than costing the event.
 */
export function sanitizeEvents(raw: unknown, now: Date): SanitizedEvent[] {
  const nowMs = now instanceof Date && Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const out: SanitizedEvent[] = [];
  for (const entry of eventList(raw).slice(0, MAX_EVENTS_PER_BATCH)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const event = entry as Record<string, unknown>;
    if (!isEventType(event.type)) continue;
    const name = cleanLabel(event.name, MAX_NAME_LENGTH);
    if (!name) continue;
    const path = sanitizePath(event.path);
    if (!path) continue;
    out.push({
      type: event.type,
      name,
      target: cleanLabel(event.target, MAX_TARGET_LENGTH),
      value: cleanValue(event.value, event.type),
      path,
      viewId: isViewId(event.viewId) ? event.viewId : null,
      createdAt: new Date(nowMs - cleanAge(event.age)),
    });
  }
  return out;
}
