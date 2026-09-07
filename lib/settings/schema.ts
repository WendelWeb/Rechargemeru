import { z } from 'zod';
import { MERU_ACCOUNT_TYPES, NOTIFICATION_TEMPLATES } from '@/lib/orders/types';
import { FEE_APPLIES_TO, FEE_BASES, FEE_KINDS } from './types';

/** Upper bound of a single mobile-money payment in Haiti (gourdes). */
const HTG_WALLET_MAX = 75_000;

/** Upper bound of a `fixed_usd` fee: 1 000 $ US, in US cents. */
const USD_CENTS_MAX = 100_000;

/** E.164 as accepted everywhere in the app (`+` then 7 to 15 digits, no leading zero). */
export const E164_RE = /^\+[1-9]\d{6,14}$/;

/** True when `value` carries at most `decimals` decimal places (2.55 → 2 ok, 2.555 → 2 no). */
export function hasAtMostDecimals(value: number, decimals: number): boolean {
  if (!Number.isFinite(value)) return false;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor === value;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

const boundHtg = z.number().int('Nombre entier de gourdes attendu').min(0).max(HTG_WALLET_MAX).nullable().optional();

export const feeRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Identifiant requis')
      .max(40)
      .regex(/^[a-z0-9_-]+$/i, 'Lettres, chiffres, tirets et soulignés uniquement'),
    label: z.string().trim().min(1, 'Libellé requis').max(60),
    // Optional by design: an untranslated rule reads its French label on
    // `/ht` rather than showing an empty line on the receipt. Blank means
    // « not translated », so it is stored as null, never as ''.
    labelHt: z
      .string()
      .trim()
      .max(60, 'Au plus 60 caractères')
      .nullable()
      .optional()
      .transform((value) => (value === undefined || value === '' ? null : value)),
    kind: z.enum(FEE_KINDS),
    value: z.number().finite().min(0, 'La valeur ne peut pas être négative'),
    basis: z.enum(FEE_BASES),
    minHtg: boundHtg,
    maxHtg: boundHtg,
    appliesTo: z.enum(FEE_APPLIES_TO),
    enabled: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    if (rule.kind === 'percent') {
      if (rule.value > 100) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'Un pourcentage ne dépasse pas 100' });
      } else if (!hasAtMostDecimals(rule.value, 2)) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'Au plus deux décimales' });
      }
    } else if (rule.kind === 'fixed_usd') {
      // Stored in US cents so the line stays worth the same dollars at any rate.
      if (!Number.isInteger(rule.value) || rule.value > USD_CENTS_MAX) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: `Montant fixe en cents US entiers, au plus ${USD_CENTS_MAX} (1 000 $ US)`,
        });
      }
    } else if (!Number.isInteger(rule.value) || rule.value > HTG_WALLET_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Montant fixe en gourdes entières, au plus ${HTG_WALLET_MAX}`,
      });
    }
    if (rule.minHtg != null && rule.maxHtg != null && rule.minHtg > rule.maxHtg) {
      ctx.addIssue({ code: 'custom', path: ['maxHtg'], message: 'Le maximum doit être supérieur ou égal au minimum' });
    }
  });

const emailList = z
  .array(z.string().trim().toLowerCase().pipe(z.email('Adresse email invalide')))
  .max(10, 'Au plus dix adresses')
  .transform(unique);

const whatsappList = z
  .array(z.string().trim().regex(E164_RE, 'Numéro au format international attendu, ex. +50937001234'))
  .max(10, 'Au plus dix numéros')
  .transform(unique);

const optionalWhatsapp = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.string().regex(E164_RE, 'Numéro au format international attendu, ex. +50937001234').nullable());

const templateList = z.array(z.enum(NOTIFICATION_TEMPLATES)).transform(unique);

const shortText = (max: number) => z.string().trim().min(1, 'Texte requis').max(max);

export const settingsInputSchema = z
  .object({
    fxRateHtg: z
      .number()
      .finite('Taux invalide')
      .gt(0, 'Le taux doit être positif')
      .max(10000, 'Taux trop élevé')
      .refine((value) => hasAtMostDecimals(value, 4), 'Au plus quatre décimales'),
    feeRules: z
      .array(feeRuleSchema)
      .max(20, 'Au plus vingt règles')
      .refine((rules) => unique(rules.map((r) => r.id)).length === rules.length, 'Identifiants de règles en double'),
    amountToleranceHtg: z.number().int('Nombre entier de gourdes attendu').min(0).max(5000, 'Au plus 5 000 HTG'),
    minUsdCents: z.number().int('Montant en cents entiers attendu').min(100, 'Au moins 1 $ US'),
    maxUsdCents: z.number().int('Montant en cents entiers attendu').max(1_000_000, 'Au plus 10 000 $ US'),
    orderTtlMinutes: z.number().int().min(5, 'Au moins 5 minutes').max(1440, 'Au plus 24 heures'),
    adminEmails: emailList,
    adminWhatsappNumbers: whatsappList,
    notifyAdminEvents: templateList,
    notifyCustomerEvents: templateList,
    meruAccountTypes: z
      .array(z.enum(MERU_ACCOUNT_TYPES))
      .transform(unique)
      .pipe(z.array(z.enum(MERU_ACCOUNT_TYPES)).min(1, 'Au moins un type d’identifiant Meru')),
    businessName: shortText(60),
    supportWhatsapp: optionalWhatsapp,
    supportHours: shortText(80),
    fulfilmentSlaFr: shortText(80),
    fulfilmentSlaHt: shortText(80),
    meruHelpFr: shortText(600),
    meruHelpHt: shortText(600),
  })
  .superRefine((settings, ctx) => {
    if (settings.maxUsdCents < settings.minUsdCents) {
      ctx.addIssue({ code: 'custom', path: ['maxUsdCents'], message: 'Le maximum doit être supérieur ou égal au minimum' });
    }
  });

export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type FeeRuleInput = z.infer<typeof feeRuleSchema>;
