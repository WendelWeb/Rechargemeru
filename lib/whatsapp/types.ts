/**
 * lib/whatsapp/types.ts — the shapes of the WhatsApp message system.
 *
 * WhatsApp is the operator's manual channel: a `wa.me` link opens his own
 * phone with the text already written, he reads it, he sends it. This module
 * describes what can be written:
 *
 *   - a CATALOGUE of messages (`CatalogueEntry`), each for given order states,
 *     each written in FOUR TONES and TWO LANGUAGES;
 *   - the STYLE the operator coaches (`WhatsAppStyle`): default tone, emojis,
 *     his first name as a signature, a closing line, his own jokes for the fun
 *     tone, and his own rewrite of any message.
 *
 * Texts are templates with `{placeholders}` (see `PLACEHOLDERS`) so the
 * operator's rewrites use the very same syntax as the built-in texts, and a
 * test can check every placeholder a text uses actually exists.
 */
import type { OrderStatus, PaymentMethod } from '@/lib/orders/types';

/** How a message sounds. The operator picks one per message, with a default he sets. */
export const WHATSAPP_TONES = ['classique', 'chaleureux', 'fun', 'direct'] as const;
export type WhatsAppTone = (typeof WHATSAPP_TONES)[number];

export const TONE_LABELS: Record<WhatsAppTone, string> = {
  classique: 'Classique',
  chaleureux: 'Chaleureux',
  fun: 'Fun',
  direct: 'Direct',
};

export const TONE_HINTS: Record<WhatsAppTone, string> = {
  classique: 'Poli et clair, comme un service sérieux.',
  chaleureux: 'Amical et proche, pour mettre à l’aise.',
  fun: 'Léger, avec de l’humour et des emojis.',
  direct: 'Deux lignes, l’essentiel et c’est tout.',
};

export const WHATSAPP_LOCALES = ['fr', 'ht'] as const;
export type WhatsAppLocale = (typeof WHATSAPP_LOCALES)[number];

/** Groups of the menu, in the order the operator meets them. */
export const MESSAGE_CATEGORIES = [
  'relance',
  'aide',
  'questions',
  'confiance',
  'apres',
  'paiement',
  'fin',
  'libre',
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  relance: 'Relancer',
  aide: 'Aider à payer',
  questions: 'Comprendre pourquoi',
  confiance: 'Rassurer',
  apres: 'Après une expiration ou un échec',
  paiement: 'Paiement reçu',
  fin: 'Après la recharge',
  libre: 'Message libre',
};

/**
 * Every placeholder a text may use, with what it becomes. Values are
 * formatted in the customer's language (« 20,00 $ US » / « 20,00 dola US »).
 */
export const PLACEHOLDERS = {
  prenom: 'Prénom du client (« Jean »)',
  nom: 'Nom complet du client',
  reference: 'Référence de la commande (« MR-7F3K2QAB »)',
  montant_usd: 'Dollars commandés (« 20,00 $ US »)',
  montant_htg: 'Total à payer en gourdes (« 3 625 HTG »)',
  montant_recu: 'Gourdes reçues (le total s’il n’est pas connu)',
  methode: 'Portefeuille choisi (« MonCash » ou « NatCash »)',
  compte_meru: 'Email ou nom d’utilisateur Meru du client',
  ref_meru: 'Référence du transfert Meru (vide s’il n’y en a pas)',
  transaction: 'Numéro de transaction MonCash / NatCash (vide s’il n’y en a pas)',
  lien_suivi: 'Lien de suivi de la commande, dans la langue du client',
  lien_accueil: 'Lien de la page d’accueil, pour refaire une commande',
  entreprise: 'Nom du service (« Recharge Meru »)',
  moi: 'Votre signature (« Stanley de Recharge Meru », ou le nom du service)',
  echeance: 'Heure limite de paiement (« 25 sept. 2026, 14:35 »)',
  delai: 'Délai de recharge annoncé (« moins de 15 minutes »)',
  heures: 'Heures du support (« 8 h – 20 h, 7 j/7 »)',
  plafond: 'Plafond d’un paiement MonCash / NatCash (« 75 000 HTG »)',
  montant_min: 'Plus petit montant accepté (« 20 $ US »)',
} as const;
export type PlaceholderName = keyof typeof PLACEHOLDERS;
export type TemplateVars = Record<PlaceholderName, string>;

/** One text per tone and per language. */
export type TemplateSet = Record<WhatsAppTone, Record<WhatsAppLocale, string>>;

export type CatalogueEntry = {
  /** Stable identifier: it is also what the order history records. */
  id: string;
  category: MessageCategory;
  /** What the operator reads in the menu (French). */
  label: string;
  /** One line saying when to send it (French). */
  hint: string;
  /** Emphasis in the menu: the obvious move, a neutral one, or one to send with care. */
  color: 'primary' | 'neutral' | 'caution';
  /** States for which this message is the right reflex (« Conseillé »). */
  recommendedFor: readonly OrderStatus[];
  /** States where it is still offered. Absent = every state. */
  availableFor?: readonly OrderStatus[];
  /** Only for orders paid with these rails (e.g. MonCash payment steps). */
  methods?: readonly PaymentMethod[];
  /** A warning shown to the operator before sending (« Promet un bonus… »). */
  warning?: string;
  /** The texts. No automatic footer, no closing line: the engine adds them. */
  text: TemplateSet;
};

/** The operator's coaching, stored in its own table (not the priced settings). */
export type WhatsAppStyle = {
  defaultTone: WhatsAppTone;
  /** Keep emojis in the texts (off strips every emoji). */
  emojis: boolean;
  /** « Stanley » → messages say « ici Stanley de Recharge Meru ». Empty = the service name alone. */
  signatureName: string;
  /** A line of his own, added at the end of every message, per language. Empty = none. */
  closing: Record<WhatsAppLocale, string>;
  /** His own jokes: in the fun tone, one of them is added as a P.S. */
  jokes: Record<WhatsAppLocale, string[]>;
  /** His rewrite of a message, keyed `overrideKey(id, tone, locale)`. */
  overrides: Record<string, string>;
};

export const DEFAULT_WHATSAPP_STYLE: WhatsAppStyle = {
  defaultTone: 'chaleureux',
  emojis: true,
  signatureName: '',
  closing: { fr: '', ht: '' },
  jokes: { fr: [], ht: [] },
  overrides: {},
};

export function overrideKey(id: string, tone: WhatsAppTone, locale: WhatsAppLocale): string {
  return `${id}|${tone}|${locale}`;
}

/** Limits the store enforces on what the operator coaches. */
export const STYLE_LIMITS = {
  signatureName: 40,
  closing: 200,
  jokeCount: 20,
  jokeLength: 200,
  overrideLength: 1500,
  overrideCount: 400,
} as const;
