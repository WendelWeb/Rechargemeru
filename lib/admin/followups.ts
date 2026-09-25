/**
 * lib/admin/followups.ts — the orders worth a « qu'est-ce qui s'est passé ? ».
 *
 * An order that was created and never paid is somebody who wanted dollars
 * on Meru and stopped on the way: the price, the payment page, a network, a
 * doubt. The follow-up page lists them with what matters before writing:
 *
 *   - whether the operator already wrote, when, and with which message
 *     (the journal of manual WhatsApp sends, `whatsapp_manual`);
 *   - whether the same customer — same phone — paid another order since,
 *     in which case there is nothing to follow up;
 *   - whether a pending order is simply too fresh: somebody may be paying
 *     right now, and a « what happened? » after two minutes is a nudge too
 *     early.
 *
 * Live orders only. Reads never throw: without a database, an empty list.
 */
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import type { OrderRow, OrderStatus } from '@/lib/orders/types';

const { orders, notifications } = schema;

export const UNPAID_STATUSES = ['pending_payment', 'expired', 'cancelled', 'failed'] as const satisfies readonly OrderStatus[];

/** Statuses that mean the customer's money did arrive. */
const PAID_STATUSES = ['paid', 'needs_review', 'fulfilled'] as const satisfies readonly OrderStatus[];

/** A pending order younger than this is left alone: its customer may be paying. */
export const TOO_FRESH_MS = 15 * 60_000;

export const FOLLOW_UP_DAYS = [7, 30, 90] as const;
export type FollowUpDays = (typeof FOLLOW_UP_DAYS)[number];

export type FollowUpView = 'todo' | 'done' | 'all';

export type FollowUpState =
  /** Nobody wrote yet, and there is something to ask. */
  | 'todo'
  /** The operator already wrote at least once. */
  | 'contacted'
  /** The same customer paid another order since: nothing to follow up. */
  | 'paid_later'
  /** A pending order younger than a quarter of an hour. */
  | 'too_fresh';

export type LastContact = { label: string; at: Date; count: number };

export type FollowUp = {
  order: OrderRow;
  state: FollowUpState;
  lastContact: LastContact | null;
  /** When the same customer paid another order after this one. */
  paidLaterAt: Date | null;
};

/** The state of one unpaid order. Pure. */
export function followUpState(
  order: Pick<OrderRow, 'status' | 'createdAt'>,
  lastContact: LastContact | null,
  paidLaterAt: Date | null,
  now: Date,
): FollowUpState {
  if (paidLaterAt && paidLaterAt > order.createdAt) return 'paid_later';
  if (lastContact) return 'contacted';
  if (order.status === 'pending_payment' && now.getTime() - order.createdAt.getTime() < TOO_FRESH_MS) {
    return 'too_fresh';
  }
  return 'todo';
}

/** Which states a view shows. Pure. */
export function inView(state: FollowUpState, view: FollowUpView): boolean {
  if (view === 'all') return true;
  if (view === 'done') return state === 'contacted';
  return state === 'todo';
}

export function parseFollowUpView(value: string | string[] | undefined): FollowUpView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'done' || raw === 'all' ? raw : 'todo';
}

export function parseFollowUpDays(value: string | string[] | undefined): FollowUpDays {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  return (FOLLOW_UP_DAYS as readonly number[]).includes(raw) ? (raw as FollowUpDays) : 30;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/**
 * Every live unpaid order of the last `days`, newest first, with its state,
 * its latest manual WhatsApp message and whether its customer paid later.
 */
export async function listFollowUps(
  days: FollowUpDays,
  now: Date = new Date(),
  limit = 200,
): Promise<{ items: FollowUp[]; dbReady: boolean }> {
  if (!dbConfigured()) return { items: [], dbReady: false };
  try {
    const since = new Date(now.getTime() - days * 86_400_000);
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.mode, 'live'), inArray(orders.status, [...UNPAID_STATUSES]), gte(orders.createdAt, since)))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(Math.min(Math.max(limit, 1), 500));
    if (rows.length === 0) return { items: [], dbReady: true };

    const ids = rows.map((row) => row.id);
    const phones = Array.from(new Set(rows.map((row) => row.customerPhone)));

    const [contacts, paidLater] = await Promise.all([
      db
        .select({ orderId: notifications.orderId, template: notifications.template, at: notifications.createdAt })
        .from(notifications)
        .where(and(eq(notifications.channel, 'whatsapp_manual'), inArray(notifications.orderId, ids)))
        .orderBy(desc(notifications.createdAt)),
      db
        .select({ phone: orders.customerPhone, at: sql<Date | string>`max(${orders.createdAt})` })
        .from(orders)
        .where(
          and(
            eq(orders.mode, 'live'),
            inArray(orders.status, [...PAID_STATUSES]),
            inArray(orders.customerPhone, phones),
          ),
        )
        .groupBy(orders.customerPhone),
    ]);

    const lastByOrder = new Map<string, LastContact>();
    for (const contact of contacts) {
      if (!contact.orderId) continue;
      const known = lastByOrder.get(contact.orderId);
      if (known) known.count += 1;
      else lastByOrder.set(contact.orderId, { label: contact.template, at: contact.at, count: 1 });
    }
    const paidByPhone = new Map(paidLater.map((row) => [row.phone, new Date(row.at)]));

    const items = rows.map((order) => {
      const lastContact = lastByOrder.get(order.id) ?? null;
      const paidAt = paidByPhone.get(order.customerPhone) ?? null;
      const paidLaterAt = paidAt && paidAt > order.createdAt ? paidAt : null;
      return { order, lastContact, paidLaterAt, state: followUpState(order, lastContact, paidLaterAt, now) };
    });
    return { items, dbReady: true };
  } catch (err) {
    console.error(`[admin/followups] listFollowUps failed: ${errorText(err)}`);
    return { items: [], dbReady: false };
  }
}

/**
 * How many orders are waiting for a first follow-up over the last week —
 * the badge beside « Relances ». One query; 0 on any failure.
 */
export async function countFollowUpsToDo(now: Date = new Date(), days = 7): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    const since = new Date(now.getTime() - days * 86_400_000);
    const fresh = new Date(now.getTime() - TOO_FRESH_MS);
    const [row] = await db
      .select({ total: count() })
      .from(orders)
      .where(
        and(
          eq(orders.mode, 'live'),
          inArray(orders.status, [...UNPAID_STATUSES]),
          gte(orders.createdAt, since),
          sql`(${orders.status} <> 'pending_payment' or ${orders.createdAt} < ${fresh})`,
          sql`not exists (select 1 from ${notifications} n where n.order_id = ${orders.id} and n.channel = 'whatsapp_manual')`,
          sql`not exists (select 1 from ${orders} p where p.customer_phone = ${orders.customerPhone} and p.mode = 'live' and p.status in ('paid', 'needs_review', 'fulfilled') and p.created_at > ${orders.createdAt})`,
        ),
      );
    return Number(row?.total ?? 0);
  } catch (err) {
    console.error(`[admin/followups] countFollowUpsToDo failed: ${errorText(err)}`);
    return 0;
  }
}
