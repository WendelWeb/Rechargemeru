/**
 * lib/orders/events.ts — the append-only timeline of an order and the raw
 * callback log.
 *
 * Everything that happens to an order is written here after the fact, never
 * as a precondition: `appendEvent` and `logWebhook` NEVER THROW, because a
 * logging hiccup must not change what a callback answers to a provider or
 * whether a verified payment gets granted. A failure is reported on the
 * server console (without secrets) and swallowed.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import type {
  Actor,
  OrderEventRow,
  WebhookLogStatus,
  WebhookMatchedBy,
  WebhookSource,
} from '@/lib/orders/types';

export const ORDER_EVENT_TYPES = [
  'created',
  'redirect_issued',
  'provider_error',
  'callback_received',
  'verified_paid',
  'verified_unpaid',
  'verification_failed',
  'amount_mismatch',
  'amount_unreported',
  'paid_after_expiry',
  'paid_after_refund',
  'status_changed',
  'notification_sent',
  'notification_failed',
  'notification_skipped',
  'admin_note',
  'meru_account_corrected',
  'fulfilled',
  'marked_failed',
  'cancelled',
  'refunded',
  'expired',
  'review_flagged',
  'reconcile_gave_up',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export type OrderEventInput = {
  orderId: string;
  type: OrderEventType;
  message?: string | null;
  /** Any JSON-serialisable detail; Dates become ISO strings, `undefined` keys disappear. */
  data?: Record<string, unknown> | null;
  actor?: Actor;
};

export type WebhookLogInput = {
  source: WebhookSource;
  orderId?: string | null;
  matchedBy?: WebhookMatchedBy | null;
  status: WebhookLogStatus;
  payload?: unknown;
  error?: string | null;
};

/** Plain JSON for a jsonb column: Dates to ISO strings, `undefined` dropped, cycles reported instead of thrown. */
export function toJsonValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return { unserializable: true };
  }
}

function toJsonRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const json = toJsonValue(value);
  if (json === null) return null;
  if (typeof json === 'object' && !Array.isArray(json)) return json as Record<string, unknown>;
  return { value: json };
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Appends one event to the order's timeline. Never throws; `null` when nothing was written. */
export async function appendEvent(ev: OrderEventInput): Promise<OrderEventRow | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .insert(schema.orderEvents)
      .values({
        orderId: ev.orderId,
        type: ev.type,
        message: ev.message ?? null,
        data: toJsonRecord(ev.data),
        actor: ev.actor ?? 'system',
      })
      .returning();
    return row ?? null;
  } catch (err) {
    console.error(`[orders/events] appendEvent ${ev.type} failed for ${ev.orderId}: ${errorText(err)}`);
    return null;
  }
}

/** Records a raw provider callback or customer return. Never throws. */
export async function logWebhook(entry: WebhookLogInput): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await db.insert(schema.webhookLogs).values({
      source: entry.source,
      orderId: entry.orderId ?? null,
      matchedBy: entry.matchedBy ?? null,
      status: entry.status,
      payload: toJsonValue(entry.payload),
      error: entry.error ?? null,
    });
  } catch (err) {
    console.error(`[orders/events] logWebhook ${entry.source} failed: ${errorText(err)}`);
  }
}

/** The most recent event of `type` for an order, or `null` (also on a read failure — never throws). */
export async function lastEventOfType(orderId: string, type: OrderEventType): Promise<OrderEventRow | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select()
      .from(schema.orderEvents)
      .where(and(eq(schema.orderEvents.orderId, orderId), eq(schema.orderEvents.type, type)))
      .orderBy(desc(schema.orderEvents.createdAt), desc(schema.orderEvents.id))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error(`[orders/events] lastEventOfType ${type} failed for ${orderId}: ${errorText(err)}`);
    return null;
  }
}
