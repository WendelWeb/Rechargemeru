/**
 * lib/analytics/queries.ts — the reads behind the back-office « Visites »:
 * how many people looked at the public site, on how many devices, how often
 * each device came back, how long they stayed, what they tapped, how far
 * down the order form they got, which of those devices went on to order —
 * and, for one device, each of its visits page by page (`deviceDetail`).
 *
 * VOCABULARY, the same everywhere:
 * - a **page view** is one row of `page_views` (one page shown);
 * - a **visit** is one `visit_id` — the pages a browser saw without a
 *   half-hour pause (`rm_visit`, rolling 30 minutes);
 * - a **device** is one `device_id` — one browser on one phone or computer
 *   (`rm_device`, 400 days). Clearing cookies, a private window or a second
 *   browser each make a new device: the counts are an honest upper bound on
 *   people, not a head-count;
 * - an **event** is one row of `site_events` — a tap, a form step, a refused
 *   field, the form sent, or a page's measures: `page_end` (active
 *   milliseconds on screen, several per page, to be SUMMED) and `scroll`
 *   (percent reached, to be MAXED);
 * - **active time** is always a sum of `page_end` values: of a page (its
 *   `view_id`), of a visit, of a device.
 *
 * DAYS ARE PORT-AU-PRINCE DAYS. A range starts at local midnight
 * (`startOfDayPortAuPrince`) and daily buckets are grouped on the local
 * calendar date, so the operator's « aujourd'hui » means what it says on
 * daylight-saving days too. Windows are half-open `[from, to)`.
 *
 * ORDERS ARE LIVE ORDERS. As in `lib/admin/queries.ts`, a sandbox order never
 * counts as a device « having ordered ».
 *
 * Reads never throw: without a database, or when a query fails, they answer
 * zeros and empty lists with `dbReady: false` (the day buckets are still all
 * there, at zero), so the page renders on a fresh deployment and during an
 * outage.
 */
import { and, asc, count, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db';
import { JOURNEY_EVENT_TYPES } from '@/lib/analytics/events';
import { DEVICE_KINDS, isDeviceId, type DeviceKind } from '@/lib/analytics/visitor';
import { dbConfigured } from '@/lib/env';
import { TIME_ZONE, startOfDayPortAuPrince } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders/types';

const { orders, pageViews, siteEvents } = schema;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type AnalyticsRange = 'today' | '7d' | '30d';

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ['today', '7d', '30d'];

const DEFAULT_RANGE: AnalyticsRange = '7d';

export type VisitSummary = {
  /** Rows in the window. */
  pageViews: number;
  /** Distinct `visit_id`. */
  visits: number;
  /** Distinct `device_id`. */
  devices: number;
  /** Devices whose very first page view (all time) falls in the window. */
  newDevices: number;
  /** Distinct `orders.device_id` among live orders created in the window. */
  orderingDevices: number;
  /** Σ `page_end` of the events in the window: milliseconds the site was actually on screen. */
  activeMs: number;
  /**
   * The average, over the visits with at least one `page_end` in the window,
   * of each one's Σ `page_end` — rounded; 0 when there is none.
   */
  avgVisitMs: number;
  /** Visits with exactly one page view in the window: they came, saw one page, left. */
  singlePageVisits: number;
};

/** One Port-au-Prince calendar day; `day` is `YYYY-MM-DD`. */
export type DailyVisits = { day: string; visits: number; devices: number; pageViews: number };

export type DeviceStat = {
  deviceId: string;
  /** Latest `device_label` seen. */
  label: string | null;
  /** Latest `device_kind` seen. */
  kind: 'mobile' | 'tablet' | 'desktop' | 'other';
  /** Distinct visits in the window. */
  visits: number;
  /** Page views in the window. */
  pageViews: number;
  /** Distinct visits, all time. */
  totalVisits: number;
  /** All time. */
  firstSeen: Date;
  /** All time. */
  lastSeen: Date;
  /** Latest seen. */
  country: string | null;
  /** Latest seen. */
  city: string | null;
  /** Live orders carrying this device id, all time. */
  orders: number;
  /** Of those, how many were paid (`paid_at` set). */
  paidOrders: number;
  /** Σ `page_end` of this device in the window, milliseconds. */
  activeMs: number;
  /** Path of its latest page view, all time. */
  lastPath: string | null;
};

export type CountStat = { key: string; count: number };

/** One button or link, by the name the site gave it. */
export type ClickStat = { name: string; count: number; visits: number };

/**
 * How far visits got, each figure a number of distinct visits in the window
 * except the last two: `orders` is the live orders created in the window and
 * `paid` those of them already paid. Each stage is counted on its own — a
 * visit that sent the form without a « details » step event (an old tab, a
 * lost batch) still counts as `submitted` — so the stages usually, but not
 * necessarily, shrink from left to right.
 */
export type JourneyFunnel = {
  /** Distinct visits with a page view in the window — the same figure as `summary.visits`. */
  visits: number;
  /** … that saw a home page, `/fr` or `/ht`. */
  sawHome: number;
  /** … with a `step` event named `details`. */
  reachedDetails: number;
  /** … with a `step` event named `confirm`. */
  reachedConfirm: number;
  /** … with a `submit` event. */
  submitted: number;
  /** Live orders created in the window from a measured device (`device_id` set). */
  orders: number;
  /** Of those, paid (`paid_at` set). */
  paid: number;
};

export type AnalyticsOverview = {
  dbReady: boolean;
  range: AnalyticsRange;
  from: Date;
  to: Date;
  summary: VisitSummary;
  /** The same-length window right before `from`. */
  previous: VisitSummary;
  /** 'today' → the last 7 days; '7d' → 7 days; '30d' → 30 days — ending today, oldest first, every day present. */
  daily: DailyVisits[];
  /** Top 50 in the window by visits, then most recently seen. */
  devices: DeviceStat[];
  /** Top 8 paths by page views. */
  pages: CountStat[];
  /** Top 8 referring hosts by visits (`'direct'` when none). */
  sources: CountStat[];
  /** Top 8 countries by devices (`'unknown'` when Vercel gave none). */
  countries: CountStat[];
  /** Devices per `device_kind`. */
  kinds: CountStat[];
  /** Top 12 `click` names in the window, by distinct visits, then taps. */
  clicks: ClickStat[];
  funnel: JourneyFunnel;
};

export type VisitsSnapshot = {
  dbReady: boolean;
  today: VisitSummary;
  yesterday: VisitSummary;
  /** The last 14 days, today included, oldest first. */
  daily: DailyVisits[];
};

/** One page of a visit. */
export type JourneyPage = {
  viewId: string | null;
  path: string;
  at: Date;
  /** Σ `page_end` with the same `view_id`; null when there is none (or the row has no `view_id`). */
  activeMs: number | null;
  /** Max `scroll` with the same `view_id`; null when there is none (or the row has no `view_id`). */
  scrollPct: number | null;
};

/** One thing done during a visit: a tap, a step, a refused field, the form sent. */
export type JourneyEvent = {
  type: string;
  name: string;
  target: string | null;
  value: number | null;
  path: string;
  at: Date;
};

export type VisitJourney = {
  visitId: string;
  /** First page view or event. */
  start: Date;
  /** Last page view or event. */
  end: Date;
  /** Σ `page_end` of the visit, milliseconds. */
  activeMs: number;
  /** `referrer_host` of its first page view. */
  referrer: string | null;
  /** `utm_source` of its first page view. */
  utm: string | null;
  /** Chronological. */
  pages: JourneyPage[];
  /** Chronological; `click`, `step`, `error` and `submit` only. */
  events: JourneyEvent[];
};

export type DeviceDetail = {
  device: {
    deviceId: string;
    /** Latest non-null. */
    label: string | null;
    /** Latest. */
    kind: 'mobile' | 'tablet' | 'desktop' | 'other';
    /** Latest non-null, like the four after it. */
    country: string | null;
    city: string | null;
    screen: string | null;
    net: string | null;
    lang: string | null;
    /** First page view or event, all time. */
    firstSeen: Date;
    /** Last page view or event, all time. */
    lastSeen: Date;
    /** Distinct visits with a page view or an event, all time. */
    visits: number;
    /** All time. */
    pageViews: number;
    /** Σ `page_end`, all time. */
    activeMs: number;
  };
  /** Live orders carrying this device id, newest first, at most 20. */
  orders: {
    id: string;
    reference: string;
    status: OrderStatus;
    usdCents: number;
    totalHtg: number;
    createdAt: Date;
  }[];
  /** Newest first (by start), at most 30, each with at most 300 events. */
  visits: VisitJourney[];
};

/* -------------------------------------------------------------------------- */
/* Ranges and day buckets (pure)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The `?range=` query parameter, first value, case-insensitive; anything
 * unknown (or absent) is the default week — never an exception, the value
 * comes straight from a URL.
 */
export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const candidate = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (ANALYTICS_RANGES as readonly string[]).includes(candidate) ? (candidate as AnalyticsRange) : DEFAULT_RANGE;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** How many Port-au-Prince days each range covers, today included. */
export const RANGE_DAYS: Readonly<Record<AnalyticsRange, number>> = { today: 1, '7d': 7, '30d': 30 };

/** How many day buckets the chart shows for a range: a single bar for « today » says nothing, so it gets the week. */
export function dailyDayCount(range: AnalyticsRange): number {
  return range === '30d' ? 30 : 7;
}

/** Day buckets in the dashboard snapshot. */
export const SNAPSHOT_DAYS = 14;

/**
 * Local midnight of the day `daysAgo` days before the one `now` falls in.
 *
 * Not `today − n × 24 h`: Haiti observes daylight saving, so a span holding a
 * clock change is an hour longer or shorter than that, and plain subtraction
 * lands at 23:00 or 01:00 — on the wrong day half the time. Going back n × 24 h
 * then forward 12 h always lands mid-day on the right calendar day, whose
 * midnight `startOfDayPortAuPrince` then finds.
 */
export function startOfDayDaysAgo(now: Date, daysAgo: number): Date {
  const today = startOfDayPortAuPrince(now);
  const n = Number.isFinite(daysAgo) ? Math.max(0, Math.floor(daysAgo)) : 0;
  if (n === 0) return today;
  return startOfDayPortAuPrince(new Date(today.getTime() - n * DAY_MS + 12 * HOUR_MS));
}

/** Half-open `[from, to)`. */
export type TimeWindow = { from: Date; to: Date };

/** 'today' → [start of today, now); '7d' → [start of the day 6 days ago, now); '30d' → [29 days ago, now). */
export function rangeWindow(range: AnalyticsRange, now: Date): TimeWindow {
  return { from: startOfDayDaysAgo(now, RANGE_DAYS[range] - 1), to: now };
}

/**
 * The comparison window: exactly as long as `window`, ending where it starts.
 * For « today » at 14:00 that is yesterday 10:00 → midnight — the same number
 * of hours, not the same hours of the clock.
 */
export function previousWindow(window: TimeWindow): TimeWindow {
  const length = Math.max(0, window.to.getTime() - window.from.getTime());
  return { from: new Date(window.from.getTime() - length), to: window.from };
}

/** The dashboard's three windows: today so far, all of yesterday, and the 14-day chart. */
export function snapshotWindows(now: Date): { today: TimeWindow; yesterday: TimeWindow; daily: TimeWindow } {
  const todayStart = startOfDayPortAuPrince(now);
  return {
    today: { from: todayStart, to: now },
    yesterday: { from: startOfDayDaysAgo(now, 1), to: todayStart },
    daily: { from: startOfDayDaysAgo(now, SNAPSHOT_DAYS - 1), to: now },
  };
}

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` of the Port-au-Prince calendar day an instant falls in — the same key the SQL `to_char` produces. */
export function dayKeyPortAuPrince(date: Date): string {
  const parts = dayKeyFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * The `count` local day keys ending with today's, oldest first. Pure
 * calendar arithmetic on the local date (no hours involved), so month ends,
 * leap days and clock changes need no special case.
 */
export function lastDayKeys(now: Date, count: number): string[] {
  const [year, month, day] = dayKeyPortAuPrince(now).split('-').map(Number);
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const keys: string[] = [];
  for (let back = total - 1; back >= 0; back--) {
    keys.push(new Date(Date.UTC(year, month - 1, day - back)).toISOString().slice(0, 10));
  }
  return keys;
}

/** One bucket per key, in the keys' order; a day without rows is a day at zero, and rows outside the keys are dropped. */
export function zeroFillDaily(keys: readonly string[], rows: readonly DailyVisits[]): DailyVisits[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return keys.map((day) => {
    const row = byDay.get(day);
    return { day, visits: row?.visits ?? 0, devices: row?.devices ?? 0, pageViews: row?.pageViews ?? 0 };
  });
}

/* -------------------------------------------------------------------------- */
/* Rows to values (pure)                                                      */
/* -------------------------------------------------------------------------- */

/** A Postgres `count` (a bigint, which the driver hands over as a string) as a non-negative integer. */
export function toCount(value: unknown): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' || typeof value === 'bigint' ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toDeviceKind(value: unknown): DeviceKind {
  return (DEVICE_KINDS as readonly unknown[]).includes(value) ? (value as DeviceKind) : 'other';
}

/**
 * A raw-SQL timestamp as a `Date`. `db.execute` hands `timestamptz` over as
 * Postgres text (« 2026-09-25 18:00:00.123+00 » — the driver's parser is off
 * so the query builder can map columns itself), which `new Date` reads with
 * its offset. `null` for anything that is not a valid instant.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A raw-SQL text column: the string, or `null` for SQL NULL (or anything that is not a string). */
export function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * A raw-SQL integer that may be NULL — an `integer` column (a number) or a
 * `sum` of one (a bigint, handed over as a string). `null` stays `null`.
 */
export function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n =
    typeof value === 'number' ? value : typeof value === 'string' || typeof value === 'bigint' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function zeroSummary(): VisitSummary {
  return {
    pageViews: 0,
    visits: 0,
    devices: 0,
    newDevices: 0,
    orderingDevices: 0,
    activeMs: 0,
    avgVisitMs: 0,
    singlePageVisits: 0,
  };
}

export function zeroFunnel(): JourneyFunnel {
  return { visits: 0, sawHome: 0, reachedDetails: 0, reachedConfirm: 0, submitted: 0, orders: 0, paid: 0 };
}

/** One device's figures in the window (the ranked query). */
export type RankedDevice = { deviceId: string; visits: number; pageViews: number; lastInRange: Date | null };
/** One device's all-time figures. */
export type DeviceHistory = { deviceId: string; totalVisits: number; firstSeen: Date | null; lastSeen: Date | null };
/** One device's most recent row. */
export type DeviceLatest = {
  deviceId: string;
  label: string | null;
  kind: string | null;
  country: string | null;
  city: string | null;
  path: string | null;
};
/** Live orders per device. */
export type DeviceOrders = { deviceId: string | null; orders: number; paidOrders: number };
/** Σ `page_end` per device in the window. */
export type DeviceActive = { deviceId: string; activeMs: number };

/** Most visits first, then most recently seen, then the id — a stable order for equal devices. */
function compareDevices(a: DeviceStat, b: DeviceStat): number {
  return (
    b.visits - a.visits ||
    b.lastSeen.getTime() - a.lastSeen.getTime() ||
    (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0)
  );
}

/**
 * The devices table, assembled from the five reads. Only the ranked devices
 * come out (the other lists are looked up by id); a device missing from a
 * lookup — which would take a row written between two reads, or a device
 * with no `page_end` in the window — still gets sane values rather than
 * disappearing.
 */
export function mergeDeviceStats(
  ranked: readonly RankedDevice[],
  history: readonly DeviceHistory[],
  latest: readonly DeviceLatest[],
  orderCounts: readonly DeviceOrders[],
  activeTimes: readonly DeviceActive[] = [],
): DeviceStat[] {
  const historyById = new Map(history.map((row) => [row.deviceId, row]));
  const latestById = new Map(latest.map((row) => [row.deviceId, row]));
  const ordersById = new Map(orderCounts.map((row) => [row.deviceId, row]));
  const activeById = new Map(activeTimes.map((row) => [row.deviceId, row.activeMs]));
  return ranked
    .map((row): DeviceStat => {
      const past = historyById.get(row.deviceId);
      const last = latestById.get(row.deviceId);
      const placed = ordersById.get(row.deviceId);
      const lastSeen = past?.lastSeen ?? row.lastInRange ?? new Date(0);
      return {
        deviceId: row.deviceId,
        label: last?.label ?? null,
        kind: toDeviceKind(last?.kind),
        visits: row.visits,
        pageViews: row.pageViews,
        // All time can never be fewer than in the window.
        totalVisits: Math.max(past?.totalVisits ?? 0, row.visits),
        firstSeen: past?.firstSeen ?? row.lastInRange ?? lastSeen,
        lastSeen,
        country: last?.country ?? null,
        city: last?.city ?? null,
        orders: placed?.orders ?? 0,
        paidOrders: placed?.paidOrders ?? 0,
        activeMs: activeById.get(row.deviceId) ?? 0,
        lastPath: last?.path ?? null,
      };
    })
    .sort(compareDevices);
}

/* -------------------------------------------------------------------------- */
/* One device's journeys (pure)                                               */
/* -------------------------------------------------------------------------- */

/** How many visits a device's page shows, and how many events (and pages) each keeps. */
export const JOURNEY_VISIT_LIMIT = 30;
export const JOURNEY_EVENT_LIMIT = 300;
/** How many of the device's orders are listed. */
export const DEVICE_ORDER_LIMIT = 20;

/** When a visit happened: its first and last row, page view or event. */
export type VisitSpan = { visitId: string; start: Date; end: Date };
/** One `page_views` row of the device. */
export type JourneyPageRow = {
  visitId: string;
  viewId: string | null;
  path: string;
  at: Date;
  referrerHost: string | null;
  utmSource: string | null;
};
/** One `site_events` row the journey lists (`click`, `step`, `error`, `submit`). */
export type JourneyEventRow = JourneyEvent & { visitId: string };
/**
 * A page measure: one `page_end` or `scroll` row — or several of them already
 * folded by SQL (the `page_end` summed, the `scroll` maxed), which fold the
 * same way again.
 */
export type JourneyMeasureRow = { visitId: string; viewId: string | null; type: string; value: number | null };

const JOURNEY_TYPES: ReadonlySet<string> = new Set(JOURNEY_EVENT_TYPES);

function byTime<T extends { at: Date }>(a: T, b: T): number {
  return a.at.getTime() - b.at.getTime();
}

function groupByVisit<T extends { visitId: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.visitId);
    if (group) group.push(row);
    else groups.set(row.visitId, [row]);
  }
  return groups;
}

/**
 * A device's visits, assembled from four reads: `spans` says which visits
 * and when, and every other row is filed under its visit — a row whose visit
 * is not among the spans (written between two reads) is left out.
 *
 * - Pages and events come out chronological (a stable sort, so rows of the
 *   same instant keep the order SQL gave them); events are only the four
 *   kinds a journey lists, at most 300 per visit — the first 300.
 * - A page's `activeMs` is the SUM of the `page_end` values carrying its
 *   `view_id` (the browser sends one each time the tab is hidden, each the
 *   time added since the last) and its `scrollPct` the MAX of the `scroll`
 *   values; both `null` when there is none, and always `null` for a page
 *   without a `view_id`. Measures are matched on the `view_id` alone, not the
 *   visit: a page left open past the half-hour idle window sends its last
 *   `page_end` under the next visit id, and it is still that page's time.
 * - A visit's `activeMs` is the sum of the `page_end` values filed under
 *   that visit, `view_id` or not; `referrer` and `utm` are those of its first
 *   page; `start` and `end` are the span's, widened to any row outside it.
 * - Newest first — latest start, then latest end, then the id — and at most
 *   30.
 */
export function assembleJourneys(input: {
  spans: readonly VisitSpan[];
  pages: readonly JourneyPageRow[];
  events: readonly JourneyEventRow[];
  measures: readonly JourneyMeasureRow[];
}): VisitJourney[] {
  const visitActive = new Map<string, number>();
  const viewActive = new Map<string, number>();
  const viewScroll = new Map<string, number>();
  for (const measure of input.measures) {
    const value = measure.value;
    if (value === null || !Number.isFinite(value)) continue;
    if (measure.type === 'page_end') {
      visitActive.set(measure.visitId, (visitActive.get(measure.visitId) ?? 0) + value);
      if (measure.viewId) viewActive.set(measure.viewId, (viewActive.get(measure.viewId) ?? 0) + value);
    } else if (measure.type === 'scroll' && measure.viewId) {
      const deepest = viewScroll.get(measure.viewId);
      viewScroll.set(measure.viewId, deepest === undefined ? value : Math.max(deepest, value));
    }
  }

  const pagesByVisit = groupByVisit(input.pages);
  const eventsByVisit = groupByVisit(input.events.filter((event) => JOURNEY_TYPES.has(event.type)));

  const done = new Set<string>();
  const journeys: VisitJourney[] = [];
  for (const span of input.spans) {
    if (done.has(span.visitId)) continue;
    done.add(span.visitId);
    const pages = [...(pagesByVisit.get(span.visitId) ?? [])].sort(byTime);
    const events = [...(eventsByVisit.get(span.visitId) ?? [])].sort(byTime).slice(0, JOURNEY_EVENT_LIMIT);
    const times = [span.start, span.end, ...pages.map((page) => page.at), ...events.map((event) => event.at)]
      .map((date) => date.getTime())
      .filter((time) => Number.isFinite(time));
    const first = pages[0];
    journeys.push({
      visitId: span.visitId,
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times)),
      activeMs: visitActive.get(span.visitId) ?? 0,
      referrer: first?.referrerHost ?? null,
      utm: first?.utmSource ?? null,
      pages: pages.map((page) => ({
        viewId: page.viewId,
        path: page.path,
        at: page.at,
        activeMs: page.viewId ? (viewActive.get(page.viewId) ?? null) : null,
        scrollPct: page.viewId ? (viewScroll.get(page.viewId) ?? null) : null,
      })),
      events: events.map((event) => ({
        type: event.type,
        name: event.name,
        target: event.target,
        value: event.value,
        path: event.path,
        at: event.at,
      })),
    });
  }
  return journeys
    .sort(
      (a, b) =>
        b.start.getTime() - a.start.getTime() ||
        b.end.getTime() - a.end.getTime() ||
        (a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0),
    )
    .slice(0, JOURNEY_VISIT_LIMIT);
}

/**
 * The « who is this » card of a device, from its one facts row (raw SQL, see
 * `deviceFacts`): `null` when the device has neither a page view nor an
 * event — an id nobody ever sent.
 */
export function deviceFromRow(
  deviceId: string,
  row: Record<string, unknown> | undefined,
): DeviceDetail['device'] | null {
  if (!row) return null;
  const firstSeen = toDate(row.first_seen);
  const lastSeen = toDate(row.last_seen);
  if (!firstSeen || !lastSeen) return null;
  return {
    deviceId,
    label: toText(row.label),
    kind: toDeviceKind(row.kind),
    country: toText(row.country),
    city: toText(row.city),
    screen: toText(row.screen),
    net: toText(row.net),
    lang: toText(row.lang),
    firstSeen,
    lastSeen,
    visits: toCount(row.visits),
    pageViews: toCount(row.page_views),
    activeMs: toCount(row.active_ms),
  };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/** How many devices the table lists, and how many rows each « top » list keeps. */
const DEVICE_LIMIT = 50;
const TOP_LIMIT = 8;
/** How many buttons the « clicks » list keeps. */
const CLICK_LIMIT = 12;

/**
 * The funnel's landmarks: the two home pages, and the `step` names the order
 * form reports when the visitor reaches its details and its confirmation.
 * Constants of ours, inlined as literals like `ZONE`.
 */
const HOME_PATHS = sql.raw(`('/fr', '/ht')`);
const STEP_DETAILS = sql.raw(`'details'`);
const STEP_CONFIRM = sql.raw(`'confirm'`);

/** Live orders only: a sandbox payment is never a customer. */
const LIVE = eq(orders.mode, 'live');

/**
 * The zone as an SQL literal. It is a constant of ours, never input, and
 * inlining it keeps `to_char(… at time zone '…')` one identical expression
 * wherever it appears (a bound parameter would not be).
 */
const ZONE = sql.raw(`'${TIME_ZONE.replace(/'/g, "''")}'`);

/**
 * drizzle's own message is « Failed query: … params: … », and the parameters
 * include device ids — cookie values. The driver's cause says what went
 * wrong without them.
 */
function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (err.cause instanceof Error && err.cause.message) return err.cause.message;
  if (err.message && !err.message.startsWith('Failed query')) return err.message;
  return 'query failed';
}

function timestamp(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

/** `[from, to)` on `created_at` of `page_views`, for the query builder. */
function inWindow(window: TimeWindow): SQL | undefined {
  return and(gte(pageViews.createdAt, window.from), lt(pageViews.createdAt, window.to));
}

/** `[from, to)` on a raw `created_at` column (optionally table-qualified), for raw SQL. */
function rawWindow(window: TimeWindow, column: SQL = sql`created_at`): SQL {
  return sql`${column} >= ${timestamp(window.from)} and ${column} < ${timestamp(window.to)}`;
}

type RawRow = Record<string, unknown>;

async function rawRows(query: SQL): Promise<RawRow[]> {
  const result = await db.execute<RawRow>(query);
  return result.rows;
}

/**
 * The headline figures of one window, in one statement. Written as raw SQL
 * with explicit aliases because « new devices » needs `page_views` twice
 * (this window, and anything earlier), which the query builder would render
 * with unqualified — and therefore ambiguous — column names.
 *
 * The time figures read `page_end` events of the window: `active_ms` is
 * their sum, `avg_visit_ms` the average of their per-visit sums (`avg`
 * skips a visit whose only `page_end` values are NULL, so « visits with at
 * least one » holds).
 */
async function visitSummary(window: TimeWindow): Promise<VisitSummary> {
  const [row] = await rawRows(sql`
    select
      count(*) as page_views,
      count(distinct pv.visit_id) as visits,
      count(distinct pv.device_id) as devices,
      count(distinct pv.device_id) filter (
        where not exists (
          select 1 from ${pageViews} earlier
          where earlier.device_id = pv.device_id
            and earlier.created_at < ${timestamp(window.from)}
        )
      ) as new_devices,
      (
        select count(distinct o.device_id)
        from ${orders} o
        where o.mode = 'live'
          and o.device_id is not null
          and ${rawWindow(window, sql`o.created_at`)}
      ) as ordering_devices,
      (
        select count(*)
        from (
          select 1
          from ${pageViews} one_view
          where ${rawWindow(window, sql`one_view.created_at`)}
          group by one_view.visit_id
          having count(*) = 1
        ) singles
      ) as single_page_visits,
      (
        select coalesce(sum(se.value), 0)
        from ${siteEvents} se
        where se.type = 'page_end'
          and ${rawWindow(window, sql`se.created_at`)}
      ) as active_ms,
      (
        select coalesce(round(avg(per_visit.total)), 0)
        from (
          select sum(se.value) as total
          from ${siteEvents} se
          where se.type = 'page_end'
            and ${rawWindow(window, sql`se.created_at`)}
          group by se.visit_id
        ) per_visit
      ) as avg_visit_ms
    from ${pageViews} pv
    where ${rawWindow(window, sql`pv.created_at`)}
  `);
  return {
    pageViews: toCount(row?.page_views),
    visits: toCount(row?.visits),
    devices: toCount(row?.devices),
    newDevices: toCount(row?.new_devices),
    orderingDevices: toCount(row?.ordering_devices),
    activeMs: toCount(row?.active_ms),
    avgVisitMs: toCount(row?.avg_visit_ms),
    singlePageVisits: toCount(row?.single_page_visits),
  };
}

/** Visits, devices and page views per local day, only for days that have rows (the caller zero-fills). */
async function dailyVisits(window: TimeWindow): Promise<DailyVisits[]> {
  const rows = await rawRows(sql`
    select
      to_char(created_at at time zone ${ZONE}, 'YYYY-MM-DD') as day,
      count(distinct visit_id) as visits,
      count(distinct device_id) as devices,
      count(*) as page_views
    from ${pageViews}
    where ${rawWindow(window)}
    group by 1
  `);
  return rows.map((row) => ({
    day: String(row.day ?? ''),
    visits: toCount(row.visits),
    devices: toCount(row.devices),
    pageViews: toCount(row.page_views),
  }));
}

/**
 * The devices table: the top devices of the window first, then — for those
 * ids only — their all-time history, their latest attributes (and path),
 * their orders and their active time in the window, the four in parallel.
 * Two round trips whatever the table size.
 */
async function topDevices(window: TimeWindow): Promise<DeviceStat[]> {
  const ranked: RankedDevice[] = await db
    .select({
      deviceId: pageViews.deviceId,
      visits: sql<number>`count(distinct ${pageViews.visitId})`.mapWith(Number),
      pageViews: count(),
      lastInRange: sql<Date | null>`max(${pageViews.createdAt})`.mapWith(pageViews.createdAt),
    })
    .from(pageViews)
    .where(inWindow(window))
    .groupBy(pageViews.deviceId)
    .orderBy(
      desc(sql`count(distinct ${pageViews.visitId})`),
      desc(sql`max(${pageViews.createdAt})`),
      asc(pageViews.deviceId),
    )
    .limit(DEVICE_LIMIT);
  if (ranked.length === 0) return [];

  const ids = ranked.map((row) => row.deviceId);
  const [history, latest, orderCounts, activeTimes] = await Promise.all([
    db
      .select({
        deviceId: pageViews.deviceId,
        totalVisits: sql<number>`count(distinct ${pageViews.visitId})`.mapWith(Number),
        firstSeen: sql<Date | null>`min(${pageViews.createdAt})`.mapWith(pageViews.createdAt),
        lastSeen: sql<Date | null>`max(${pageViews.createdAt})`.mapWith(pageViews.createdAt),
      })
      .from(pageViews)
      .where(inArray(pageViews.deviceId, ids))
      .groupBy(pageViews.deviceId),
    // `distinct on` keeps the first row of each device in this order: its newest.
    db
      .selectDistinctOn([pageViews.deviceId], {
        deviceId: pageViews.deviceId,
        label: pageViews.deviceLabel,
        kind: pageViews.deviceKind,
        country: pageViews.country,
        city: pageViews.city,
        path: pageViews.path,
      })
      .from(pageViews)
      .where(inArray(pageViews.deviceId, ids))
      .orderBy(pageViews.deviceId, desc(pageViews.createdAt)),
    db
      .select({ deviceId: orders.deviceId, orders: count(), paidOrders: count(orders.paidAt) })
      .from(orders)
      .where(and(LIVE, inArray(orders.deviceId, ids)))
      .groupBy(orders.deviceId),
    // `sum` of an integer is a bigint, which the driver hands over as a string.
    db
      .select({
        deviceId: siteEvents.deviceId,
        activeMs: sql<number>`coalesce(sum(${siteEvents.value}), 0)`.mapWith(toCount),
      })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.type, 'page_end'),
          inArray(siteEvents.deviceId, ids),
          gte(siteEvents.createdAt, window.from),
          lt(siteEvents.createdAt, window.to),
        ),
      )
      .groupBy(siteEvents.deviceId),
  ]);
  return mergeDeviceStats(ranked, history, latest, orderCounts, activeTimes);
}

/** The buttons tapped most in the window: by distinct visits first (twelve taps by one visitor are one person), then taps. */
async function topClicks(window: TimeWindow): Promise<ClickStat[]> {
  const rows = await rawRows(sql`
    select name, count(*) as taps, count(distinct visit_id) as visits
    from ${siteEvents}
    where type = 'click'
      and ${rawWindow(window)}
    group by name
    order by 3 desc, 2 desc, 1 asc
    limit ${CLICK_LIMIT}
  `);
  return rows.map((row) => ({ name: String(row.name ?? ''), count: toCount(row.taps), visits: toCount(row.visits) }));
}

/**
 * The funnel of one window, in one statement: one pass over each of the
 * three tables. Every stage counts distinct visits except the orders (see
 * `JourneyFunnel`).
 */
async function journeyFunnel(window: TimeWindow): Promise<JourneyFunnel> {
  const [row] = await rawRows(sql`
    select
      pv.visits, pv.saw_home,
      se.reached_details, se.reached_confirm, se.submitted,
      o.orders, o.paid
    from (
      select
        count(distinct visit_id) as visits,
        count(distinct visit_id) filter (where path in ${HOME_PATHS}) as saw_home
      from ${pageViews}
      where ${rawWindow(window)}
    ) pv
    cross join (
      select
        count(distinct visit_id) filter (where type = 'step' and name = ${STEP_DETAILS}) as reached_details,
        count(distinct visit_id) filter (where type = 'step' and name = ${STEP_CONFIRM}) as reached_confirm,
        count(distinct visit_id) filter (where type = 'submit') as submitted
      from ${siteEvents}
      where type in ('step', 'submit')
        and ${rawWindow(window)}
    ) se
    cross join (
      -- Only orders placed from a measured device: the funnel compares
      -- visits with the orders those visits produced. Orders from before
      -- the measurements (no device id) would inflate the last steps.
      select count(*) as orders, count(paid_at) as paid
      from ${orders}
      where mode = 'live'
        and device_id is not null
        and ${rawWindow(window)}
    ) o
  `);
  return {
    visits: toCount(row?.visits),
    sawHome: toCount(row?.saw_home),
    reachedDetails: toCount(row?.reached_details),
    reachedConfirm: toCount(row?.reached_confirm),
    submitted: toCount(row?.submitted),
    orders: toCount(row?.orders),
    paid: toCount(row?.paid),
  };
}

async function countStats(query: SQL): Promise<CountStat[]> {
  const rows = await rawRows(query);
  return rows.map((row) => ({ key: String(row.key ?? ''), count: toCount(row.count) }));
}

/** Most viewed paths. */
function topPages(window: TimeWindow): Promise<CountStat[]> {
  return countStats(sql`
    select path as "key", count(*) as "count"
    from ${pageViews}
    where ${rawWindow(window)}
    group by 1
    order by 2 desc, 1 asc
    limit ${TOP_LIMIT}
  `);
}

/**
 * Where visits come from. A visit is credited to the referrer of its FIRST
 * page in the window: the pages after it were reached from our own site and
 * carry no referrer, and counting them would file every multi-page visit
 * under « direct » as well. Each visit therefore counts exactly once, and the
 * sources add up to the visits.
 */
function topSources(window: TimeWindow): Promise<CountStat[]> {
  return countStats(sql`
    select coalesce(firsts.referrer_host, 'direct') as "key", count(*) as "count"
    from (
      select distinct on (visit_id) visit_id, referrer_host
      from ${pageViews}
      where ${rawWindow(window)}
      order by visit_id, created_at asc
    ) firsts
    group by 1
    order by 2 desc, 1 asc
    limit ${TOP_LIMIT}
  `);
}

/** Devices per country (a device seen from two countries counts in both). */
function topCountries(window: TimeWindow): Promise<CountStat[]> {
  return countStats(sql`
    select coalesce(country, 'unknown') as "key", count(distinct device_id) as "count"
    from ${pageViews}
    where ${rawWindow(window)}
    group by 1
    order by 2 desc, 1 asc
    limit ${TOP_LIMIT}
  `);
}

/** Devices per kind: phones, tablets, computers, other. */
function deviceKinds(window: TimeWindow): Promise<CountStat[]> {
  return countStats(sql`
    select device_kind as "key", count(distinct device_id) as "count"
    from ${pageViews}
    where ${rawWindow(window)}
    group by 1
    order by 2 desc, 1 asc
  `);
}

/** A usable « now »: an invalid date would otherwise surface as a RangeError from the day keys. */
function safeNow(now: Date): Date {
  return now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
}

/**
 * Everything the « Visites » page shows for one range, in two rounds of
 * parallel queries (the second only for the devices table). Never throws.
 */
export async function analyticsOverview(range: AnalyticsRange, now: Date = new Date()): Promise<AnalyticsOverview> {
  const at = safeNow(now);
  const safeRange = ANALYTICS_RANGES.includes(range) ? range : DEFAULT_RANGE;
  const window = rangeWindow(safeRange, at);
  const days = dailyDayCount(safeRange);
  const keys = lastDayKeys(at, days);
  const empty: AnalyticsOverview = {
    dbReady: false,
    range: safeRange,
    from: window.from,
    to: window.to,
    summary: zeroSummary(),
    previous: zeroSummary(),
    daily: zeroFillDaily(keys, []),
    devices: [],
    pages: [],
    sources: [],
    countries: [],
    kinds: [],
    clicks: [],
    funnel: zeroFunnel(),
  };
  if (!dbConfigured()) return empty;
  try {
    const [summary, previous, dailyRows, devices, pages, sources, countries, kinds, clicks, funnel] = await Promise.all([
      visitSummary(window),
      visitSummary(previousWindow(window)),
      dailyVisits({ from: startOfDayDaysAgo(at, days - 1), to: at }),
      topDevices(window),
      topPages(window),
      topSources(window),
      topCountries(window),
      deviceKinds(window),
      topClicks(window),
      journeyFunnel(window),
    ]);
    return {
      dbReady: true,
      range: safeRange,
      from: window.from,
      to: window.to,
      summary,
      previous,
      daily: zeroFillDaily(keys, dailyRows),
      devices,
      pages,
      sources,
      countries,
      kinds,
      clicks,
      funnel,
    };
  } catch (err) {
    console.error(`[analytics/queries] analyticsOverview failed: ${errorText(err)}`);
    return empty;
  }
}

/** The dashboard's small « Visites » card: today, yesterday and 14 days of bars. Never throws. */
export async function visitsSnapshot(now: Date = new Date()): Promise<VisitsSnapshot> {
  const at = safeNow(now);
  const windows = snapshotWindows(at);
  const keys = lastDayKeys(at, SNAPSHOT_DAYS);
  const empty: VisitsSnapshot = {
    dbReady: false,
    today: zeroSummary(),
    yesterday: zeroSummary(),
    daily: zeroFillDaily(keys, []),
  };
  if (!dbConfigured()) return empty;
  try {
    const [today, yesterday, dailyRows] = await Promise.all([
      visitSummary(windows.today),
      visitSummary(windows.yesterday),
      dailyVisits(windows.daily),
    ]);
    return { dbReady: true, today, yesterday, daily: zeroFillDaily(keys, dailyRows) };
  } catch (err) {
    console.error(`[analytics/queries] visitsSnapshot failed: ${errorText(err)}`);
    return empty;
  }
}

/* -------------------------------------------------------------------------- */
/* One device                                                                 */
/* -------------------------------------------------------------------------- */

/** Every visit id of the device, from both tables, with its first and last row. */
function deviceRows(deviceId: string): SQL {
  return sql`(
    select visit_id, created_at from ${pageViews} where device_id = ${deviceId}
    union all
    select visit_id, created_at from ${siteEvents} where device_id = ${deviceId}
  )`;
}

/**
 * The device's 30 latest visits, by start (then id, so that every query
 * computing it picks the very same 30). Reused as a subquery by the pages,
 * events and measures reads, which lets all of them go out in one round.
 */
function recentVisitIds(deviceId: string): SQL {
  return sql`(
    select seen.visit_id
    from ${deviceRows(deviceId)} seen
    group by seen.visit_id
    order by min(seen.created_at) desc, seen.visit_id asc
    limit ${JOURNEY_VISIT_LIMIT}
  )`;
}

/**
 * Everything the device card says, in one row: its page views (count, and
 * the latest non-null of each attribute — `array_agg … filter … [1]`), its
 * events (first and last, Σ `page_end`), and its visits across both tables.
 * An aggregate without `group by` always answers one row, all NULL / zero
 * for an id never seen.
 */
function deviceFacts(deviceId: string): Promise<RawRow[]> {
  const latest = (column: string) =>
    sql.raw(`(array_agg(${column} order by created_at desc) filter (where ${column} is not null))[1]`);
  return rawRows(sql`
    select
      pv.page_views, pv.label, pv.kind, pv.country, pv.city, pv.screen, pv.net, pv.lang,
      least(pv.first_seen, se.first_seen) as first_seen,
      greatest(pv.last_seen, se.last_seen) as last_seen,
      se.active_ms,
      (select count(distinct seen.visit_id) from ${deviceRows(deviceId)} seen) as visits
    from (
      select
        count(*) as page_views,
        min(created_at) as first_seen,
        max(created_at) as last_seen,
        ${latest('device_label')} as label,
        (array_agg(device_kind order by created_at desc))[1] as kind,
        ${latest('country')} as country,
        ${latest('city')} as city,
        ${latest('screen')} as screen,
        ${latest('net')} as net,
        ${latest('lang')} as lang
      from ${pageViews}
      where device_id = ${deviceId}
    ) pv
    cross join (
      select
        min(created_at) as first_seen,
        max(created_at) as last_seen,
        coalesce(sum(value) filter (where type = 'page_end'), 0) as active_ms
      from ${siteEvents}
      where device_id = ${deviceId}
    ) se
  `);
}

async function deviceSpans(deviceId: string): Promise<VisitSpan[]> {
  const rows = await rawRows(sql`
    select seen.visit_id, min(seen.created_at) as first_at, max(seen.created_at) as last_at
    from ${deviceRows(deviceId)} seen
    group by seen.visit_id
    order by min(seen.created_at) desc, seen.visit_id asc
    limit ${JOURNEY_VISIT_LIMIT}
  `);
  return rows.flatMap((row) => {
    const visitId = toText(row.visit_id);
    const start = toDate(row.first_at);
    const end = toDate(row.last_at);
    return visitId && start && end ? [{ visitId, start, end }] : [];
  });
}

/** The page views of the recent visits — at most the first 300 of each, a bound no person reaches. */
async function devicePages(deviceId: string): Promise<JourneyPageRow[]> {
  const rows = await rawRows(sql`
    select visit_id, view_id, path, referrer_host, utm_source, created_at
    from (
      select
        visit_id, view_id, path, referrer_host, utm_source, created_at,
        row_number() over (partition by visit_id order by created_at asc, id asc) as seq
      from ${pageViews}
      where device_id = ${deviceId}
        and visit_id in ${recentVisitIds(deviceId)}
    ) numbered
    where seq <= ${JOURNEY_EVENT_LIMIT}
    order by visit_id, seq
  `);
  return rows.flatMap((row) => {
    const visitId = toText(row.visit_id);
    const path = toText(row.path);
    const at = toDate(row.created_at);
    if (!visitId || !path || !at) return [];
    return [
      {
        visitId,
        viewId: toText(row.view_id),
        path,
        at,
        referrerHost: toText(row.referrer_host),
        utmSource: toText(row.utm_source),
      },
    ];
  });
}

/** The listed events of the recent visits (`click`, `step`, `error`, `submit`) — the first 300 of each. */
async function deviceEvents(deviceId: string): Promise<JourneyEventRow[]> {
  const types = sql.join(
    JOURNEY_EVENT_TYPES.map((type) => sql`${type}`),
    sql`, `,
  );
  const rows = await rawRows(sql`
    select visit_id, type, name, target, value, path, created_at
    from (
      select
        visit_id, type, name, target, value, path, created_at,
        row_number() over (partition by visit_id order by created_at asc, id asc) as seq
      from ${siteEvents}
      where device_id = ${deviceId}
        and type in (${types})
        and visit_id in ${recentVisitIds(deviceId)}
    ) numbered
    where seq <= ${JOURNEY_EVENT_LIMIT}
    order by visit_id, seq
  `);
  return rows.flatMap((row) => {
    const visitId = toText(row.visit_id);
    const type = toText(row.type);
    const name = toText(row.name);
    const path = toText(row.path);
    const at = toDate(row.created_at);
    if (!visitId || !type || !name || !path || !at) return [];
    return [{ visitId, type, name, target: toText(row.target), value: toNullableInt(row.value), path, at }];
  });
}

/**
 * The page measures of the recent visits, already folded per (visit, view,
 * kind) — `page_end` summed, `scroll` maxed — so a long visit costs a
 * handful of rows; `assembleJourneys` folds them the same way again.
 */
async function deviceMeasures(deviceId: string): Promise<JourneyMeasureRow[]> {
  const rows = await rawRows(sql`
    select
      visit_id, view_id, type,
      case when type = 'page_end' then sum(value) else max(value) end as value
    from ${siteEvents}
    where device_id = ${deviceId}
      and type in ('page_end', 'scroll')
      and visit_id in ${recentVisitIds(deviceId)}
    group by visit_id, view_id, type
  `);
  return rows.flatMap((row) => {
    const visitId = toText(row.visit_id);
    const type = toText(row.type);
    if (!visitId || !type) return [];
    return [{ visitId, viewId: toText(row.view_id), type, value: toNullableInt(row.value) }];
  });
}

function deviceOrders(deviceId: string): Promise<DeviceDetail['orders']> {
  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      usdCents: orders.usdCents,
      totalHtg: orders.totalHtg,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(LIVE, eq(orders.deviceId, deviceId)))
    .orderBy(desc(orders.createdAt))
    .limit(DEVICE_ORDER_LIMIT);
}

/**
 * One device, in full: who it is, what it ordered, and its 30 latest visits
 * page by page and tap by tap. Six reads in one parallel round (the recent
 * visits are a shared subquery, not a first round). `null` for an id that is
 * not a UUID, a device never seen, no database, or a failed read — never an
 * exception.
 */
export async function deviceDetail(deviceId: string): Promise<DeviceDetail | null> {
  if (!isDeviceId(deviceId)) return null;
  if (!dbConfigured()) return null;
  // Stored lower-cased (see `visitorIds`).
  const id = deviceId.toLowerCase();
  try {
    const [facts, spans, pages, events, measures, placed] = await Promise.all([
      deviceFacts(id),
      deviceSpans(id),
      devicePages(id),
      deviceEvents(id),
      deviceMeasures(id),
      deviceOrders(id),
    ]);
    const device = deviceFromRow(id, facts[0]);
    if (!device) return null;
    return { device, orders: placed, visits: assembleJourneys({ spans, pages, events, measures }) };
  } catch (err) {
    console.error(`[analytics/queries] deviceDetail failed: ${errorText(err)}`);
    return null;
  }
}
