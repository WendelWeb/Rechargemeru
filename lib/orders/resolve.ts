/**
 * lib/orders/resolve.ts — which order a callback or a return is about.
 *
 * Providers hand back different handles: our own order id (query string we
 * chose), their own reference (`provider_ref`), the customer-facing
 * `MR-…` reference, Digicel's transaction id (its fixed return URL carries
 * nothing else — resolved by asking Digicel which order it belongs to), or
 * nothing at all but the `rm_order` cookie. The attempts run in that order
 * and the winner is recorded as `webhook_logs.matched_by`, so a mismatch
 * can be audited later. Never throws: an unreadable hint is `null`.
 */
import { getOrderById, getOrderByProviderRef, getOrderByReference } from '@/lib/orders/queries';
import type { OrderRow, WebhookMatchedBy } from '@/lib/orders/types';
import { retrieveMoncashByTransactionId } from '@/lib/payments/moncash';

export type ResolveHint = {
  orderId?: string | null;
  providerRef?: string | null;
  reference?: string | null;
  transactionId?: string | null;
  cookieReference?: string | null;
};

export type ResolvedOrder = { order: OrderRow; matchedBy: WebhookMatchedBy };

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveOrder(hint: ResolveHint): Promise<ResolvedOrder | null> {
  try {
    const orderId = clean(hint.orderId);
    if (orderId) {
      const order = await getOrderById(orderId);
      if (order) return { order, matchedBy: 'id' };
    }

    const providerRef = clean(hint.providerRef);
    if (providerRef) {
      const order = await getOrderByProviderRef(providerRef);
      if (order) return { order, matchedBy: 'provider_ref' };
    }

    const reference = clean(hint.reference);
    if (reference) {
      const order = await getOrderByReference(reference);
      if (order) return { order, matchedBy: 'reference' };
    }

    const transactionId = clean(hint.transactionId);
    if (transactionId) {
      const payment = await retrieveMoncashByTransactionId(transactionId);
      if (payment.ok && payment.orderId) {
        const order = await getOrderById(payment.orderId);
        if (order) return { order, matchedBy: 'transaction' };
      }
    }

    const cookieReference = clean(hint.cookieReference);
    if (cookieReference) {
      const order = await getOrderByReference(cookieReference);
      if (order) return { order, matchedBy: 'cookie' };
    }

    return null;
  } catch (err) {
    console.error(`[orders/resolve] failed: ${err instanceof Error && err.message ? err.message : String(err)}`);
    return null;
  }
}
