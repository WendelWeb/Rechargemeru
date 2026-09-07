import { PAYMENT_METHODS, type MeruAccountType, type NotificationTemplate, type PaymentMethod } from '@/lib/orders/types';

/**
 * The three shapes a fee can take.
 *
 * - `percent` — a percentage of the rule's `basis`, at most two decimals;
 * - `fixed` — a flat amount already expressed in whole gourdes;
 * - `fixed_usd` — a flat amount in US cents, converted at the order's own
 *   rate. The operator's transfer fee is 3 $ US: it must stay 3 $ US whatever
 *   the gourde does, so it is stored in cents and converted per quote rather
 *   than re-typed after every rate move.
 */
export const FEE_KINDS = ['percent', 'fixed', 'fixed_usd'] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export const FEE_BASES = ['base', 'subtotal'] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const FEE_APPLIES_TO = ['all', ...PAYMENT_METHODS] as const;
export type FeeAppliesTo = 'all' | PaymentMethod;

/**
 * One configurable fee. The unit of `value` follows `kind`: a percentage with
 * at most two decimals (`percent`), whole gourdes (`fixed`), or whole US cents
 * (`fixed_usd`, 300 = 3 $ US). `basis` says whether a percent applies to the
 * converted amount only or to the running subtotal (base plus every line
 * computed before this one); it is ignored by both flat kinds.
 * `minHtg`/`maxHtg` clamp the computed line, always in gourdes.
 *
 * `label` is French and `labelHt` its Kreyòl twin. The receipt is the largest
 * and most trust-carrying thing on the page, so a customer on `/ht` must not
 * read « Frais de service » between « Valè an goud » and « Total pou peye ».
 * `labelHt` is optional — a rule written before it existed, or one the
 * operator has not translated, falls back to `label` rather than showing a
 * blank line.
 */
export type FeeRule = {
  id: string;
  label: string;
  /** The same label in Kreyòl; `null` or absent falls back to `label`. */
  labelHt?: string | null;
  kind: FeeKind;
  value: number;
  basis: FeeBasis;
  minHtg?: number | null;
  maxHtg?: number | null;
  appliesTo: FeeAppliesTo;
  enabled: boolean;
};

/**
 * Operator settings as consumed by the app (defaults merged over the single
 * `platform_settings` row). `updatedAt` is null until the row exists; the
 * quote engine sends it back with each order so a stale quote is refused.
 */
export type Settings = {
  fxRateHtg: number;
  feeRules: FeeRule[];
  amountToleranceHtg: number;
  minUsdCents: number;
  maxUsdCents: number;
  orderTtlMinutes: number;
  adminEmails: string[];
  adminWhatsappNumbers: string[];
  notifyAdminEvents: NotificationTemplate[];
  notifyCustomerEvents: NotificationTemplate[];
  meruAccountTypes: MeruAccountType[];
  businessName: string;
  supportWhatsapp: string | null;
  supportHours: string;
  fulfilmentSlaFr: string;
  fulfilmentSlaHt: string;
  meruHelpFr: string;
  meruHelpHt: string;
  updatedAt: Date | null;
};
