/**
 * What the customer will actually read.
 *
 * These texts leave the operator's phone for somebody waiting for their
 * money. A false promise, a language that is not theirs, a message about a
 * test order, a « {prenom} » left unfilled — each costs trust, which is why
 * every entry of the catalogue, in every tone and both languages, goes
 * through these checks.
 */
import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from '@/lib/orders/types';
import { CATALOGUE, catalogueEntry, manualMessageLabel } from '@/lib/whatsapp/catalogue';
import {
  automaticFooter,
  buildWhatsAppKit,
  firstName,
  formatDeadline,
  renderKitMessage,
  renderMessage,
  signature,
  whatsappHref,
  type WhatsAppContext,
} from '@/lib/whatsapp/render';
import { hasEmoji, placeholdersIn, unknownPlaceholders } from '@/lib/whatsapp/template';
import {
  DEFAULT_WHATSAPP_STYLE,
  MESSAGE_CATEGORIES,
  WHATSAPP_LOCALES,
  WHATSAPP_TONES,
  overrideKey,
  type WhatsAppStyle,
} from '@/lib/whatsapp/types';

const CTX: WhatsAppContext = {
  businessName: 'Recharge Meru',
  siteUrl: 'https://www.rechargemeru.com',
  slaFr: 'moins de 15 minutes',
  slaHt: 'mwens pase 15 minit',
  supportHours: '8 h – 20 h, 7 j/7',
  minUsdCents: 2000,
};

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord-1',
    reference: 'MR-EKMQDW33',
    status: 'paid',
    method: 'natcash',
    mode: 'live',
    locale: 'fr',
    usdCents: 6100,
    totalHtg: 9387,
    paidHtg: 9387,
    fulfilledUsdCents: null,
    customerName: 'Maniska Odalus',
    customerPhone: '+50937001234',
    meruAccount: 'shah@gmail.com',
    meruAccountType: 'email',
    meruReference: null,
    providerTransactionId: '178933654959448362',
    expiresAt: new Date('2026-09-13T22:25:47.000Z'),
    ...over,
  } as unknown as OrderRow;
}

const STYLE = DEFAULT_WHATSAPP_STYLE;
const kitOf = (o: OrderRow) => buildWhatsAppKit(o, CTX);
const idsOf = (o: OrderRow) => kitOf(o)?.entries.map((e) => e.id) ?? [];
const recommendedOf = (o: OrderRow) => kitOf(o)?.entries.filter((e) => e.recommended).map((e) => e.id) ?? [];

/** Every text of the catalogue, with where it lives. */
const ALL_TEXTS = CATALOGUE.flatMap((entry) =>
  WHATSAPP_TONES.flatMap((tone) =>
    WHATSAPP_LOCALES.map((locale) => ({ entry, tone, locale, text: entry.text[tone][locale] })),
  ),
);

/** The ids the order history already holds: they must keep existing. */
const HISTORIC_IDS = [
  'payment_reminder',
  'payment_help',
  'payment_proof',
  'expired_restart',
  'payment_received',
  'confirm_meru_account',
  'delay_apology',
  'meru_blocked_retry',
  'closed_hours',
  'delay_bonus',
  'review_proof',
  'amount_mismatch',
  'fulfilled',
  'ask_confirmation',
  'refund_announced',
  'refund_done',
  'failed_explained',
  'free_text',
];

describe('le catalogue', () => {
  it('a des identifiants uniques et des groupes connus', () => {
    const ids = CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CATALOGUE) expect(MESSAGE_CATEGORIES, entry.id).toContain(entry.category);
  });

  it('garde tous les messages déjà présents dans l’historique des commandes', () => {
    for (const id of HISTORIC_IDS) expect(catalogueEntry(id), id).toBeDefined();
  });

  it('propose bien plus que l’ancien catalogue, surtout pour les commandes non payées', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(40);
    const unpaid = CATALOGUE.filter((e) =>
      (['pending_payment', 'expired'] as OrderStatus[]).some(
        (s) => e.recommendedFor.includes(s) || !e.availableFor || e.availableFor.includes(s),
      ),
    );
    expect(unpaid.length).toBeGreaterThanOrEqual(20);
  });

  it('écrit chaque message dans les quatre tons et les deux langues', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      expect(text.trim().length, `${entry.id}/${tone}/${locale}`).toBeGreaterThan(10);
    }
  });

  it('n’utilise que des variables qui existent', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      expect(unknownPlaceholders(text), `${entry.id}/${tone}/${locale}`).toEqual([]);
    }
  });

  it('salue le client par son prénom et se présente dans chaque texte', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      const where = `${entry.id}/${tone}/${locale}`;
      expect(text, where).toContain('{prenom}');
      expect(text, where).toContain('{moi}');
    }
  });

  it('ne met une référence Meru ou un numéro de transaction que dans une partie facultative', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      const outside = text.replace(/\[\[[\s\S]*?\]\]/g, '');
      const where = `${entry.id}/${tone}/${locale}`;
      expect(placeholdersIn(outside), where).not.toContain('ref_meru');
      expect(placeholdersIn(outside), where).not.toContain('transaction');
    }
  });

  it('laisse la mention « message automatique » au moteur', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      expect(text.toLowerCase(), `${entry.id}/${tone}/${locale}`).not.toMatch(/message automatique|mesaj otomatik/);
    }
  });

  it('garde les tons Classique et Direct sans emoji', () => {
    for (const { entry, tone, locale, text } of ALL_TEXTS) {
      if (tone === 'classique' || tone === 'direct') expect(hasEmoji(text), `${entry.id}/${tone}/${locale}`).toBe(false);
    }
  });

  it('met des emojis dans le ton Fun', () => {
    const fun = ALL_TEXTS.filter((t) => t.tone === 'fun' && t.entry.id !== 'free_text');
    const withEmoji = fun.filter((t) => hasEmoji(t.text));
    expect(withEmoji.length / fun.length).toBeGreaterThan(0.8);
  });

  it('renvoie à l’accueil, jamais à la commande morte, quand elle a expiré', () => {
    const entry = catalogueEntry('expired_restart')!;
    for (const tone of WHATSAPP_TONES) {
      for (const locale of WHATSAPP_LOCALES) {
        expect(entry.text[tone][locale], `${tone}/${locale}`).toContain('{lien_accueil}');
        expect(entry.text[tone][locale], `${tone}/${locale}`).not.toContain('{lien_suivi}');
      }
    }
  });

  it('montre l’identifiant Meru dans chaque version de la demande de confirmation', () => {
    const entry = catalogueEntry('confirm_meru_account')!;
    expect(entry.color).toBe('caution');
    for (const tone of WHATSAPP_TONES) {
      for (const locale of WHATSAPP_LOCALES) expect(entry.text[tone][locale]).toContain('{compte_meru}');
    }
  });

  it('prévient l’opérateur avant tout message qui promet un bonus', () => {
    for (const entry of CATALOGUE) {
      const promises = WHATSAPP_TONES.some((tone) => /bonus|bonis|kado/i.test(entry.text[tone].fr + entry.text[tone].ht));
      if (promises) expect(entry.warning, entry.id).toBeTruthy();
    }
  });
});

describe('buildWhatsAppKit', () => {
  it('ne propose rien du tout pour une commande de test', () => {
    for (const status of ORDER_STATUSES) expect(kitOf(order({ status, mode: 'sandbox' })), status).toBeNull();
  });

  it('ne propose rien sans numéro utilisable', () => {
    expect(kitOf(order({ customerPhone: '—' }))).toBeNull();
  });

  it('conseille au moins un message pour chaque état, et garde toujours le message libre', () => {
    for (const status of ORDER_STATUSES) {
      expect(recommendedOf(order({ status })).length, status).toBeGreaterThan(0);
      expect(idsOf(order({ status })), status).toContain('free_text');
    }
  });

  it('classe les messages conseillés en premier', () => {
    const entries = kitOf(order({ status: 'expired' }))!.entries;
    const lastRecommended = entries.findLastIndex((e) => e.recommended);
    const firstOther = entries.findIndex((e) => !e.recommended);
    expect(lastRecommended).toBeLessThan(firstOther === -1 ? entries.length : firstOther);
  });

  it.each<[OrderStatus, string]>([
    ['pending_payment', 'payment_reminder'],
    ['expired', 'expired_restart'],
    ['expired', 'payment_proof'],
    ['expired', 'ask_why'],
    ['paid', 'payment_received'],
    ['paid', 'confirm_meru_account'],
    ['needs_review', 'review_proof'],
    ['fulfilled', 'fulfilled'],
    ['failed', 'failed_explained'],
    ['refunded', 'refund_done'],
    ['cancelled', 'cancelled_ack'],
  ])('conseille « %s » → « %s »', (status, id) => {
    expect(recommendedOf(order({ status }))).toContain(id);
  });

  it('n’offre jamais « dollars envoyés » avant que l’envoi soit fait', () => {
    for (const status of ['pending_payment', 'paid', 'needs_review', 'expired', 'failed'] as const) {
      expect(idsOf(order({ status })), status).not.toContain('fulfilled');
    }
    expect(idsOf(order({ status: 'fulfilled' }))).toContain('fulfilled');
  });

  it('ne demande plus de confirmer le compte Meru une fois les dollars partis', () => {
    for (const status of ['fulfilled', 'refunded', 'expired', 'failed', 'cancelled'] as const) {
      expect(idsOf(order({ status })), status).not.toContain('confirm_meru_account');
    }
    expect(idsOf(order({ status: 'paid' }))).toContain('confirm_meru_account');
  });

  it('propose les étapes du bon portefeuille seulement', () => {
    const moncash = idsOf(order({ status: 'pending_payment', method: 'moncash' }));
    const natcash = idsOf(order({ status: 'pending_payment', method: 'natcash' }));
    expect(moncash).toContain('how_to_pay_moncash');
    expect(moncash).not.toContain('how_to_pay_natcash');
    expect(natcash).toContain('how_to_pay_natcash');
    expect(natcash).not.toContain('how_to_pay_moncash');
  });

  it('offre une vraie liste pour une commande non payée', () => {
    expect(idsOf(order({ status: 'pending_payment' })).length).toBeGreaterThanOrEqual(15);
    expect(idsOf(order({ status: 'expired' })).length).toBeGreaterThanOrEqual(15);
  });

  it('ouvre dans la langue du client et prépare les deux langues', () => {
    const kit = kitOf(order({ locale: 'ht' }))!;
    expect(kit.locale).toBe('ht');
    expect(kit.vars.fr.montant_usd.replace(/ /g, ' ')).toBe('61,00 $ US');
    expect(kit.vars.ht.montant_usd.replace(/ /g, ' ')).toBe('61,00 dola US');
    expect(kit.vars.ht.lien_suivi).toBe('https://www.rechargemeru.com/ht/commande/MR-EKMQDW33');
    expect(kit.vars.fr.lien_accueil).toBe('https://www.rechargemeru.com/fr');
  });
});

describe('renderMessage', () => {
  const statuses = ORDER_STATUSES;

  it('termine chaque message par la mention automatique, dans la langue choisie, sans variable oubliée', () => {
    for (const status of statuses) {
      const kit = kitOf(order({ status }))!;
      for (const { id } of kit.entries) {
        const entry = catalogueEntry(id)!;
        for (const tone of WHATSAPP_TONES) {
          for (const locale of WHATSAPP_LOCALES) {
            const body = renderMessage(entry, kit.vars[locale], { tone, locale, emojis: true }, STYLE, CTX.businessName);
            const where = `${status}/${id}/${tone}/${locale}`;
            expect(body.endsWith(automaticFooter(locale, CTX.businessName)), where).toBe(true);
            expect(body, where).not.toMatch(/\{[a-z_]+\}|\[\[|\]\]/);
          }
        }
      }
    }
  });

  it('nomme le client par son prénom seulement', () => {
    const body = renderKitMessage(kitOf(order({ status: 'paid' }))!, 'payment_received', STYLE, { tone: 'classique' })!;
    expect(body).toContain('Maniska');
    expect(body).not.toContain('Maniska Odalus');
    expect(body).toContain('MR-EKMQDW33');
    expect(firstName('  Jean  Baptiste ')).toBe('Jean');
  });

  it('garde les mots demandés dans le message « paiement reçu »', () => {
    const fr = renderKitMessage(kitOf(order({ status: 'paid' }))!, 'payment_received', STYLE, { tone: 'classique' })!;
    const ht = renderKitMessage(kitOf(order({ status: 'paid', locale: 'ht' }))!, 'payment_received', STYLE, {
      tone: 'classique',
    })!;
    expect(fr).toContain("J'ai bien reçu votre paiement");
    expect(ht).toContain('Mwen byen resevwa peman');
    expect(ht).not.toContain('Bonjour');
  });

  it('cite la référence Meru seulement quand elle existe', () => {
    const without = renderKitMessage(kitOf(order({ status: 'fulfilled', meruReference: null }))!, 'fulfilled', STYLE, {
      tone: 'classique',
    })!;
    const withRef = renderKitMessage(kitOf(order({ status: 'fulfilled', meruReference: 'ABC123' }))!, 'fulfilled', STYLE, {
      tone: 'classique',
    })!;
    expect(without).not.toContain('référence Meru');
    expect(withRef).toContain('référence Meru ABC123');
  });

  it('signe avec le prénom de l’opérateur quand il en a donné un', () => {
    expect(signature({ signatureName: '' }, 'Recharge Meru', 'fr')).toBe('Recharge Meru');
    expect(signature({ signatureName: 'Stanley' }, 'Recharge Meru', 'fr')).toBe('Stanley de Recharge Meru');
    expect(signature({ signatureName: 'Stanley' }, 'Recharge Meru', 'ht')).toBe('Stanley ki nan Recharge Meru');
    const signed: WhatsAppStyle = { ...STYLE, signatureName: 'Stanley' };
    const body = renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'payment_reminder', signed)!;
    expect(body).toContain('Stanley de Recharge Meru');
  });

  it('retire tous les emojis quand l’opérateur les coupe', () => {
    const kit = kitOf(order({ status: 'pending_payment' }))!;
    for (const { id } of kit.entries) {
      for (const locale of WHATSAPP_LOCALES) {
        const body = renderMessage(catalogueEntry(id)!, kit.vars[locale], { tone: 'fun', locale, emojis: false }, STYLE, CTX.businessName);
        expect(hasEmoji(body), `${id}/${locale}`).toBe(false);
      }
    }
  });

  it('utilise la version de l’opérateur pour ce ton et cette langue seulement', () => {
    const coached: WhatsAppStyle = {
      ...STYLE,
      overrides: { [overrideKey('payment_reminder', 'fun', 'fr')]: 'Yo {prenom} ! {reference} attend, ici {moi}.' },
    };
    const kit = kitOf(order({ status: 'pending_payment' }))!;
    const fun = renderKitMessage(kit, 'payment_reminder', coached, { tone: 'fun', locale: 'fr' })!;
    const classique = renderKitMessage(kit, 'payment_reminder', coached, { tone: 'classique', locale: 'fr' })!;
    expect(fun.startsWith('Yo Maniska ! MR-EKMQDW33 attend, ici Recharge Meru.')).toBe(true);
    expect(classique).not.toContain('Yo Maniska');
  });

  it('ajoute la phrase de fin de l’opérateur juste avant la mention automatique', () => {
    const closing: WhatsAppStyle = { ...STYLE, closing: { fr: 'Bonne journée !', ht: 'Pase bon jounen !' } };
    const body = renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'payment_reminder', closing, { tone: 'classique' })!;
    expect(body.endsWith(`Bonne journée !\n\n${automaticFooter('fr', 'Recharge Meru')}`)).toBe(true);
  });

  it('ajoute une blague de l’opérateur en P.S. dans le ton Fun, jamais quand l’argent est en jeu', () => {
    const funny: WhatsAppStyle = { ...STYLE, jokes: { fr: ['Les dollars font leurs valises.'], ht: ['Dola yo ap mare valiz.'] } };
    const reminder = renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'payment_reminder', funny, { tone: 'fun' })!;
    expect(reminder).toContain('P.S. Les dollars font leurs valises.');
    const again = renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'payment_reminder', funny, { tone: 'fun' })!;
    expect(again).toBe(reminder);
    const classique = renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'payment_reminder', funny, {
      tone: 'classique',
    })!;
    expect(classique).not.toContain('P.S.');
    const caution = CATALOGUE.find((e) => e.color === 'caution')!;
    const kit = kitOf(order({ status: 'needs_review' }))!;
    const body = renderMessage(caution, kit.vars.fr, { tone: 'fun', locale: 'fr', emojis: true }, funny, CTX.businessName);
    expect(body).not.toContain('P.S.');
  });

  it('laisse une ligne vide avant la mention dans le message libre', () => {
    const body = renderKitMessage(kitOf(order({ status: 'paid' }))!, 'free_text', STYLE, { tone: 'classique' })!;
    expect(body).toMatch(/MR-EKMQDW33[^\n]*\n\n\n\n— Ceci est un message automatique de Recharge Meru\.$/);
  });

  it('refuse un message que la commande ne peut pas recevoir', () => {
    expect(renderKitMessage(kitOf(order({ status: 'pending_payment' }))!, 'fulfilled', STYLE)).toBeNull();
  });
});

describe('formatDeadline', () => {
  it('écrit le mois en kreyòl pour un client kreyòl', () => {
    const date = new Date('2026-09-25T18:35:00.000Z'); // 14:35 à Port-au-Prince
    expect(formatDeadline(date, 'ht')).toBe('25 septanm 2026, 14:35');
    expect(formatDeadline(date, 'fr')).toBe('25 sept. 2026, 14:35');
    expect(kitOf(order({ locale: 'ht', expiresAt: date }))!.vars.ht.echeance).toBe('25 septanm 2026, 14:35');
  });
});

describe('les blagues de l’opérateur', () => {
  it('ne s’ajoutent jamais à un remboursement, une excuse ou un avertissement', () => {
    const funny: WhatsAppStyle = { ...STYLE, jokes: { fr: ['Blague.'], ht: ['Blag.'] } };
    const kit = kitOf(order({ status: 'refunded' }))!;
    const refund = renderMessage(catalogueEntry('refund_done')!, kit.vars.fr, { tone: 'fun', locale: 'fr', emojis: true }, funny, CTX.businessName);
    expect(refund).not.toContain('P.S.');
  });
});

describe('manualMessageLabel', () => {
  it('nomme un envoi manuel pour l’historique, avec son ton', () => {
    expect(manualMessageLabel('payment_reminder@fun')).toBe('Rappel de paiement (Fun)');
    expect(manualMessageLabel('payment_reminder')).toBe('Rappel de paiement');
    expect(manualMessageLabel('inconnu')).toBeNull();
  });
});

describe('whatsappHref', () => {
  it('construit un lien wa.me avec le texte encodé', () => {
    expect(whatsappHref('+509 3700 1234', 'Bonjour Jean, ça va ?')).toBe(
      'https://wa.me/50937001234?text=Bonjour%20Jean%2C%20%C3%A7a%20va%20%3F',
    );
  });

  it('refuse un numéro sans chiffre plutôt que de fabriquer un lien mort', () => {
    expect(whatsappHref('', 'texte')).toBeNull();
    expect(whatsappHref('—', 'texte')).toBeNull();
  });
});
