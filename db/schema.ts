import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  Actor,
  GatewayMode,
  Locale,
  MeruAccountType,
  NotificationAudience,
  NotificationChannel,
  NotificationStatus,
  NotificationTemplate,
  OrderStatus,
  PaymentMethod,
  ProviderId,
  QuoteLine,
  WebhookLogStatus,
  WebhookMatchedBy,
  WebhookSource,
} from '@/lib/orders/types';
import type { FeeRule } from '@/lib/settings/types';

/**
 * Recharge Meru — Postgres schema (Neon over neon-http, Drizzle ORM).
 *
 * Money: USD in integer cents, HTG in integer gourdes. The FX rate is the
 * only decimal column, `numeric(10,4)` read as a JS number; the pricing engine
 * converts it once to integer ten-thousandths before any arithmetic.
 *
 * neon-http has no transactions, so every status change is a single
 * compare-and-set `UPDATE … WHERE id = ? AND status IN (…) RETURNING *`.
 *
 * The imports from `@/lib/...` are type-only: this file stays loadable by
 * drizzle-kit without the path alias, and `lib/orders/types.ts` can re-export
 * the row types from here without a runtime cycle.
 */

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Single-row operator settings; `id` is always `'singleton'`. */
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey().default('singleton'),
  fxRateHtg: numeric('fx_rate_htg', { precision: 10, scale: 4, mode: 'number' }).notNull().default(132),
  feeRules: jsonb('fee_rules').$type<FeeRule[]>().notNull().default([]),
  amountToleranceHtg: integer('amount_tolerance_htg').notNull().default(0),
  minUsdCents: integer('min_usd_cents').notNull().default(500),
  maxUsdCents: integer('max_usd_cents').notNull().default(50000),
  orderTtlMinutes: integer('order_ttl_minutes').notNull().default(30),
  adminEmails: jsonb('admin_emails').$type<string[]>().notNull().default([]),
  adminWhatsappNumbers: jsonb('admin_whatsapp_numbers').$type<string[]>().notNull().default([]),
  notifyAdminEvents: jsonb('notify_admin_events')
    .$type<NotificationTemplate[]>()
    .notNull()
    .default(['paid', 'needs_review', 'failed']),
  notifyCustomerEvents: jsonb('notify_customer_events')
    .$type<NotificationTemplate[]>()
    .notNull()
    .default(['created', 'paid', 'fulfilled', 'failed', 'needs_review', 'refunded']),
  meruAccountTypes: jsonb('meru_account_types')
    .$type<MeruAccountType[]>()
    .notNull()
    .default(['email', 'username']),
  businessName: text('business_name').notNull().default('Recharge Meru'),
  supportWhatsapp: text('support_whatsapp'),
  supportHours: text('support_hours').notNull().default('8 h – 20 h, 7 j/7'),
  fulfilmentSlaFr: text('fulfilment_sla_fr').notNull().default('moins de 2 heures'),
  fulfilmentSlaHt: text('fulfilment_sla_ht').notNull().default('mwens pase 2 èdtan'),
  meruHelpFr: text('meru_help_fr'),
  meruHelpHt: text('meru_help_ht'),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

/**
 * One order = one provider payment. The quote (`fxRateHtg`, `baseHtg`,
 * `feeLines`, `totalHtg`) is frozen at creation and never recomputed.
 * `mode` has no default on purpose: whoever inserts an order must say whether
 * it is a sandbox order, because sandbox orders must never lead to a real
 * transfer.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 'MR-' + 8 characters from the unambiguous alphabet, crypto-random.
    reference: text('reference').notNull().unique('orders_reference_uq'),
    status: text('status').$type<OrderStatus>().notNull().default('pending_payment'),
    method: text('method').$type<PaymentMethod>().notNull(),
    provider: text('provider').$type<ProviderId>(),
    providerRef: text('provider_ref'),
    providerTransactionId: text('provider_transaction_id'),
    // Wallet that actually paid, as reported by the provider (may differ from customerPhone).
    payerWallet: text('payer_wallet'),
    mode: text('mode').$type<GatewayMode>().notNull(),
    usdCents: integer('usd_cents').notNull(),
    fxRateHtg: numeric('fx_rate_htg', { precision: 10, scale: 4, mode: 'number' }).notNull(),
    baseHtg: integer('base_htg').notNull(),
    feeLines: jsonb('fee_lines').$type<QuoteLine[]>().notNull().default([]),
    totalHtg: integer('total_htg').notNull(),
    // Gourdes the provider reported as received; null when unreported.
    paidHtg: integer('paid_htg'),
    // Cents the operator actually sent on Meru (defaults to usdCents in the UI).
    fulfilledUsdCents: integer('fulfilled_usd_cents'),
    refundHtg: integer('refund_htg'),
    refundWallet: text('refund_wallet'),
    // Clerk user id when the customer was signed in; null for a guest order,
    // which stays the default path — an account only links past orders together.
    clerkUserId: text('clerk_user_id'),
    customerName: text('customer_name').notNull(),
    // E.164, e.g. +50937001234.
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),
    meruAccountType: text('meru_account_type').$type<MeruAccountType>().notNull(),
    // Normalised: lower-cased email, or username without a leading @.
    meruAccount: text('meru_account').notNull(),
    meruReference: text('meru_reference'),
    redirectUrl: text('redirect_url'),
    redirectExpiresAt: tz('redirect_expires_at'),
    returnedAt: tz('returned_at'),
    lastVerifiedAt: tz('last_verified_at'),
    verifyAttempts: integer('verify_attempts').notNull().default(0),
    failureReason: text('failure_reason'),
    adminNote: text('admin_note'),
    locale: text('locale').$type<Locale>().notNull().default('fr'),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
    paidAt: tz('paid_at'),
    fulfilledAt: tz('fulfilled_at'),
  },
  (t) => [
    // Postgres treats NULLs as distinct, so rows without a provider ref never collide.
    unique('orders_provider_ref_uq').on(t.provider, t.providerRef),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_phone_idx').on(t.customerPhone),
    index('orders_mode_idx').on(t.mode),
    index('orders_clerk_user_idx').on(t.clerkUserId),
  ],
);

/** Append-only timeline of everything that happened to an order. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // OrderEventType from lib/orders/events.ts; kept as text so the schema owns no behaviour.
    type: text('type').notNull(),
    message: text('message'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    actor: text('actor').$type<Actor>().notNull().default('system'),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (t) => [index('order_events_order_created_idx').on(t.orderId, t.createdAt)],
);

/**
 * One row per (order, template, audience, channel, recipient) attempt. The
 * partial unique index is the deduplication: a second `pending`/`sent` row for
 * the same key is refused by the database itself (insert with
 * `onConflictDoNothing`), so a duplicate callback can never produce a second
 * « PAYÉE » alert. Explicit resends carry `resendOf` and bypass it.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    channel: text('channel').$type<NotificationChannel>().notNull(),
    audience: text('audience').$type<NotificationAudience>().notNull(),
    // Email address or E.164 phone number.
    recipient: text('recipient').notNull(),
    template: text('template').$type<NotificationTemplate>().notNull(),
    locale: text('locale').$type<Locale>().notNull().default('fr'),
    status: text('status').$type<NotificationStatus>().notNull().default('pending'),
    // Message id returned by Resend / Meta / Twilio.
    providerId: text('provider_id'),
    error: text('error'),
    resendOf: uuid('resend_of').references((): AnyPgColumn => notifications.id, { onDelete: 'set null' }),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_uq')
      .on(t.orderId, t.template, t.audience, t.channel, t.recipient)
      .where(sql`status in ('pending','sent') and resend_of is null`),
    index('notifications_order_idx').on(t.orderId),
    index('notifications_created_idx').on(t.createdAt),
  ],
);

/**
 * Raw provider callbacks and customer returns, stored before anything is
 * decided. `orderId` is set only once the request was resolved to an existing
 * order (no foreign key: an unknown hint must still be logged); the raw hints
 * stay in `payload`.
 */
export const webhookLogs = pgTable(
  'webhook_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').$type<WebhookSource>().notNull(),
    orderId: uuid('order_id'),
    matchedBy: text('matched_by').$type<WebhookMatchedBy>(),
    status: text('status').$type<WebhookLogStatus>().notNull(),
    payload: jsonb('payload').$type<unknown>(),
    error: text('error'),
    receivedAt: tz('received_at').notNull().defaultNow(),
  },
  (t) => [index('webhook_logs_order_idx').on(t.orderId), index('webhook_logs_received_idx').on(t.receivedAt)],
);
