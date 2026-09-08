import type { Settings } from './types';

/** Primary key of the single `platform_settings` row. */
export const SETTINGS_ID = 'singleton';

/**
 * Ids of the three fee rules the operator edits by name in
 * `/admin/parametres`: the service percentage, the flat transfer fee in US
 * dollars and the tax percentage. The settings form looks each one up by id,
 * so these strings are part of the contract between the store and the UI —
 * an operator may add other rules, but never rename these.
 */
export const PRICING_RULE_IDS = { service: 'service', transfer: 'transfer', tax: 'tax' } as const;

/**
 * Settings used until the operator saves the singleton row (and merged under
 * it afterwards, so a column added later still has a value). Treat as
 * read-only: spread before editing.
 *
 * The order of `feeRules` is the order the quote engine applies them and the
 * order the receipt prints them: the service percentage on the converted
 * amount, then the 3 $ US transfer fee, then the tax — which is off by
 * default and, being on `subtotal`, taxes the two fees along with the base.
 */
export const DEFAULT_SETTINGS: Settings = {
  fxRateHtg: 140,
  feeRules: [
    {
      id: PRICING_RULE_IDS.service,
      label: 'Frais de service',
      labelHt: 'Frè sèvis',
      kind: 'percent',
      value: 5,
      basis: 'base',
      appliesTo: 'all',
      enabled: true,
    },
    {
      // 300 US cents, converted at the order's own rate: 3 $ US stays 3 $ US.
      id: PRICING_RULE_IDS.transfer,
      label: 'Frais de transfert',
      labelHt: 'Frè transfè',
      kind: 'fixed_usd',
      value: 300,
      basis: 'base',
      appliesTo: 'all',
      enabled: true,
    },
    {
      id: PRICING_RULE_IDS.tax,
      label: 'Taxe',
      labelHt: 'Taks',
      kind: 'percent',
      value: 0,
      basis: 'subtotal',
      appliesTo: 'all',
      enabled: false,
    },
  ],
  amountToleranceHtg: 0,
  minUsdCents: 500,
  maxUsdCents: 1000000,
  orderTtlMinutes: 30,
  adminEmails: [],
  adminWhatsappNumbers: [],
  // `created` is in the admin list on purpose: the operator wants to see an
  // order enter, still unpaid, not only to hear about it once the money has
  // arrived. So the two events that matter — creation and payment — leave on
  // both channels, to the operator and to the customer alike.
  notifyAdminEvents: ['created', 'paid', 'needs_review', 'failed'],
  notifyCustomerEvents: ['created', 'paid', 'fulfilled', 'failed', 'needs_review', 'refunded'],
  meruAccountTypes: ['email', 'username'],
  businessName: 'Recharge Meru',
  supportWhatsapp: null,
  supportHours: '8 h – 20 h, 7 j/7',
  fulfilmentSlaFr: 'moins de 2 heures',
  fulfilmentSlaHt: 'mwens pase 2 èdtan',
  meruHelpFr:
    "Ouvrez l'application Meru, touchez votre profil et copiez l'email ou le nom d'utilisateur de votre compte. C'est cet identifiant que nous utilisons pour vous envoyer les dollars.",
  meruHelpHt:
    'Louvri aplikasyon Meru a, peze pwofil ou epi kopye imel oswa non itilizatè kont ou. Se idantifyan sa a nou itilize pou voye dola yo ba ou.',
  updatedAt: null,
};
