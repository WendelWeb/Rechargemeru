/**
 * lib/payments/gateway.ts — what every Haitian mobile-money rail has in common.
 *
 * MonCash and NatCash are different companies with different APIs, but from
 * this platform's side they are the same shape, because the underlying product
 * is the same: charge in WHOLE GOURDES, send the customer to a hosted page,
 * then find out afterwards whether the money actually moved.
 *
 * The money arithmetic is deliberately NOT defined here. `usdCentsToHtg` and
 * `HTG_WALLET_MAX` live in lib/pricing/money.ts — the single USD→HTG rule the
 * quote engine, the order freeze and the providers all share — and are only
 * re-exported so provider code has one import path. Two rails computing the
 * conversion two ways is how a page advertises one figure and debits another.
 */
export { HTG_WALLET_MAX, usdCentsToHtg } from '@/lib/pricing/money';

/** Which environment a rail's current credentials point at. */
export type GatewayMode = 'sandbox' | 'live';

/** Every failure is a message, never an exception — see the provider contracts. */
export type GatewayFailure = { ok: false; message: string };

/** A created order, ready for the customer's browser. */
export type GatewayOrder = {
  ok: true;
  /** Where to send the customer to pay. */
  redirectUrl: string;
  /**
   * What THIS provider needs to look the payment up later.
   *
   * It is NOT always our own order id: Digicel looks a payment up by the id
   * WE chose, while Bazik and Kobara mint their own and only answer to that.
   * Callers must persist whatever comes back here (`orders.provider_ref`)
   * rather than assuming they can re-derive it.
   */
  providerRef: string;
  mode: GatewayMode;
};

/** What a provider reports about an order after the fact. */
export type GatewayPayment = {
  ok: true;
  /** True ONLY when the provider says the money actually moved. */
  paid: boolean;
  /** The provider's own transaction id, for support and reconciliation. */
  transactionId: string | null;
  /** Gourdes the provider reports as charged. */
  amountHtg: number | null;
  /** The paying wallet, when the provider discloses it. */
  payer: string | null;
  raw: unknown;
};

export type GatewayCreateInput = {
  /** OUR reference — the `orders` row id. Always sent along. */
  orderId: string;
  /** Whole gourdes. Neither MonCash nor NatCash has a sub-unit. */
  amountHtg: number;
  /** Shown to the customer on the provider's page, when it supports a label. */
  description?: string;
  /** Where to send the customer back, and where to notify us. Providers that
   *  fix these in a merchant portal (Digicel) simply ignore them, which keeps
   *  call sites free of provider knowledge. */
  successUrl?: string;
  errorUrl?: string;
  webhookUrl?: string;
};
