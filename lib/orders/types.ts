import type { notifications, orderEvents, orders, platformSettings, webhookLogs } from '@/db/schema';

/**
 * Domain vocabulary shared by the pricing engine, the Drizzle schema, the
 * service layer and both UIs.
 *
 * Runtime constants live here so Zod schemas and select inputs can enumerate
 * them. The row types are re-exported from the Drizzle schema through
 * `import type` only, so importing this module never loads drizzle-orm — the
 * browser-side quote engine depends on it.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'needs_review',
  'fulfilled',
  'failed',
  'expired',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['moncash', 'natcash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ProviderId = 'direct' | 'bazik' | 'kobara';
export type GatewayMode = 'sandbox' | 'live';
export type Locale = 'fr' | 'ht';
export type Actor = 'system' | 'customer' | 'admin' | 'provider';

// Décision opérateur : email ou nom d'utilisateur Meru, jamais un téléphone.
export const MERU_ACCOUNT_TYPES = ['email', 'username'] as const;
export type MeruAccountType = (typeof MERU_ACCOUNT_TYPES)[number];

/**
 * One frozen fee line of a quote; `baseHtg + Σ amountHtg === totalHtg`.
 *
 * `amountHtg` is what the customer pays for this line. `value` is the setting
 * it came from, in the unit of `kind` — a percentage, whole gourdes, or US
 * cents (`fixed_usd`) — so a receipt can still print « Frais de transfert
 * 3 $ US → 396 HTG » long after the rate has moved. Kept as a literal union
 * rather than an import of `FeeKind` so this module stays free of any
 * settings dependency.
 *
 * Both labels are frozen with the line: an order placed on `/ht` must still
 * read in Kreyòl when it is reopened, whatever the operator has renamed since.
 * `labelHt` is optional — orders stored before it existed simply fall back to
 * the French `label`.
 */
export type QuoteLine = {
  id: string;
  label: string;
  /** The Kreyòl label frozen with the line; `null` or absent falls back to `label`. */
  labelHt?: string | null;
  kind: 'percent' | 'fixed' | 'fixed_usd';
  value: number;
  basis: 'base' | 'subtotal';
  amountHtg: number;
};

export const NOTIFICATION_CHANNELS = ['email', 'whatsapp', 'whatsapp_manual'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TEMPLATES = [
  'created',
  'paid',
  'fulfilled',
  'failed',
  'expired',
  'needs_review',
  'refunded',
  'reminder_24h',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export const NOTIFICATION_AUDIENCES = ['admin', 'customer'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const WEBHOOK_SOURCES = ['moncash', 'natcash', 'moncash_retour', 'natcash_retour'] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];

export const WEBHOOK_MATCHED_BY = ['id', 'provider_ref', 'reference', 'transaction', 'cookie'] as const;
export type WebhookMatchedBy = (typeof WEBHOOK_MATCHED_BY)[number];

export const WEBHOOK_LOG_STATUSES = ['processed', 'ignored', 'rejected', 'failed'] as const;
export type WebhookLogStatus = (typeof WEBHOOK_LOG_STATUSES)[number];

export type OrderRow = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderEventRow = typeof orderEvents.$inferSelect;
export type NewOrderEvent = typeof orderEvents.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type WebhookLogRow = typeof webhookLogs.$inferSelect;
export type NewWebhookLog = typeof webhookLogs.$inferInsert;
export type PlatformSettingsRow = typeof platformSettings.$inferSelect;
export type NewPlatformSettings = typeof platformSettings.$inferInsert;
