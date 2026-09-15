/**
 * Ce que le client va réellement lire.
 *
 * Ces textes partent du téléphone de l'opérateur vers quelqu'un qui attend
 * son argent. Une promesse fausse, une langue qui n'est pas la sienne ou un
 * message envoyé au sujet d'une commande de test coûtent bien plus cher
 * qu'une ligne de code : ils coûtent la confiance. D'où ces tests.
 */
import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_MESSAGE_IDS,
  buildWhatsAppMessages,
  whatsappHref,
  type WhatsAppMessageId,
} from '@/lib/admin/whatsapp-messages';
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from '@/lib/orders/types';

const CTX = { businessName: 'Recharge Meru', siteUrl: 'https://www.rechargemeru.com' };

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

const ids = (o: OrderRow) => buildWhatsAppMessages(o, CTX).map((m) => m.id);
const byId = (o: OrderRow, id: WhatsAppMessageId) => buildWhatsAppMessages(o, CTX).find((m) => m.id === id);

describe('buildWhatsAppMessages', () => {
  it('propose au moins un message conseillé pour chaque état réel', () => {
    for (const status of ORDER_STATUSES) {
      const messages = buildWhatsAppMessages(order({ status }), CTX);
      expect(messages.length, status).toBeGreaterThan(0);
      // « Message libre » est le filet : il doit toujours être là.
      expect(messages.map((m) => m.id), status).toContain('free_text');
    }
  });

  it('classe les messages conseillés en premier', () => {
    const messages = buildWhatsAppMessages(order({ status: 'paid' }), CTX);
    const lastRecommended = messages.findLastIndex((m) => m.recommended);
    const firstOther = messages.findIndex((m) => !m.recommended);
    expect(lastRecommended).toBeLessThan(firstOther === -1 ? messages.length : firstOther);
  });

  it.each<[OrderStatus, WhatsAppMessageId]>([
    ['pending_payment', 'payment_reminder'],
    ['expired', 'expired_restart'],
    ['expired', 'payment_proof'],
    ['paid', 'payment_received'],
    ['paid', 'confirm_meru_account'],
    ['needs_review', 'review_proof'],
    ['fulfilled', 'fulfilled'],
    ['failed', 'failed_explained'],
    ['refunded', 'refund_done'],
  ])('conseille « %s » → « %s »', (status, id) => {
    expect(byId(order({ status }), id)?.recommended).toBe(true);
  });

  it('n’offre jamais « dollars envoyés » avant que l’envoi soit fait', () => {
    // La règle : aucun message ne promet ce qui n'est pas vrai.
    for (const status of ['pending_payment', 'paid', 'needs_review', 'expired'] as const) {
      expect(ids(order({ status })), status).not.toContain('fulfilled');
    }
    expect(ids(order({ status: 'fulfilled' }))).toContain('fulfilled');
  });

  it('écrit dans la langue du client, pas dans celle de l’administration', () => {
    const fr = byId(order({ locale: 'fr', status: 'paid' }), 'payment_received');
    const ht = byId(order({ locale: 'ht', status: 'paid' }), 'payment_received');
    expect(fr?.body).toContain('J’ai bien reçu votre paiement'.replace('’', "'"));
    expect(ht?.body).toContain('Mwen byen resevwa peman');
    expect(ht?.body).not.toContain('Bonjour');
  });

  it('nomme le client par son prénom, le montant et la référence', () => {
    const m = byId(order({ status: 'paid' }), 'payment_received');
    expect(m?.body).toContain('Maniska');
    expect(m?.body).not.toContain('Maniska Odalus,'); // prénom seul, pas le nom entier
    expect(m?.body).toContain('MR-EKMQDW33');
    expect(m?.body?.replace(/[  ]/g, ' ')).toContain('9 387 HTG');
  });

  it('montre l’identifiant Meru en entier dans la demande de confirmation', () => {
    // C'est le seul écran où une adresse doit être relue caractère par caractère.
    const m = byId(order({ status: 'paid' }), 'confirm_meru_account');
    expect(m?.body).toContain('shah@gmail.com');
    expect(m?.tone).toBe('caution');
  });

  it('cite la référence Meru dans le message d’envoi quand elle existe', () => {
    const sans = byId(order({ status: 'fulfilled', meruReference: null }), 'fulfilled');
    const avec = byId(order({ status: 'fulfilled', meruReference: 'ABC123' }), 'fulfilled');
    expect(sans?.body).not.toContain('référence Meru');
    expect(avec?.body).toContain('référence Meru ABC123');
  });

  it('ne propose rien du tout pour une commande de test', () => {
    // Écrire à quelqu'un au sujet d'argent fictif est pire que se taire.
    for (const status of ORDER_STATUSES) {
      expect(buildWhatsAppMessages(order({ status, mode: 'sandbox' }), CTX), status).toEqual([]);
    }
  });

  it('donne un lien de suivi dans la langue du client', () => {
    expect(byId(order({ locale: 'ht', status: 'pending_payment' }), 'payment_reminder')?.body).toContain(
      'https://www.rechargemeru.com/ht/commande/MR-EKMQDW33',
    );
  });

  it('renvoie à l’accueil, pas à la commande morte, quand elle a expiré', () => {
    const m = byId(order({ status: 'expired' }), 'expired_restart');
    expect(m?.body).toContain('https://www.rechargemeru.com/fr');
    expect(m?.body).not.toContain('/commande/MR-EKMQDW33');
  });

  it('couvre tout le catalogue déclaré, sans identifiant orphelin', () => {
    const seen = new Set(ORDER_STATUSES.flatMap((status) => ids(order({ status }))));
    expect([...seen].sort()).toEqual([...WHATSAPP_MESSAGE_IDS].sort());
  });
});

describe('whatsappHref', () => {
  it('construit un lien wa.me avec le texte encodé', () => {
    const href = whatsappHref('+509 3700 1234', 'Bonjour Jean, ça va ?');
    expect(href).toBe('https://wa.me/50937001234?text=Bonjour%20Jean%2C%20%C3%A7a%20va%20%3F');
  });

  it('refuse un numéro sans chiffre plutôt que de fabriquer un lien mort', () => {
    expect(whatsappHref('', 'texte')).toBeNull();
    expect(whatsappHref('—', 'texte')).toBeNull();
  });
});
