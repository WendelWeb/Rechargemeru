/**
 * lib/orders/settle.ts — the single path from « the provider says paid » to
 * `paid`. Spec §7.
 *
 * Every caller — the MonCash callbacks, the NatCash webhook, the customer's
 * return, the tracking page's recheck, the admin's « Re-vérifier », the
 * cron — goes through here, and it is safe to call any number of times for
 * the same order: whichever call wins the compare-and-set grants, every
 * other one answers `already` and notifies nothing.
 *
 * What counts as proof:
 * - MonCash: the provider's OWN answer to `retrieveMoncashOrderFrom` for the
 *   provider that created the order — never the callback's query string.
 * - NatCash: the signed webhook (`opts.proof`, verified by the route). A
 *   plain read (`checkKobaraOrder`) only reaches `paid` on a STRICT match
 *   (the id read is our `provider_ref`, `metadata.order_id` is our order id,
 *   the amount conforms); anything looser lands in `needs_review`.
 *
 * A confirmed payment that is late (deadline passed, or the order already
 * left `pending_payment`), short (amount below total minus tolerance),
 * unreported (no amount) or non-strict is `needs_review`, never silently
 * `paid`: the operator looks before dollars move. Sandbox orders follow the
 * same rules; their notifications carry the TEST prefix (templates) and the
 * recharge queues exclude them (queries).
 *
 * NEVER THROWS. Dependencies are injected for the unit tests; production
 * uses `defaultSettleDeps()`.
 */
import { dbConfigured } from '@/lib/env';
import { formatHtg } from '@/lib/format';
import { appendEvent, lastEventOfType, type OrderEventInput, type OrderEventType } from '@/lib/orders/events';
import { transitionOrder, updateOrder, getOrderById } from '@/lib/orders/queries';
import { isExpired } from '@/lib/orders/transitions';
import type { Actor, NewOrder, NotificationTemplate, OrderEventRow, OrderRow, OrderStatus } from '@/lib/orders/types';
import { notifyOrder } from '@/lib/notifications/dispatch';
import type { GatewayFailure } from '@/lib/payments/gateway';
import { retrieveMoncashOrderFrom, type MoncashFailure, type MoncashPayment, type MoncashProviderId } from '@/lib/payments/moncash';
import { retrieveNatcashOrder, type NatcashPayment } from '@/lib/payments/natcash';
import { DEFAULT_RETRY_DELAYS_MS, isTransient, paymentSettled, retrieveWithRetry } from '@/lib/payments/retry';
import { getSettings } from '@/lib/settings/store';

export type SettleSource = 'webhook' | 'retour' | 'recheck' | 'admin' | 'cron';

export type SettleStatus =
  | 'granted'
  | 'already'
  | 'unpaid'
  | 'pending'
  | 'review'
  | 'unknown_order'
  | 'not_configured'
  | 'error';

/** A payment the caller has already authenticated (the signed NatCash webhook). */
export type SettleProof = {
  paid: boolean;
  amountHtg: number | null;
  transactionId: string | null;
  payer: string | null;
  raw?: unknown;
};

export type SettleOptions = {
  proof?: SettleProof;
  actor: Actor;
  source: SettleSource;
  /** Ask again (400 / 900 ms) when the provider still says « not paid » — for the customer's own return. */
  retryOnUnpaid?: boolean;
};

export type SettleResult = {
  status: SettleStatus;
  /** The order as it stands after this call, when it could be loaded. */
  order: OrderRow | null;
  /** The provider's raw failure message, for `error` / `not_configured`. */
  message?: string;
};

export type SettleDeps = {
  loadOrder: (id: string) => Promise<OrderRow | null>;
  transitionOrder: (id: string, to: OrderStatus, patch: Partial<NewOrder>) => Promise<OrderRow | null>;
  updateOrder: (id: string, patch: Partial<NewOrder>) => Promise<OrderRow | null>;
  appendEvent: (ev: OrderEventInput) => Promise<unknown>;
  lastEventOfType: (orderId: string, type: OrderEventType) => Promise<OrderEventRow | null>;
  retrieveMoncash: (providerId: MoncashProviderId | null, providerRef: string) => Promise<MoncashPayment | MoncashFailure>;
  retrieveNatcash: (providerRef: string) => Promise<NatcashPayment | GatewayFailure>;
  notify: (order: OrderRow, template: NotificationTemplate) => Promise<unknown>;
  now: () => Date;
  retryDelaysMs?: readonly number[];
  amountToleranceHtg: () => Promise<number>;
  /** False when no database is reachable; production reads `DATABASE_URL`. */
  dbConfigured?: () => boolean;
};

/** Statuses that already carry a verified payment — no provider call, answer `already`. */
const SETTLED_STATUSES: readonly OrderStatus[] = ['paid', 'fulfilled', 'needs_review'];

/** Provider failures that mean « nothing can be asked », not « something went wrong ». */
const UNCONFIGURED_MESSAGES = new Set(['not_configured', 'order_provider_unavailable']);

/** At most one `verified_unpaid` event per order in this many milliseconds. */
export const UNPAID_EVENT_INTERVAL_MS = 5 * 60_000;

export function defaultSettleDeps(): SettleDeps {
  return {
    loadOrder: getOrderById,
    transitionOrder,
    updateOrder,
    appendEvent,
    lastEventOfType,
    retrieveMoncash: retrieveMoncashOrderFrom,
    retrieveNatcash: retrieveNatcashOrder,
    notify: (order, template) => notifyOrder(order, template),
    now: () => new Date(),
    retryDelaysMs: DEFAULT_RETRY_DELAYS_MS,
    amountToleranceHtg: async () => (await getSettings()).amountToleranceHtg,
    dbConfigured,
  };
}

/** What settlement learnt about the payment, whichever rail answered. */
type Verified = {
  paid: boolean;
  amountHtg: number | null;
  transactionId: string | null;
  payer: string | null;
  /** True when this answer alone may grant `paid` (MonCash read, signed webhook, strict NatCash match). */
  strict: boolean;
  strictReason: string | null;
};

type Verification = { ok: true; verified: Verified } | { ok: false; message: string };

function moncashProviderId(provider: OrderRow['provider']): MoncashProviderId | null {
  return provider === 'direct' || provider === 'bazik' ? provider : null;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Whether `amount` is at least the total minus the operator's tolerance. */
function amountConforms(amount: number | null, totalHtg: number, tolerance: number): boolean {
  return amount !== null && amount >= totalHtg - tolerance;
}

async function verifyMoncash(order: OrderRow, opts: SettleOptions, deps: SettleDeps): Promise<Verification> {
  const providerRef = order.providerRef ?? order.id;
  const providerId = moncashProviderId(order.provider);
  const answer = await retrieveWithRetry(
    () => deps.retrieveMoncash(providerId, providerRef),
    (r) => paymentSettled(r, { retryOnUnpaid: opts.retryOnUnpaid }),
    deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
  );
  if (!answer.ok) return { ok: false, message: answer.message };
  return {
    ok: true,
    verified: {
      paid: answer.paid,
      amountHtg: answer.amountHtg,
      transactionId: answer.transactionId,
      payer: answer.payer,
      strict: true,
      strictReason: null,
    },
  };
}

async function verifyNatcash(order: OrderRow, opts: SettleOptions, deps: SettleDeps, tolerance: number): Promise<Verification> {
  const providerRef = order.providerRef;
  if (!providerRef) return { ok: false, message: 'unsupported_by_provider' };
  const answer = await retrieveWithRetry(
    () => deps.retrieveNatcash(providerRef),
    (r) => paymentSettled(r, { retryOnUnpaid: opts.retryOnUnpaid }),
    deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
  );
  if (!answer.ok) return { ok: false, message: answer.message };
  const mismatches: string[] = [];
  if (answer.matchedPaymentId !== providerRef) mismatches.push('identifiant de paiement différent de la référence enregistrée');
  if (answer.matchedOrderId !== order.id) mismatches.push('metadata.order_id absent ou différent de la commande');
  if (!amountConforms(answer.amountHtg, order.totalHtg, tolerance)) mismatches.push('montant non conforme');
  return {
    ok: true,
    verified: {
      paid: answer.paid,
      amountHtg: answer.amountHtg,
      transactionId: answer.transactionId,
      payer: answer.payer,
      strict: mismatches.length === 0,
      strictReason: mismatches.length > 0 ? `Lecture NatCash sans webhook signé : ${mismatches.join(' ; ')}` : null,
    },
  };
}

/**
 * Verifies `orderId` against its provider (or the given proof) and moves it
 * to `paid` or `needs_review` when the money really moved. See the module
 * header for the rules; never throws.
 */
export async function settleOrder(
  orderId: string,
  opts: SettleOptions,
  deps: SettleDeps = defaultSettleDeps(),
): Promise<SettleResult> {
  try {
    if (deps.dbConfigured && !deps.dbConfigured()) return { status: 'not_configured', order: null };

    const order = await deps.loadOrder(orderId);
    if (!order) return { status: 'unknown_order', order: null };
    if (SETTLED_STATUSES.includes(order.status)) return { status: 'already', order };

    const now = deps.now();
    const tolerance = await deps.amountToleranceHtg();

    // Step 3 — proof, or ask the provider that created the order.
    let verification: Verification;
    if (opts.proof) {
      verification = {
        ok: true,
        verified: {
          paid: opts.proof.paid,
          amountHtg: opts.proof.amountHtg,
          transactionId: opts.proof.transactionId,
          payer: opts.proof.payer,
          strict: true,
          strictReason: null,
        },
      };
    } else if (order.method === 'moncash') {
      verification = await verifyMoncash(order, opts, deps);
    } else {
      verification = await verifyNatcash(order, opts, deps, tolerance);
    }

    // Always: the order was checked, whatever the answer.
    const attempts = order.verifyAttempts + 1;
    const checked = (await deps.updateOrder(order.id, { lastVerifiedAt: now, verifyAttempts: attempts })) ?? {
      ...order,
      lastVerifiedAt: now,
      verifyAttempts: attempts,
    };

    // Step 4 — the provider could not be read.
    if (!verification.ok) {
      const { message } = verification;
      if (order.method === 'natcash' && message === 'unsupported_by_provider') return { status: 'pending', order: checked };
      const status: SettleStatus = UNCONFIGURED_MESSAGES.has(message) ? 'not_configured' : 'error';
      await deps.appendEvent({
        orderId: order.id,
        type: 'verification_failed',
        actor: opts.actor,
        message: `Vérification impossible (${opts.source}) : ${message}`,
        data: { source: opts.source, provider: order.provider, message },
      });
      return { status, order: checked, message };
    }

    const { verified } = verification;

    // Step 5 — not paid: one event per five minutes, no state change.
    if (!verified.paid) {
      const last = await deps.lastEventOfType(order.id, 'verified_unpaid');
      const lastAt = last?.createdAt instanceof Date ? last.createdAt.getTime() : null;
      if (lastAt === null || now.getTime() - lastAt >= UNPAID_EVENT_INTERVAL_MS) {
        await deps.appendEvent({
          orderId: order.id,
          type: 'verified_unpaid',
          actor: opts.actor,
          message: `Paiement non confirmé par le fournisseur (${opts.source})`,
          data: { source: opts.source, provider: order.provider, attempt: attempts },
        });
      }
      return { status: 'unpaid', order: checked };
    }

    // Step 6 — paid: decide between `paid` and `needs_review`.
    const amount = verified.amountHtg;
    const late = order.status !== 'pending_payment' || isExpired(order, now);
    const expiredLate = order.status === 'expired' || isExpired(order, now);
    const unreported = amount === null;
    const short = amount === null || amount < order.totalHtg - tolerance;
    const over = amount !== null && amount > order.totalHtg;

    const reasons: string[] = [];
    if (unreported) reasons.push('Montant reçu non communiqué par le fournisseur');
    else if (short) reasons.push(`Montant reçu ${formatHtg(amount)} inférieur au montant attendu ${formatHtg(order.totalHtg)}`);
    if (order.status === 'refunded') reasons.push('Paiement reçu après remboursement');
    else if (expiredLate) reasons.push('Paiement confirmé après expiration de la commande');
    else if (late) reasons.push(`Paiement confirmé alors que la commande était « ${order.status} »`);
    if (!verified.strict && verified.strictReason) reasons.push(verified.strictReason);

    const target: OrderStatus = late || short || !verified.strict ? 'needs_review' : 'paid';
    const patch: Partial<NewOrder> = {
      paidHtg: amount,
      paidAt: now,
      lastVerifiedAt: now,
      providerTransactionId: verified.transactionId ?? order.providerTransactionId,
      payerWallet: verified.payer ?? order.payerWallet,
      ...(target === 'needs_review' ? { failureReason: reasons.join(' ; ') } : {}),
    };

    const updated = await deps.transitionOrder(order.id, target, patch);
    if (!updated) return { status: 'already', order: checked };

    // Events and notification only after a successful compare-and-set.
    const detail = {
      source: opts.source,
      provider: order.provider,
      amountHtg: amount,
      totalHtg: order.totalHtg,
      toleranceHtg: tolerance,
      transactionId: verified.transactionId,
      payer: verified.payer,
      strict: verified.strict,
      late,
      short,
      over,
      previousStatus: order.status,
    };
    await deps.appendEvent({
      orderId: order.id,
      type: 'verified_paid',
      actor: opts.actor,
      message: `Paiement confirmé par le fournisseur (${opts.source})${amount !== null ? ` : ${formatHtg(amount)}` : ''}`,
      data: detail,
    });
    if (unreported) {
      await deps.appendEvent({
        orderId: order.id,
        type: 'amount_unreported',
        actor: opts.actor,
        message: 'Le fournisseur n’a pas communiqué le montant reçu',
        data: { totalHtg: order.totalHtg },
      });
    } else if (short || over) {
      await deps.appendEvent({
        orderId: order.id,
        type: 'amount_mismatch',
        actor: opts.actor,
        message: `Montant reçu ${formatHtg(amount)} pour un total attendu de ${formatHtg(order.totalHtg)}`,
        data: { amountHtg: amount, totalHtg: order.totalHtg, toleranceHtg: tolerance, short, over },
      });
    }
    if (order.status === 'refunded') {
      await deps.appendEvent({
        orderId: order.id,
        type: 'paid_after_refund',
        actor: opts.actor,
        message: 'Paiement reçu après remboursement',
        data: { refundHtg: order.refundHtg, refundWallet: order.refundWallet },
      });
    } else if (expiredLate) {
      await deps.appendEvent({
        orderId: order.id,
        type: 'paid_after_expiry',
        actor: opts.actor,
        message: 'Paiement confirmé après expiration de la commande',
        data: { expiresAt: order.expiresAt, previousStatus: order.status },
      });
    }
    await deps.appendEvent({
      orderId: order.id,
      type: 'status_changed',
      actor: opts.actor,
      message: `${order.status} → ${target}`,
      data: { from: order.status, to: target, source: opts.source },
    });
    await deps.notify(updated, target === 'paid' ? 'paid' : 'needs_review');

    return { status: target === 'paid' ? 'granted' : 'review', order: updated };
  } catch (err) {
    const message = errorText(err);
    console.error(`[orders/settle] ${orderId} (${opts.source}) failed: ${message}`);
    return { status: 'error', order: null, message };
  }
}

/** True when a settle answer means the provider had a bad minute rather than an answer. */
export function settleTransient(result: SettleResult): boolean {
  return result.status === 'error' && typeof result.message === 'string' && isTransient(result.message);
}
