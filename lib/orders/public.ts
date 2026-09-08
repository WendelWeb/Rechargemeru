/**
 * lib/orders/public.ts — what the tracking page may show.
 *
 * A reference alone reveals nothing personal: `PublicOrder` carries the
 * frozen receipt, the status and masked identity (first name + initial,
 * `+509 •••• 1234`, `je•••@ma•••.com`). The full details (`FullOrder`) are
 * only for a browser whose `rm_order` cookie names this order — set at
 * creation, or by `/suivi` after reference + exact phone — or for the
 * signed-in account the order was placed from.
 *
 * The two time-based facts everyone agrees on are derived here from
 * lib/orders/transitions: `checking` (the « nous vérifions votre paiement »
 * window, during which the page must never offer to pay again) and the
 * derived `expired` status of a stale pending order — `checking` wins, so a
 * customer who just came back from the provider is never told to start
 * over while their payment may still be confirmed.
 */
import { effectiveRateHtg } from '@/lib/pricing/money';
import { maskPhone } from '@/lib/phone';
import { maskMeruAccount } from '@/lib/orders/meru-account';
import { normalizeReference } from '@/lib/orders/reference';
import { inCheckingWindow, isExpired } from '@/lib/orders/transitions';
import type {
  GatewayMode,
  Locale,
  MeruAccountType,
  OrderRow,
  OrderStatus,
  PaymentMethod,
  QuoteLine,
} from '@/lib/orders/types';

export type PublicOrder = {
  reference: string;
  /** Derived: a stale `pending_payment` reads as `expired` unless still `checking`. */
  status: OrderStatus;
  method: PaymentMethod;
  mode: GatewayMode;
  usdCents: number;
  totalHtg: number;
  baseHtg: number;
  feeLines: QuoteLine[];
  fxRateHtg: number;
  effectiveRateHtg: number;
  /** « Jean B. » */
  firstName: string;
  maskedPhone: string;
  maskedMeruAccount: string;
  meruAccountType: MeruAccountType;
  createdAt: Date;
  expiresAt: Date;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  returnedAt: Date | null;
  redirectExpiresAt: Date | null;
  /** A provider redirect was stored (the URL itself is only on `FullOrder`). */
  hasRedirect: boolean;
  locale: Locale;
  orderId: string;
  providerTransactionId: string | null;
  failureReason: string | null;
  /** Inside the verification window: poll, and never offer to pay again. */
  checking: boolean;
};

export type FullOrder = PublicOrder & {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  /**
   * The verified address of the account the order was placed from, or `null`
   * for a guest order. Deliberately absent from `PublicOrder`: a reference
   * shown to a stranger must never name an account, not even masked.
   */
  accountEmail: string | null;
  meruAccount: string;
  meruReference: string | null;
  refundHtg: number | null;
  refundWallet: string | null;
  fulfilledUsdCents: number | null;
  redirectUrl: string | null;
};

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toLocaleUpperCase('fr') + word.slice(1);
}

/** « Jean Baptiste » → « Jean B. », « Widelene » → « Widelene ». */
export function firstNameWithInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  const first = capitalize(parts[0]);
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toLocaleUpperCase('fr')}.`;
}

export function toPublicOrder(o: OrderRow, lastUnpaidAt: Date | null, now: Date = new Date()): PublicOrder {
  const checking = inCheckingWindow(o, lastUnpaidAt, now);
  const status: OrderStatus = !checking && isExpired(o, now) ? 'expired' : o.status;
  return {
    reference: o.reference,
    status,
    method: o.method,
    mode: o.mode,
    usdCents: o.usdCents,
    totalHtg: o.totalHtg,
    baseHtg: o.baseHtg,
    feeLines: o.feeLines,
    fxRateHtg: o.fxRateHtg,
    effectiveRateHtg: effectiveRateHtg(o.totalHtg, o.usdCents),
    firstName: firstNameWithInitial(o.customerName),
    maskedPhone: maskPhone(o.customerPhone),
    maskedMeruAccount: maskMeruAccount(o.meruAccountType, o.meruAccount),
    meruAccountType: o.meruAccountType,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    fulfilledAt: o.fulfilledAt,
    returnedAt: o.returnedAt,
    redirectExpiresAt: o.redirectExpiresAt,
    hasRedirect: typeof o.redirectUrl === 'string' && o.redirectUrl.length > 0,
    locale: o.locale,
    orderId: o.id,
    providerTransactionId: o.providerTransactionId,
    failureReason: o.failureReason,
    checking,
  };
}

export function toFullOrder(o: OrderRow, lastUnpaidAt: Date | null, now: Date = new Date()): FullOrder {
  return {
    ...toPublicOrder(o, lastUnpaidAt, now),
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    accountEmail: o.accountEmail,
    meruAccount: o.meruAccount,
    meruReference: o.meruReference,
    refundHtg: o.refundHtg,
    refundWallet: o.refundWallet,
    fulfilledUsdCents: o.fulfilledUsdCents,
    redirectUrl: o.redirectUrl,
  };
}

/**
 * Who may see the full order: the browser whose `rm_order` cookie names it,
 * or the signed-in account that placed it.
 *
 * The account half is what makes « Mes commandes » worth having. The cookie is
 * set only on the browser that created the order (or passed reference + exact
 * phone through `/suivi`) and lives about an hour and a half; without the
 * second half, a customer opening her own order the next morning — or on her
 * laptop — got the stranger's masked view, with no « Payer maintenant » on an
 * order still waiting to be paid.
 *
 * `viewerUserId` comes from the server session (`currentUserId()`), never from
 * the request, so it grants nothing a forged cookie could not already claim.
 * Two nulls never match: a guest order (`clerkUserId === null`) stays masked
 * for every signed-out visitor.
 */
export function canSeeFullOrder(
  o: Pick<OrderRow, 'reference' | 'clerkUserId'>,
  cookieReference: string | null | undefined,
  viewerUserId: string | null = null,
): boolean {
  if (viewerUserId !== null && viewerUserId.length > 0 && o.clerkUserId === viewerUserId) return true;
  if (!cookieReference) return false;
  return normalizeReference(cookieReference) === o.reference;
}
