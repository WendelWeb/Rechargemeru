/**
 * lib/admin/queries.ts — the reads the back-office needs and nothing else.
 *
 * Two rules run through this file:
 * - **Sandbox orders never count.** Every total, every average, every
 *   « à recharger » figure filters on `mode = 'live'`, so a test payment can
 *   never make the operator believe real gourdes came in.
 * - **Only money that actually moved counts.** Gourdes come from
 *   `paid_htg` (what the provider says it received), dollars from
 *   `fulfilled_usd_cents` (what the operator says was sent) — never from the
 *   quote, which is only a promise.
 *
 * Reads never throw and answer zeros / empty lists without a database, so
 * `/admin` renders on a fresh deployment and `next build` succeeds.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import { localDayRange, startOfDayPortAuPrince, startOfMonthPortAuPrince } from '@/lib/format';
import { ORDERS_PAGE_SIZE, type OrderFilters } from '@/lib/orders/queries';
import {
  NOTIFICATION_CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type GatewayMode,
  type Locale,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationLabel,
  type NotificationStatus,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/orders/types';

const { notifications, orders } = schema;

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/* -------------------------------------------------------------------------- */
/* Filters (pure)                                                             */
/* -------------------------------------------------------------------------- */

/** What `await searchParams` yields in a Next 16 page. */
export type AdminSearchParams = Record<string, string | string[] | undefined>;

export type AdminOrderFilters = {
  status: OrderStatus | 'all';
  method: PaymentMethod | 'all';
  mode: GatewayMode | 'all';
  /** Free search, trimmed and bounded; `''` when absent. */
  q: string;
  /** The `YYYY-MM-DD` strings as typed, so the form can render them back; `''` when absent or unusable. */
  fromDay: string;
  toDay: string;
  /** Port-au-Prince day boundaries, half-open `[from, to)`; `undefined` when not filtered. */
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
  offset: number;
};

const MAX_PAGE = 10_000;
const MAX_SEARCH_LENGTH = 100;
const MODES: readonly GatewayMode[] = ['sandbox', 'live'];

/** The first value of a possibly repeated query parameter, trimmed. */
function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | 'all' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : 'all';
}

/** `localDayRange` for a `YYYY-MM-DD` string, or `null` for anything else — it never escapes as an exception. */
function dayRange(value: string): { from: Date; to: Date } | null {
  if (!value) return null;
  try {
    return localDayRange(value);
  } catch {
    return null;
  }
}

/**
 * Reads the orders list query string. Pure and total: an unknown status, a
 * European date or a page of « trois » all fall back to the default instead
 * of throwing, because these values come straight from a URL a human typed.
 *
 * `to` is the END of the day named by `toDay`, so `du 6 au 8` includes
 * everything that happened on the 8th in Port-au-Prince.
 */
export function parseOrderFilters(sp: AdminSearchParams): AdminOrderFilters {
  const fromRange = dayRange(first(sp.from));
  const toRange = dayRange(first(sp.to));
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, MAX_PAGE) : 1;
  return {
    status: oneOf(first(sp.status), ORDER_STATUSES),
    method: oneOf(first(sp.method), PAYMENT_METHODS),
    mode: oneOf(first(sp.mode), MODES),
    q: first(sp.q).slice(0, MAX_SEARCH_LENGTH),
    fromDay: fromRange ? first(sp.from) : '',
    toDay: toRange ? first(sp.to) : '',
    from: fromRange?.from,
    to: toRange?.to,
    page,
    limit: ORDERS_PAGE_SIZE,
    offset: (page - 1) * ORDERS_PAGE_SIZE,
  };
}

/** The same filters in the shape `listOrders` understands. */
export function toOrderFilters(f: AdminOrderFilters): OrderFilters {
  return {
    status: f.status,
    method: f.method,
    mode: f.mode,
    q: f.q,
    from: f.from,
    to: f.to,
    limit: f.limit,
    offset: f.offset,
  };
}

/** The query string for a filter set, so pagination and the sandbox toggle keep the rest of the URL. */
export function orderFiltersToQuery(f: AdminOrderFilters, overrides: Partial<Record<string, string>> = {}): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string) => {
    if (value) params.set(key, value);
  };
  put('status', f.status === 'all' ? '' : f.status);
  put('method', f.method === 'all' ? '' : f.method);
  put('mode', f.mode === 'all' ? '' : f.mode);
  put('q', f.q);
  put('from', f.fromDay);
  put('to', f.toDay);
  put('page', f.page > 1 ? String(f.page) : '');
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/* -------------------------------------------------------------------------- */
/* Dashboard figures                                                          */
/* -------------------------------------------------------------------------- */

/** Gourdes received and dollars sent over one window, live orders only. */
export type PeriodTotals = {
  /** Σ `paid_htg` of orders whose payment was confirmed in the window. */
  collectedHtg: number;
  /** Σ (`paid_htg` − `base_htg`): what the fee rules actually brought in. */
  feesHtg: number;
  /** How many payments were confirmed. */
  paidOrders: number;
  /** Σ `fulfilled_usd_cents` (falling back to the ordered amount) of orders recharged in the window. */
  sentUsdCents: number;
  fulfilledOrders: number;
};

export type DashboardStats = {
  today: PeriodTotals;
  month: PeriodTotals;
  /** Live orders waiting for the operator right now (`paid` + `needs_review`). */
  actionable: number;
  /** Live orders still `pending_payment` after ten minutes — the sweep's queue. */
  stalePending: number;
  /** Live orders that failed in the last twenty-four hours. */
  failed24h: number;
  /** Sandbox orders waiting, listed apart so they never inflate `actionable`. */
  sandboxActionable: number;
  /** False when there is no database: the figures are zeros, not a quiet « nothing happened ». */
  dbReady: boolean;
};

const ZERO_TOTALS: PeriodTotals = { collectedHtg: 0, feesHtg: 0, paidOrders: 0, sentUsdCents: 0, fulfilledOrders: 0 };

export const STALE_PENDING_MS = 10 * 60_000;

/** Live orders only: a sandbox payment is never money. */
const LIVE = eq(orders.mode, 'live');

async function periodTotals(from: Date): Promise<PeriodTotals> {
  const [received, sent] = await Promise.all([
    db
      .select({
        collectedHtg: sql<number>`coalesce(sum(${orders.paidHtg}), 0)`,
        feesHtg: sql<number>`coalesce(sum(${orders.paidHtg} - ${orders.baseHtg}), 0)`,
        paidOrders: count(),
      })
      .from(orders)
      .where(and(LIVE, isNotNull(orders.paidHtg), isNotNull(orders.paidAt), gte(orders.paidAt, from))),
    db
      .select({
        sentUsdCents: sql<number>`coalesce(sum(coalesce(${orders.fulfilledUsdCents}, ${orders.usdCents})), 0)`,
        fulfilledOrders: count(),
      })
      .from(orders)
      .where(and(LIVE, eq(orders.status, 'fulfilled'), isNotNull(orders.fulfilledAt), gte(orders.fulfilledAt, from))),
  ]);
  return {
    collectedHtg: Number(received[0]?.collectedHtg ?? 0),
    feesHtg: Number(received[0]?.feesHtg ?? 0),
    paidOrders: Number(received[0]?.paidOrders ?? 0),
    sentUsdCents: Number(sent[0]?.sentUsdCents ?? 0),
    fulfilledOrders: Number(sent[0]?.fulfilledOrders ?? 0),
  };
}

async function countOrders(where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(orders).where(where);
  return Number(row?.total ?? 0);
}

/** Live orders waiting for the operator (`paid` + `needs_review`): the same figure as `DashboardStats.actionable`. */
const ACTIONABLE = and(LIVE, inArray(orders.status, ['paid', 'needs_review']));

/**
 * The one number the back-office shell shows on every page, as a badge: how
 * many live orders wait for the operator right now. One cheap `count(*)`,
 * never throws — `0` without a database or on failure, so a hiccup costs the
 * badge, never the page.
 */
export async function countActionableOrders(): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    return await countOrders(ACTIONABLE);
  } catch (err) {
    console.error(`[admin/queries] countActionableOrders failed: ${errorText(err)}`);
    return 0;
  }
}

/**
 * Everything the dashboard shows in one round of queries. Never throws: a
 * database hiccup shows zeros with `dbReady: false` rather than a 500 on the
 * page the operator opens first.
 */
export async function dashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const empty: DashboardStats = {
    today: ZERO_TOTALS,
    month: ZERO_TOTALS,
    actionable: 0,
    stalePending: 0,
    failed24h: 0,
    sandboxActionable: 0,
    dbReady: false,
  };
  if (!dbConfigured()) return empty;
  try {
    const [today, month, actionable, stalePending, failed24h, sandboxActionable] = await Promise.all([
      periodTotals(startOfDayPortAuPrince(now)),
      periodTotals(startOfMonthPortAuPrince(now)),
      countOrders(ACTIONABLE),
      countOrders(
        and(LIVE, eq(orders.status, 'pending_payment'), lt(orders.createdAt, new Date(now.getTime() - STALE_PENDING_MS))),
      ),
      countOrders(and(LIVE, eq(orders.status, 'failed'), gte(orders.updatedAt, new Date(now.getTime() - 24 * 3_600_000)))),
      countOrders(and(eq(orders.mode, 'sandbox'), inArray(orders.status, ['paid', 'needs_review']))),
    ]);
    return { today, month, actionable, stalePending, failed24h, sandboxActionable, dbReady: true };
  } catch (err) {
    console.error(`[admin/queries] dashboardStats failed: ${errorText(err)}`);
    return empty;
  }
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** One notification attempt, with the order it belongs to resolved for display. */
export type NotificationListItem = {
  id: string;
  orderId: string | null;
  reference: string | null;
  mode: GatewayMode | null;
  channel: NotificationChannel;
  audience: NotificationAudience;
  recipient: string;
  template: NotificationLabel;
  locale: Locale;
  status: NotificationStatus;
  providerId: string | null;
  error: string | null;
  resendOf: string | null;
  createdAt: Date;
};

/** The notification journal, newest first. Never throws. */
export async function listRecentNotifications(limit = 200): Promise<NotificationListItem[]> {
  if (!dbConfigured()) return [];
  try {
    return await db
      .select({
        id: notifications.id,
        orderId: notifications.orderId,
        reference: orders.reference,
        mode: orders.mode,
        channel: notifications.channel,
        audience: notifications.audience,
        recipient: notifications.recipient,
        template: notifications.template,
        locale: notifications.locale,
        status: notifications.status,
        providerId: notifications.providerId,
        error: notifications.error,
        resendOf: notifications.resendOf,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(orders, eq(notifications.orderId, orders.id))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(Math.min(Math.max(limit, 1), 500));
  } catch (err) {
    console.error(`[admin/queries] listRecentNotifications failed: ${errorText(err)}`);
    return [];
  }
}

/**
 * When each channel last reached the operator. `/admin/sante` turns a null —
 * or anything older than two days — into a warning, because an admin alert
 * that stopped arriving is indistinguishable from « no orders » until money
 * is missed.
 */
export async function lastAdminNotificationByChannel(): Promise<Record<NotificationChannel, Date | null>> {
  const empty = { email: null, whatsapp: null, whatsapp_manual: null } as Record<NotificationChannel, Date | null>;
  if (!dbConfigured()) return empty;
  try {
    const rows = await db
      .select({ channel: notifications.channel, at: sql<string | Date | null>`max(${notifications.createdAt})` })
      .from(notifications)
      .where(and(eq(notifications.audience, 'admin'), eq(notifications.status, 'sent')))
      .groupBy(notifications.channel);
    const out = { ...empty };
    for (const row of rows) {
      if (!NOTIFICATION_CHANNELS.includes(row.channel)) continue;
      const at = row.at instanceof Date ? row.at : row.at ? new Date(row.at) : null;
      out[row.channel] = at && !Number.isNaN(at.getTime()) ? at : null;
    }
    return out;
  } catch (err) {
    console.error(`[admin/queries] lastAdminNotificationByChannel failed: ${errorText(err)}`);
    return empty;
  }
}
