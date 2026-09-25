/**
 * lib/orders/queries.ts — every read and write on the `orders` table.
 *
 * TWO WRITE PATHS, ON PURPOSE:
 * - `updateOrder` patches columns and refuses a status change;
 * - `transitionOrder` is the ONLY way a status changes. neon-http has no
 *   transactions, so it is a single compare-and-set
 *   `UPDATE … SET status = to … WHERE id = ? AND status IN (allowedFrom(to)) RETURNING *`.
 *   Zero rows means another caller won (a duplicate callback, the admin and
 *   the cron racing) and the caller must do nothing more — no event, no
 *   notification.
 *
 * Reads return `null` / `[]` without a database so the public site and
 * `next build` work before `DATABASE_URL` exists; writes let the driver
 * throw and callers (all never-throw modules) catch.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import { normalizePhone } from '@/lib/phone';
import { normalizeReference } from '@/lib/orders/reference';
import { allowedFrom } from '@/lib/orders/transitions';
import type {
  GatewayMode,
  NewOrder,
  NotificationRow,
  OrderEventRow,
  OrderRow,
  OrderStatus,
  PaymentMethod,
} from '@/lib/orders/types';

const { orders, orderEvents, notifications } = schema;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID (any version) — a lookup by anything else is a guaranteed miss, not a query. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function getOrderById(id: string): Promise<OrderRow | null> {
  if (!dbConfigured() || !isUuid(id)) return null;
  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row ?? null;
}

/** Accepts anything `normalizeReference` understands (« mr 7f3k 2qab »). */
export async function getOrderByReference(reference: string): Promise<OrderRow | null> {
  const normalized = normalizeReference(reference);
  if (!dbConfigured() || !normalized) return null;
  const [row] = await db.select().from(orders).where(eq(orders.reference, normalized)).limit(1);
  return row ?? null;
}

/** The provider's own reference (`orders.provider_ref`), optionally narrowed to one provider. */
export async function getOrderByProviderRef(providerRef: string, provider?: OrderRow['provider']): Promise<OrderRow | null> {
  const ref = providerRef.trim();
  if (!dbConfigured() || !ref) return null;
  const where = provider ? and(eq(orders.providerRef, ref), eq(orders.provider, provider)) : eq(orders.providerRef, ref);
  const [row] = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(1);
  return row ?? null;
}

/** The timeline, oldest first. */
export async function getOrderEvents(orderId: string, limit = 500): Promise<OrderEventRow[]> {
  if (!dbConfigured() || !isUuid(orderId)) return [];
  return db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id))
    .limit(limit);
}

/** Every notification attempt for an order, newest first. */
export async function getOrderNotifications(orderId: string, limit = 200): Promise<NotificationRow[]> {
  if (!dbConfigured() || !isUuid(orderId)) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.orderId, orderId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export type OrderFilters = {
  status?: OrderStatus | 'all';
  /** Several statuses at once (the admin's status chips); ignored when empty. */
  statuses?: readonly OrderStatus[];
  method?: PaymentMethod | 'all';
  mode?: GatewayMode | 'all';
  /** Reference, phone, Meru identifier or customer name. */
  q?: string;
  /** Half-open `[from, to)` on `createdAt`. */
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type OrderPage = { orders: OrderRow[]; total: number };

export const ORDERS_PAGE_SIZE = 50;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function searchCondition(q: string): SQL | undefined {
  const term = q.trim();
  if (!term) return undefined;
  const alternatives: SQL[] = [];
  const reference = normalizeReference(term);
  if (reference) alternatives.push(eq(orders.reference, reference));
  const phone = normalizePhone(term);
  if (phone) alternatives.push(eq(orders.customerPhone, phone));
  const pattern = `%${escapeLike(term)}%`;
  alternatives.push(
    ilike(orders.customerName, pattern),
    ilike(orders.meruAccount, pattern),
    ilike(orders.reference, pattern),
    ilike(orders.customerPhone, pattern),
  );
  return or(...alternatives);
}

function filterConditions(filters: OrderFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.status && filters.status !== 'all') conditions.push(eq(orders.status, filters.status));
  if (filters.statuses && filters.statuses.length > 0) conditions.push(inArray(orders.status, [...filters.statuses]));
  if (filters.method && filters.method !== 'all') conditions.push(eq(orders.method, filters.method));
  if (filters.mode && filters.mode !== 'all') conditions.push(eq(orders.mode, filters.mode));
  if (filters.from) conditions.push(gte(orders.createdAt, filters.from));
  if (filters.to) conditions.push(lt(orders.createdAt, filters.to));
  const search = filters.q ? searchCondition(filters.q) : undefined;
  if (search) conditions.push(search);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Admin list: newest first, with the total for pagination. */
export async function listOrders(filters: OrderFilters = {}): Promise<OrderPage> {
  if (!dbConfigured()) return { orders: [], total: 0 };
  const where = filterConditions(filters);
  const limit = Math.min(Math.max(filters.limit ?? ORDERS_PAGE_SIZE, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [rows, [totalRow]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { orders: rows, total: Number(totalRow?.total ?? 0) };
}

/**
 * How many orders each status holds under the same filters, status aside —
 * the counts the status chips show, so « Payées 3 » stays true whatever else
 * is ticked. Never throws: the chips then show zeros.
 */
export async function countOrdersByStatus(filters: OrderFilters = {}): Promise<Partial<Record<OrderStatus, number>>> {
  if (!dbConfigured()) return {};
  try {
    const where = filterConditions({ ...filters, status: 'all', statuses: [] });
    const rows = await db.select({ status: orders.status, total: count() }).from(orders).where(where).groupBy(orders.status);
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  } catch (err) {
    console.error(`[orders/queries] countOrdersByStatus failed: ${err instanceof Error ? err.message : String(err)}`);
    return {};
  }
}

/**
 * One account's own orders, newest first — everything `/{locale}/mes-commandes`
 * shows.
 *
 * Scoped to the Clerk user id the server read off the session, never to
 * anything a browser sent, so an account can only ever see its own history.
 * Guest orders carry no user id and simply never match: creating an account
 * later does not adopt them.
 */
export async function listOrdersForUser(clerkUserId: string, limit = 50): Promise<OrderRow[]> {
  const id = clerkUserId.trim();
  if (!dbConfigured() || !id) return [];
  return db
    .select()
    .from(orders)
    .where(eq(orders.clerkUserId, id))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/** Columns a plain patch may touch — never the status, never the identity. */
export type OrderPatch = Partial<Omit<NewOrder, 'id' | 'status' | 'createdAt'>>;

/**
 * Patches columns of one order. Throws when the patch carries a `status`:
 * status changes go through `transitionOrder` so every one of them is a
 * compare-and-set. `null` when the order does not exist.
 */
export async function updateOrder(id: string, patch: Partial<NewOrder>): Promise<OrderRow | null> {
  if ('status' in patch) throw new Error('updateOrder: status changes go through transitionOrder');
  if (!isUuid(id)) return null;
  const { id: _id, createdAt: _createdAt, ...rest } = patch;
  void _id;
  void _createdAt;
  const [row] = await db
    .update(orders)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  return row ?? null;
}

/**
 * THE status change: `UPDATE orders SET status = to, …patch, updated_at = now()
 * WHERE id = ? AND status IN (allowedFrom(to)) RETURNING *`. `null` when the
 * order is not in an origin the table allows — someone else already moved
 * it, or it never was there — and the caller must then do nothing more.
 */
export async function transitionOrder(id: string, to: OrderStatus, patch: Partial<NewOrder> = {}): Promise<OrderRow | null> {
  const origins = allowedFrom(to);
  if (origins.length === 0 || !isUuid(id)) return null;
  const { id: _id, status: _status, createdAt: _createdAt, ...rest } = patch;
  void _id;
  void _status;
  void _createdAt;
  const [row] = await db
    .update(orders)
    .set({ ...rest, status: to, updatedAt: new Date() })
    .where(and(eq(orders.id, id), inArray(orders.status, origins)))
    .returning();
  return row ?? null;
}

export type ReconcileWindow = {
  now: Date;
  /** Skip orders younger than this: the customer may still be on the provider's page. */
  minAgeMs: number;
  /** Skip orders older than this: nobody pays a week later. */
  maxAgeMs: number;
  /** Skip orders checked more recently than this. */
  notVerifiedSinceMs: number;
  /** Skip orders already checked this many times. */
  maxAttempts: number;
  limit: number;
};

function reconcileCondition(w: Omit<ReconcileWindow, 'limit'>): SQL | undefined {
  const now = w.now.getTime();
  return and(
    inArray(orders.status, ['pending_payment', 'expired']),
    lt(orders.createdAt, new Date(now - w.minAgeMs)),
    gte(orders.createdAt, new Date(now - w.maxAgeMs)),
    or(isNull(orders.lastVerifiedAt), lt(orders.lastVerifiedAt, new Date(now - w.notVerifiedSinceMs))),
    lt(orders.verifyAttempts, w.maxAttempts),
  );
}

/** Pending or expired orders worth asking the provider about again, oldest first. */
export async function listReconcileCandidates(w: ReconcileWindow): Promise<OrderRow[]> {
  if (!dbConfigured()) return [];
  return db
    .select()
    .from(orders)
    .where(reconcileCondition(w))
    .orderBy(asc(orders.createdAt))
    .limit(Math.max(w.limit, 0));
}

/** How many orders `listReconcileCandidates` would find without its limit. */
export async function countReconcileCandidates(w: Omit<ReconcileWindow, 'limit'>): Promise<number> {
  if (!dbConfigured()) return 0;
  const [row] = await db.select({ total: count() }).from(orders).where(reconcileCondition(w));
  return Number(row?.total ?? 0);
}

/** Pending orders whose payment deadline has passed, oldest deadline first. */
export async function listExpiredPending(now: Date, limit: number): Promise<OrderRow[]> {
  if (!dbConfigured()) return [];
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.status, 'pending_payment'), lt(orders.expiresAt, now)))
    .orderBy(asc(orders.expiresAt))
    .limit(Math.max(limit, 0));
}

/** What the operator has to recharge: `paid` first, then `needs_review`, oldest first; sandbox orders only on request. */
export async function listActionable({ includeSandbox, limit }: { includeSandbox: boolean; limit: number }): Promise<OrderRow[]> {
  if (!dbConfigured()) return [];
  const where = includeSandbox
    ? inArray(orders.status, ['paid', 'needs_review'])
    : and(inArray(orders.status, ['paid', 'needs_review']), eq(orders.mode, 'live'));
  return db
    .select()
    .from(orders)
    .where(where)
    .orderBy(sql`case ${orders.status} when 'paid' then 0 else 1 end`, asc(sql`coalesce(${orders.paidAt}, ${orders.updatedAt})`))
    .limit(Math.max(limit, 0));
}

export type AdminReminderTemplate = 'paid' | 'needs_review' | 'reminder_24h';
export type AdminReminder = { order: OrderRow; template: AdminReminderTemplate };

/** Re-alert after this long without a successful admin notification, and remind once after a day. */
export const ADMIN_REALERT_MS = 30 * 60_000;
export const ADMIN_REMINDER_MS = 24 * 3_600_000;

function adminSent(template: SQL): SQL {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(notifications)
      .where(
        and(
          eq(notifications.orderId, orders.id),
          eq(notifications.audience, 'admin'),
          eq(notifications.status, 'sent'),
          sql`${notifications.template} = ${template}`,
        ),
      ),
  );
}

/**
 * Live `paid` / `needs_review` orders the operator has not been told about
 * (no `sent` admin notification for their own template after
 * `ADMIN_REALERT_MS`), then those still open after `ADMIN_REMINDER_MS`
 * without a `reminder_24h`. Each order appears once, the primary alert
 * winning over the reminder.
 */
export async function listAdminReminders(now: Date, limit = 100): Promise<AdminReminder[]> {
  if (!dbConfigured()) return [];
  const open = and(inArray(orders.status, ['paid', 'needs_review']), eq(orders.mode, 'live'));
  const since = sql`coalesce(${orders.paidAt}, ${orders.updatedAt})`;
  const [unalerted, stale] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(open, sql`${since} < ${new Date(now.getTime() - ADMIN_REALERT_MS).toISOString()}::timestamptz`, adminSent(sql`${orders.status}`)))
      .orderBy(asc(orders.createdAt))
      .limit(limit),
    db
      .select()
      .from(orders)
      .where(and(open, sql`${since} < ${new Date(now.getTime() - ADMIN_REMINDER_MS).toISOString()}::timestamptz`, adminSent(sql`'reminder_24h'`)))
      .orderBy(asc(orders.createdAt))
      .limit(limit),
  ]);
  const reminders: AdminReminder[] = unalerted.map((order) => ({
    order,
    template: order.status === 'needs_review' ? 'needs_review' : 'paid',
  }));
  const seen = new Set(unalerted.map((o) => o.id));
  for (const order of stale) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    reminders.push({ order, template: 'reminder_24h' });
  }
  return reminders;
}
