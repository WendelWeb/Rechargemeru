/**
 * lib/orders/create.ts — from a validated request to an order the customer
 * can pay.
 *
 * The receipt the customer saw was computed in their browser from a snapshot
 * of the settings; the same pure `computeQuote` runs here and the order is
 * refused (`quote_changed`, with the fresh quote) when the total or the
 * settings fingerprint differ — BEFORE anything is stored or any provider is
 * called, so nobody is ever debited an amount they did not see.
 *
 * Order of operations: checks → quote → insert (the quote is frozen on the
 * row) → `created` event → provider order → on failure the order goes to
 * `failed` through the compare-and-set and the admin is told; on success the
 * provider's own reference, mode and redirect are stored and the customer is
 * told. Callback URLs derive from the request origin so every Vercel preview
 * stays isolated.
 */
import { z } from 'zod';
import { isUniqueViolation } from '@/db';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import { normalizePhone } from '@/lib/phone';
import { notifyOrder } from '@/lib/notifications/dispatch';
import { appendEvent } from '@/lib/orders/events';
import { normalizeMeruAccount } from '@/lib/orders/meru-account';
import { generateReference } from '@/lib/orders/reference';
import { transitionOrder, updateOrder } from '@/lib/orders/queries';
import { MERU_ACCOUNT_TYPES, PAYMENT_METHODS, type OrderRow, type ProviderId } from '@/lib/orders/types';
import { METHOD_DISPLAY_LABELS, methodAvailable, methodMode } from '@/lib/payments/checkout';
import type { GatewayCreateInput, GatewayFailure, GatewayOrder } from '@/lib/payments/gateway';
import { createMoncashOrder } from '@/lib/payments/moncash';
import { createNatcashOrder } from '@/lib/payments/natcash';
import { isTransient } from '@/lib/payments/retry';
import { computeQuote, type Quote, type QuoteError } from '@/lib/pricing/quote';
import { getSettings, toQuoteSettings } from '@/lib/settings/store';

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().toLowerCase().max(254).pipe(z.email()).nullable().optional(),
);

export const createOrderSchema = z.object({
  usdCents: z.number().int().positive(),
  method: z.enum(PAYMENT_METHODS),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(8).max(20),
  customerEmail: optionalEmail,
  meruAccountType: z.enum(MERU_ACCOUNT_TYPES),
  meruAccount: z.string().trim().min(3).max(120),
  locale: z.enum(['fr', 'ht']),
  expectedTotalHtg: z.number().int().positive(),
  settingsUpdatedAt: z.string().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type CreateOrderError =
  | 'not_configured'
  | 'method_unavailable'
  | 'bad_phone'
  | 'bad_meru_account'
  | 'account_type_disabled'
  | QuoteError
  | 'quote_changed'
  | 'provider_unreachable'
  | 'provider_error'
  | 'db_error';

export type CreateOrderResult =
  | { ok: true; order: OrderRow; redirectUrl: string; quote: Quote }
  | { ok: false; error: CreateOrderError; message?: string; quote?: Quote };

export type CreateOrderContext = CreateOrderInput & {
  /** `req.nextUrl.origin` — the callbacks point back at the deployment that created the order. */
  origin: string;
  hasAdminSession: boolean;
  /**
   * Clerk user id of the signed-in customer, or `null` for a guest order.
   * Guest checkout is the default path and behaves exactly as before; an
   * account only lets the customer find this order again later.
   */
  clerkUserId?: string | null;
  /**
   * The **verified** email of that account (`currentUserEmail()`), or `null`.
   *
   * Like `clerkUserId` it is read from the session by the route and never
   * from the request body — a client that put an address here would otherwise
   * have every order confirmation sent wherever it liked. It is stored beside
   * the address typed into the form, not instead of it, so a confirmation can
   * reach both.
   */
  accountEmail?: string | null;
  /**
   * The visitor-analytics device id (`rm_device` cookie, already checked to
   * be a UUID by the route), or `null`. Read from the cookie and never from
   * the body — `createOrderSchema` has no such key, so Zod drops it — and
   * used for nothing but « which visitors went on to order ».
   */
  deviceId?: string | null;
};

/** How many fresh references to try when one collides (32^8 values: a collision is a curiosity). */
const REFERENCE_ATTEMPTS = 5;
/** How long the stored provider redirect stays offered on the tracking page. */
export const REDIRECT_TTL_MS = 10 * 60_000;

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

async function createProviderOrder(
  method: CreateOrderInput['method'],
  input: GatewayCreateInput,
): Promise<(GatewayOrder & { provider: ProviderId }) | GatewayFailure> {
  if (method === 'moncash') return createMoncashOrder(input);
  const result = await createNatcashOrder(input);
  return result.ok ? { ...result, provider: 'kobara' } : result;
}

async function insertOrder(values: Omit<typeof schema.orders.$inferInsert, 'reference'>): Promise<OrderRow | null> {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const [row] = await db
        .insert(schema.orders)
        .values({ ...values, reference: generateReference() })
        .returning();
      if (row) return row;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === REFERENCE_ATTEMPTS - 1) throw err;
    }
  }
  return null;
}

export async function createOrder(input: CreateOrderContext): Promise<CreateOrderResult> {
  if (!dbConfigured()) return { ok: false, error: 'not_configured' };
  if (!methodAvailable(input.method, input.hasAdminSession)) return { ok: false, error: 'method_unavailable' };

  const customerPhone = normalizePhone(input.customerPhone);
  if (!customerPhone) return { ok: false, error: 'bad_phone' };

  const settings = await getSettings();
  if (!settings.meruAccountTypes.includes(input.meruAccountType)) return { ok: false, error: 'account_type_disabled' };

  const meruAccount = normalizeMeruAccount(input.meruAccountType, input.meruAccount);
  if (!meruAccount) return { ok: false, error: 'bad_meru_account' };

  const quoted = computeQuote({ usdCents: input.usdCents, method: input.method, settings: toQuoteSettings(settings) });
  if (!quoted.ok) return { ok: false, error: quoted.error };
  const { quote } = quoted;
  if (quote.totalHtg !== input.expectedTotalHtg || quote.settingsUpdatedAt !== input.settingsUpdatedAt) {
    return { ok: false, error: 'quote_changed', quote };
  }

  const now = new Date();
  let order: OrderRow;
  try {
    const inserted = await insertOrder({
      status: 'pending_payment',
      method: input.method,
      mode: methodMode(input.method),
      usdCents: quote.usdCents,
      fxRateHtg: quote.fxRateHtg,
      baseHtg: quote.baseHtg,
      feeLines: quote.lines,
      totalHtg: quote.totalHtg,
      clerkUserId: input.clerkUserId ?? null,
      accountEmail: input.accountEmail ?? null,
      deviceId: input.deviceId ?? null,
      customerName: input.customerName.trim(),
      customerPhone,
      customerEmail: input.customerEmail ?? null,
      meruAccountType: input.meruAccountType,
      meruAccount,
      locale: input.locale,
      expiresAt: new Date(now.getTime() + settings.orderTtlMinutes * 60_000),
    });
    if (!inserted) return { ok: false, error: 'db_error', message: 'reference_collision' };
    order = inserted;
  } catch (err) {
    console.error(`[orders/create] insert failed: ${errorText(err)}`);
    return { ok: false, error: 'db_error', message: errorText(err) };
  }

  await appendEvent({
    orderId: order.id,
    type: 'created',
    actor: 'customer',
    message: `Commande créée : ${quote.usdCents} cents pour ${quote.totalHtg} HTG par ${METHOD_DISPLAY_LABELS[input.method]}`,
    data: {
      usdCents: quote.usdCents,
      totalHtg: quote.totalHtg,
      baseHtg: quote.baseHtg,
      fxRateHtg: quote.fxRateHtg,
      method: input.method,
      mode: order.mode,
      locale: input.locale,
      settingsUpdatedAt: quote.settingsUpdatedAt,
    },
  });

  const origin = input.origin.replace(/\/+$/, '');
  const result = await createProviderOrder(input.method, {
    orderId: order.id,
    amountHtg: quote.totalHtg,
    description: `Recharge Meru ${order.reference}`,
    successUrl: `${origin}/api/payments/${input.method}/retour?orderId=${order.id}`,
    errorUrl: `${origin}/${input.locale}/commande/${order.reference}?cancelled=1`,
    webhookUrl: `${origin}/api/webhooks/${input.method}?orderId=${order.id}`,
  });

  if (!result.ok) {
    const transient = isTransient(result.message);
    const label = METHOD_DISPLAY_LABELS[input.method];
    const failureReason = transient
      ? `Fournisseur ${label} injoignable (${result.message})`
      : `Erreur du fournisseur ${label} : ${result.message}`;
    let failed: OrderRow | null = null;
    try {
      failed = await transitionOrder(order.id, 'failed', { failureReason });
    } catch (err) {
      console.error(`[orders/create] failed transition for ${order.id}: ${errorText(err)}`);
    }
    await appendEvent({
      orderId: order.id,
      type: 'provider_error',
      actor: 'provider',
      message: failureReason,
      data: { method: input.method, message: result.message, transient },
    });
    if (failed) {
      await appendEvent({
        orderId: order.id,
        type: 'status_changed',
        actor: 'system',
        message: 'pending_payment → failed',
        data: { from: 'pending_payment', to: 'failed', reason: failureReason },
      });
      await notifyOrder(failed, 'failed');
    }
    return { ok: false, error: transient ? 'provider_unreachable' : 'provider_error', message: result.message, quote };
  }

  let ready: OrderRow | null = null;
  try {
    ready = await updateOrder(order.id, {
      provider: result.provider,
      providerRef: result.providerRef,
      mode: result.mode,
      redirectUrl: result.redirectUrl,
      redirectExpiresAt: new Date(Date.now() + REDIRECT_TTL_MS),
    });
  } catch (err) {
    console.error(`[orders/create] redirect update failed for ${order.id}: ${errorText(err)}`);
  }
  if (!ready) {
    const failureReason = 'Impossible d’enregistrer la redirection du fournisseur';
    let failed: OrderRow | null = null;
    try {
      failed = await transitionOrder(order.id, 'failed', { failureReason });
    } catch (err) {
      console.error(`[orders/create] failed transition for ${order.id}: ${errorText(err)}`);
    }
    await appendEvent({ orderId: order.id, type: 'provider_error', actor: 'system', message: failureReason, data: { provider: result.provider } });
    if (failed) await notifyOrder(failed, 'failed');
    return { ok: false, error: 'db_error', message: 'redirect_not_stored', quote };
  }

  await appendEvent({
    orderId: order.id,
    type: 'redirect_issued',
    actor: 'provider',
    message: `Redirection ${METHOD_DISPLAY_LABELS[input.method]} émise (${result.provider}, ${result.mode})`,
    data: { provider: result.provider, providerRef: result.providerRef, mode: result.mode, redirectExpiresAt: ready.redirectExpiresAt },
  });
  await notifyOrder(ready, 'created');

  return { ok: true, order: ready, redirectUrl: result.redirectUrl, quote };
}
