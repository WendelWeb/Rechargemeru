/**
 * lib/analytics/queries.ts — the reads behind the back-office « Visites »:
 * how many people looked at the public site, on how many devices, how often
 * each device came back, and which of those devices went on to order.
 *
 * VOCABULARY, the same everywhere:
 * - a **page view** is one row of `page_views` (one page shown);
 * - a **visit** is one `visit_id` — the pages a browser saw without a
 *   half-hour pause (`rm_visit`, rolling 30 minutes);
 * - a **device** is one `device_id` — one browser on one phone or computer
 *   (`rm_device`, 400 days). Clearing cookies, a private window or a second
 *   browser each make a new device: the counts are an honest upper bound on
 *   people, not a head-count.
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
import { DEVICE_KINDS, type DeviceKind } from '@/lib/analytics/visitor';
import { dbConfigured } from '@/lib/env';
import { TIME_ZONE, startOfDayPortAuPrince } from '@/lib/format';

const { orders, pageViews } = schema;

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
};

export type CountStat = { key: string; count: number };

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
};

export type VisitsSnapshot = {
  dbReady: boolean;
  today: VisitSummary;
  yesterday: VisitSummary;
  /** The last 14 days, today included, oldest first. */
  daily: DailyVisits[];
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

export function zeroSummary(): VisitSummary {
  return { pageViews: 0, visits: 0, devices: 0, newDevices: 0, orderingDevices: 0 };
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
};
/** Live orders per device. */
export type DeviceOrders = { deviceId: string | null; orders: number; paidOrders: number };

/** Most visits first, then most recently seen, then the id — a stable order for equal devices. */
function compareDevices(a: DeviceStat, b: DeviceStat): number {
  return (
    b.visits - a.visits ||
    b.lastSeen.getTime() - a.lastSeen.getTime() ||
    (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0)
  );
}

/**
 * The devices table, assembled from the four reads. Only the ranked devices
 * come out (the other lists are looked up by id); a device missing from a
 * lookup — which would take a row written between two reads — still gets
 * sane values rather than disappearing.
 */
export function mergeDeviceStats(
  ranked: readonly RankedDevice[],
  history: readonly DeviceHistory[],
  latest: readonly DeviceLatest[],
  orderCounts: readonly DeviceOrders[],
): DeviceStat[] {
  const historyById = new Map(history.map((row) => [row.deviceId, row]));
  const latestById = new Map(latest.map((row) => [row.deviceId, row]));
  const ordersById = new Map(orderCounts.map((row) => [row.deviceId, row]));
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
      };
    })
    .sort(compareDevices);
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/** How many devices the table lists, and how many rows each « top » list keeps. */
const DEVICE_LIMIT = 50;
const TOP_LIMIT = 8;

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
 * The five headline figures of one window, in one statement. Written as raw
 * SQL with explicit aliases because « new devices » needs `page_views` twice
 * (this window, and anything earlier), which the query builder would render
 * with unqualified — and therefore ambiguous — column names.
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
      ) as ordering_devices
    from ${pageViews} pv
    where ${rawWindow(window, sql`pv.created_at`)}
  `);
  return {
    pageViews: toCount(row?.page_views),
    visits: toCount(row?.visits),
    devices: toCount(row?.devices),
    newDevices: toCount(row?.new_devices),
    orderingDevices: toCount(row?.ordering_devices),
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
 * ids only — their all-time history, their latest attributes and their
 * orders, the three in parallel. Two round trips whatever the table size.
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
  const [history, latest, orderCounts] = await Promise.all([
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
      })
      .from(pageViews)
      .where(inArray(pageViews.deviceId, ids))
      .orderBy(pageViews.deviceId, desc(pageViews.createdAt)),
    db
      .select({ deviceId: orders.deviceId, orders: count(), paidOrders: count(orders.paidAt) })
      .from(orders)
      .where(and(LIVE, inArray(orders.deviceId, ids)))
      .groupBy(orders.deviceId),
  ]);
  return mergeDeviceStats(ranked, history, latest, orderCounts);
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
  };
  if (!dbConfigured()) return empty;
  try {
    const [summary, previous, dailyRows, devices, pages, sources, countries, kinds] = await Promise.all([
      visitSummary(window),
      visitSummary(previousWindow(window)),
      dailyVisits({ from: startOfDayDaysAgo(at, days - 1), to: at }),
      topDevices(window),
      topPages(window),
      topSources(window),
      topCountries(window),
      deviceKinds(window),
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
