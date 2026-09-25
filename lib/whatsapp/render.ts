/**
 * lib/whatsapp/render.ts — from an order to the exact text a customer reads.
 *
 * Two halves, so the menu can re-render instantly in the browser when the
 * operator changes the tone, the language or the emojis:
 *
 *   - `buildWhatsAppKit(order, ctx)` runs on the server: it picks the
 *     messages this order may receive and formats its facts in BOTH
 *     languages (`vars.fr`, `vars.ht`). Small, serialisable, no text yet.
 *   - `renderMessage(entry, vars, options, style)` runs anywhere: it takes
 *     the operator's rewrite if he coached one (else the built-in text),
 *     fills it, adds his joke (fun tone), his closing line and the automatic
 *     footer, and strips the emojis if he turned them off.
 *
 * THREE RULES the tests hold:
 *   1. THE LANGUAGE IS THE CUSTOMER'S by default (`order.locale`); the
 *      operator may switch it, the facts follow.
 *   2. NO MESSAGE PROMISES WHAT IS NOT TRUE: a message that asserts a fact is
 *      offered only in the states where it is true (`availableFor`).
 *   3. A TEST ORDER GETS NOTHING: writing to someone about fictional money is
 *      the fastest way to lose their trust.
 */
import { TIME_ZONE, formatDateTime, formatHtg, formatUsd, formatUsdShort } from '@/lib/format';
import type { OrderRow, OrderStatus } from '@/lib/orders/types';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { CATALOGUE, catalogueEntry } from '@/lib/whatsapp/catalogue';
import { fillTemplate, stripEmojis } from '@/lib/whatsapp/template';
import {
  overrideKey,
  type CatalogueEntry,
  type TemplateVars,
  type WhatsAppLocale,
  type WhatsAppStyle,
  type WhatsAppTone,
} from '@/lib/whatsapp/types';

/** Everything but the signature, which depends on the operator's coaching. */
export type OrderVars = Omit<TemplateVars, 'moi'>;

export type WhatsAppContext = {
  businessName: string;
  /** Public root, for links. No trailing slash. */
  siteUrl: string;
  slaFr: string;
  slaHt: string;
  supportHours: string;
  minUsdCents: number;
};

export type WhatsAppKit = {
  orderId: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  /** The customer's language: the menu opens in it. */
  locale: WhatsAppLocale;
  businessName: string;
  vars: Record<WhatsAppLocale, OrderVars>;
  /** The messages this order may receive, recommended first, catalogue order otherwise. */
  entries: { id: string; recommended: boolean }[];
};

export type RenderOptions = { tone: WhatsAppTone; locale: WhatsAppLocale; emojis: boolean };

const PARAGRAPH = '\n\n';

const METHOD_LABEL: Record<OrderRow['method'], string> = { moncash: 'MonCash', natcash: 'NatCash' };

/** « Jean Baptiste » → « Jean ». A first name sounds right, not familiar. */
export function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first || full.trim();
}

const HT_MONTHS = ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm'];

const numericParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * « 25 sept. 2026, 14:35 » in French, « 25 septanm 2026, 14:35 » in Kreyòl —
 * a customer reading Kreyòl should not meet a French month in the middle of
 * the sentence. Port-au-Prince time either way.
 */
export function formatDeadline(date: Date, locale: WhatsAppLocale): string {
  if (locale === 'fr') return formatDateTime(date);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(numericParts.formatToParts(date).map((p) => [p.type, p.value]));
  const month = HT_MONTHS[Number(parts.month) - 1] ?? parts.month;
  return `${parts.day} ${month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

/** The order's facts, formatted in one language. */
export function orderVars(order: OrderRow, ctx: WhatsAppContext, locale: WhatsAppLocale): OrderVars {
  return {
    prenom: firstName(order.customerName),
    nom: order.customerName.trim(),
    reference: order.reference,
    montant_usd: formatUsd(order.fulfilledUsdCents ?? order.usdCents, locale),
    montant_htg: formatHtg(order.totalHtg),
    montant_recu: formatHtg(order.paidHtg ?? order.totalHtg),
    methode: METHOD_LABEL[order.method],
    compte_meru: order.meruAccount,
    ref_meru: order.meruReference?.trim() ?? '',
    transaction: order.providerTransactionId?.trim() ?? '',
    lien_suivi: `${ctx.siteUrl}/${locale}/commande/${order.reference}`,
    lien_accueil: `${ctx.siteUrl}/${locale}`,
    entreprise: ctx.businessName,
    echeance: formatDeadline(order.expiresAt, locale),
    delai: locale === 'ht' ? ctx.slaHt : ctx.slaFr,
    heures: ctx.supportHours,
    plafond: formatHtg(HTG_WALLET_MAX),
    montant_min: formatUsdShort(ctx.minUsdCents, locale),
  };
}

/** Whether a catalogue entry may be offered for this order. */
export function offeredFor(entry: CatalogueEntry, order: Pick<OrderRow, 'status' | 'method'>): boolean {
  if (entry.methods && !entry.methods.includes(order.method)) return false;
  return (
    entry.recommendedFor.includes(order.status) ||
    entry.availableFor === undefined ||
    entry.availableFor.includes(order.status)
  );
}

/** The kit for one order, or `null` when nothing may be written (test order, unusable phone). */
export function buildWhatsAppKit(order: OrderRow, ctx: WhatsAppContext): WhatsAppKit | null {
  if (order.mode === 'sandbox') return null;
  if (!order.customerPhone.replace(/\D/g, '')) return null;

  const offered = CATALOGUE.filter((entry) => offeredFor(entry, order)).map((entry) => ({
    id: entry.id,
    recommended: entry.recommendedFor.includes(order.status),
  }));
  // Stable: recommended first, catalogue order kept inside each half.
  const entries = [...offered.filter((e) => e.recommended), ...offered.filter((e) => !e.recommended)];

  return {
    orderId: order.id,
    reference: order.reference,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    locale: order.locale === 'ht' ? 'ht' : 'fr',
    businessName: ctx.businessName,
    vars: { fr: orderVars(order, ctx, 'fr'), ht: orderVars(order, ctx, 'ht') },
    entries,
  };
}

/** « Stanley de Recharge Meru » / « Stanley ki nan Recharge Meru », or the service alone. */
export function signature(style: Pick<WhatsAppStyle, 'signatureName'>, businessName: string, locale: WhatsAppLocale): string {
  const name = style.signatureName.trim();
  if (!name) return businessName;
  return locale === 'ht' ? `${name} ki nan ${businessName}` : `${name} de ${businessName}`;
}

/** The mention that ends every message, in the customer's language (asked for by the operator). */
export function automaticFooter(locale: WhatsAppLocale, businessName: string): string {
  return locale === 'ht'
    ? `— Sa a se yon mesaj otomatik ${businessName}.`
    : `— Ceci est un message automatique de ${businessName}.`;
}

/** The text to fill: the operator's rewrite when he coached one, else the built-in one. */
export function templateFor(
  entry: CatalogueEntry,
  tone: WhatsAppTone,
  locale: WhatsAppLocale,
  style: Pick<WhatsAppStyle, 'overrides'>,
): { template: string; coached: boolean } {
  const coached = style.overrides[overrideKey(entry.id, tone, locale)];
  return coached ? { template: coached, coached: true } : { template: entry.text[tone][locale], coached: false };
}

/** A small stable number from a string: the same order always gets the same joke. */
function seedOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Messages that stay sober even in the fun tone: an apology, a refund, a
 * transfer Meru refused, a security warning. Caution-coloured messages are
 * excluded as well, and the free message has nothing to joke about yet.
 */
const NO_JOKE_IDS: ReadonlySet<string> = new Set([
  'free_text',
  'refund_done',
  'refund_announced',
  'delay_apology',
  'delay_bonus',
  'meru_blocked_retry',
  'failed_explained',
  'safety_tip',
]);

/** One of the operator's jokes for this order, or null. Never on a message about money at risk. */
export function jokeFor(
  entry: CatalogueEntry,
  style: Pick<WhatsAppStyle, 'jokes'>,
  locale: WhatsAppLocale,
  seed: string,
): string | null {
  if (entry.color === 'caution' || NO_JOKE_IDS.has(entry.id)) return null;
  const jokes = style.jokes[locale];
  if (jokes.length === 0) return null;
  return jokes[seedOf(`${entry.id}:${seed}`) % jokes.length];
}

/** The exact text the customer will read. */
export function renderMessage(
  entry: CatalogueEntry,
  vars: OrderVars,
  options: RenderOptions,
  style: WhatsAppStyle,
  businessName: string,
): string {
  const { tone, locale, emojis } = options;
  const { template } = templateFor(entry, tone, locale, style);
  const filled = fillTemplate(template, { ...vars, moi: signature(style, businessName, locale) }).trim();

  const parts = [filled];
  // The free message keeps an empty line where the operator will write.
  if (entry.id === 'free_text') parts.push('');
  if (tone === 'fun') {
    const joke = jokeFor(entry, style, locale, vars.reference);
    if (joke) parts.push(`P.S. ${joke}`);
  }
  const closing = style.closing[locale].trim();
  if (closing) parts.push(closing);
  parts.push(automaticFooter(locale, businessName));

  const body = parts.join(PARAGRAPH);
  return emojis ? body : stripEmojis(body);
}

/** Convenience for the server: one message of a kit, rendered with the operator's defaults. */
export function renderKitMessage(
  kit: WhatsAppKit,
  id: string,
  style: WhatsAppStyle,
  options: Partial<RenderOptions> = {},
): string | null {
  const entry = catalogueEntry(id);
  if (!entry || !kit.entries.some((e) => e.id === id)) return null;
  const locale = options.locale ?? kit.locale;
  return renderMessage(
    entry,
    kit.vars[locale],
    { tone: options.tone ?? style.defaultTone, locale, emojis: options.emojis ?? style.emojis },
    style,
    kit.businessName,
  );
}

/** `https://wa.me/<digits>?text=…`, or null when the number has no digit. */
export function whatsappHref(phoneE164: string, body: string): string | null {
  const digits = phoneE164.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}` : null;
}
