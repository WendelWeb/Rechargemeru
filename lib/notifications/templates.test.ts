import { describe, it, expect } from 'vitest';
import type { NotificationTemplate } from '@/lib/orders/types';
import {
  TEST_PREFIX,
  TEST_PREFIX_HT,
  buildAdminMessage,
  buildCustomerMessage,
  textToHtml,
  type TemplateOrder,
} from './templates';

const norm = (s: string) => s.replace(new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, 'g'), ' ');

function makeOrder(overrides: Partial<TemplateOrder> = {}): TemplateOrder {
  return {
    id: '7d5f2a2e-1c4b-4c8e-9a2b-5f6e7d8c9b0a',
    reference: 'MR-7F3K2QAB',
    status: 'paid',
    method: 'moncash',
    mode: 'live',
    locale: 'fr',
    providerRef: 'BZK-123',
    providerTransactionId: 'TX-98765',
    payerWallet: '+50937001234',
    usdCents: 2000,
    totalHtg: 2985,
    paidHtg: 2985,
    fulfilledUsdCents: null,
    refundHtg: null,
    refundWallet: null,
    customerName: 'Jean Baptiste',
    customerPhone: '+50937001234',
    meruAccountType: 'email',
    meruAccount: 'jean@mail.com',
    meruReference: null,
    failureReason: null,
    expiresAt: new Date('2026-09-06T18:35:00Z'),
    ...overrides,
  };
}

const adminCtx = { siteUrl: 'https://recharge.example', businessName: 'Recharge Meru' };
const customerCtx = {
  siteUrl: 'https://recharge.example',
  businessName: 'Recharge Meru',
  supportWhatsapp: '+50931112222',
  slaFr: 'moins de 2 heures',
  slaHt: 'mwens pase 2 èdtan',
  supportHours: '8 h – 20 h, 7 j/7',
};

const CUSTOMER_PARAM_COUNTS: Record<NotificationTemplate, number> = {
  created: 6,
  paid: 6,
  fulfilled: 6,
  failed: 5,
  expired: 3,
  needs_review: 3,
  refunded: 4,
  reminder_24h: 3,
};

const ALL_TEMPLATES: NotificationTemplate[] = [
  'created',
  'paid',
  'fulfilled',
  'failed',
  'expired',
  'needs_review',
  'refunded',
  'reminder_24h',
];

describe('buildAdminMessage', () => {
  it('paid names the Meru account, both amounts, the payer and the admin link', () => {
    const m = buildAdminMessage(makeOrder({ paidHtg: 3000 }), 'paid', adminCtx);
    const text = norm(m.text);
    expect(text.startsWith('💰 PAYÉE MR-7F3K2QAB')).toBe(true);
    expect(text).toContain('envoyer 20 $ US sur Meru');
    expect(text).toContain('Reçu 3 000 HTG (attendu 2 985 HTG) par MonCash');
    expect(text).toContain('tx TX-98765');
    expect(text).toContain('payeur +509 3700 1234');
    expect(text).toContain('Compte Meru : email jean@mail.com — Jean Baptiste, tél. +509 3700 1234');
    expect(text).toContain('Ouvrir : https://recharge.example/admin/commandes/7d5f2a2e-1c4b-4c8e-9a2b-5f6e7d8c9b0a');
    expect(norm(m.subject)).toBe('Payée MR-7F3K2QAB — envoyer 20 $ US sur Meru');
    expect(m.params).toHaveLength(12);
    expect(m.html).toContain('https://recharge.example/admin/commandes/7d5f2a2e-1c4b-4c8e-9a2b-5f6e7d8c9b0a');
  });

  it('paid says when the provider did not report the amount', () => {
    const m = buildAdminMessage(makeOrder({ paidHtg: null }), 'paid', adminCtx);
    expect(norm(m.text)).toContain('Reçu montant non communiqué (attendu 2 985 HTG)');
  });

  it('needs_review names the stored reason or the default one', () => {
    const withReason = buildAdminMessage(
      makeOrder({ status: 'needs_review', failureReason: 'paiement reçu après expiration' }),
      'needs_review',
      adminCtx,
    );
    expect(withReason.text).toContain('paiement reçu après expiration');
    const noReason = buildAdminMessage(makeOrder({ status: 'needs_review' }), 'needs_review', adminCtx);
    expect(noReason.text).toContain('montant ou délai à vérifier');
    expect(noReason.text).toContain('jean@mail.com');
  });

  it('failed distinguishes a creation error from a later failure', () => {
    const creation = buildAdminMessage(
      makeOrder({ status: 'failed', providerRef: null, failureReason: 'HTTP 502 — Bazik indisponible' }),
      'failed',
      adminCtx,
    );
    expect(creation.text.startsWith('⚠️ Création impossible MR-7F3K2QAB : HTTP 502 — Bazik indisponible')).toBe(true);
    const later = buildAdminMessage(makeOrder({ status: 'failed', failureReason: 'client injoignable' }), 'failed', adminCtx);
    expect(later.text.startsWith('⚠️ Échouée MR-7F3K2QAB : client injoignable')).toBe(true);
  });

  it('reminder_24h follows the plan wording', () => {
    const m = buildAdminMessage(makeOrder(), 'reminder_24h', adminCtx);
    expect(norm(m.text)).toBe(
      '⏰ Toujours à recharger : MR-7F3K2QAB (20 $ US) payée il y a 24 h. https://recharge.example/admin/commandes/7d5f2a2e-1c4b-4c8e-9a2b-5f6e7d8c9b0a',
    );
    expect(m.params).toHaveLength(3);
  });

  it('covers every template without throwing and keeps params clean', () => {
    for (const t of ALL_TEMPLATES) {
      const m = buildAdminMessage(makeOrder({ refundHtg: 2985, refundWallet: '+50937001234' }), t, adminCtx);
      expect(m.subject.length, t).toBeGreaterThan(0);
      expect(m.text.length, t).toBeGreaterThan(0);
      expect(m.html, t).toContain('<table');
      expect(m.params.length, t).toBeGreaterThan(0);
      for (const p of m.params) {
        expect(p.length, t).toBeGreaterThan(0);
        expect(p, t).not.toMatch(/[\n\r\t]/);
      }
    }
  });

  it('prefixes subject, text and the first param for sandbox orders', () => {
    const m = buildAdminMessage(makeOrder({ mode: 'sandbox' }), 'paid', adminCtx);
    expect(m.subject.startsWith(TEST_PREFIX)).toBe(true);
    expect(m.text.startsWith(TEST_PREFIX)).toBe(true);
    expect(m.params[0].startsWith(TEST_PREFIX)).toBe(true);
    expect(m.html).toContain('TEST');
  });
});

describe('buildCustomerMessage', () => {
  it('ht paid thanks the customer, gives the ht SLA and the ht tracking link', () => {
    const m = buildCustomerMessage(makeOrder({ locale: 'ht' }), 'paid', customerCtx);
    const text = norm(m.text);
    expect(text).toContain('Mèsi');
    expect(text).toContain('mwens pase 2 èdtan');
    expect(text).toContain('https://recharge.example/ht/commande/MR-7F3K2QAB');
    expect(text).toContain('2 985 HTG');
    expect(text).toContain('20 dola US');
    expect(text).not.toContain('$ US');
    expect(m.params.map(norm)).toEqual([
      'Jean',
      '2 985 HTG',
      'MonCash',
      '20 dola US',
      'mwens pase 2 èdtan',
      'https://recharge.example/ht/commande/MR-7F3K2QAB',
    ]);
  });

  it('fr paid uses the French SLA, French money labels and the fr link', () => {
    const m = buildCustomerMessage(makeOrder(), 'paid', customerCtx);
    const text = norm(m.text);
    expect(text).toContain('Merci');
    expect(text).toContain('moins de 2 heures');
    expect(text).toContain('20 $ US');
    expect(text).toContain('https://recharge.example/fr/commande/MR-7F3K2QAB');
    expect(text).not.toContain('dola');
  });

  it('created carries [name, reference, usd, htg, method, url] in that order', () => {
    const m = buildCustomerMessage(makeOrder({ status: 'pending_payment' }), 'created', customerCtx);
    expect(m.params.map(norm)).toEqual([
      'Jean',
      'MR-7F3K2QAB',
      '20 $ US',
      '2 985 HTG',
      'MonCash',
      'https://recharge.example/fr/commande/MR-7F3K2QAB',
    ]);
    for (const p of m.params) expect(norm(m.text)).toContain(norm(p));
  });

  it('fulfilled carries [name, usd, meruAccount, meruRef, business, url]', () => {
    const m = buildCustomerMessage(
      makeOrder({ status: 'fulfilled', meruReference: 'MERU-42', fulfilledUsdCents: 2000 }),
      'fulfilled',
      customerCtx,
    );
    expect(m.params.map(norm)).toEqual([
      'Jean',
      '20 $ US',
      'jean@mail.com',
      'MERU-42',
      'Recharge Meru',
      'https://recharge.example/fr/commande/MR-7F3K2QAB',
    ]);
    const noRef = buildCustomerMessage(makeOrder({ status: 'fulfilled' }), 'fulfilled', customerCtx);
    expect(noRef.params[3].length).toBeGreaterThan(0);
  });

  it('failed carries [name, reference, reason, support, url] and falls back without a support number', () => {
    const m = buildCustomerMessage(makeOrder({ status: 'failed', failureReason: 'paiement refusé' }), 'failed', customerCtx);
    expect(m.params.map(norm)).toEqual([
      'Jean',
      'MR-7F3K2QAB',
      'paiement refusé',
      '+509 3111 2222',
      'https://recharge.example/fr/commande/MR-7F3K2QAB',
    ]);
    const noSupport = buildCustomerMessage(makeOrder({ status: 'failed' }), 'failed', {
      ...customerCtx,
      supportWhatsapp: null,
    });
    expect(noSupport.params[2].length).toBeGreaterThan(0);
    expect(noSupport.params[3]).toBe('Recharge Meru');
  });

  it('refunded contains the exact fr and ht sentences with [name, htg, wallet, reference]', () => {
    const fr = buildCustomerMessage(
      makeOrder({ status: 'refunded', refundHtg: 2985, refundWallet: '+50937001234' }),
      'refunded',
      customerCtx,
    );
    expect(norm(fr.text)).toContain(
      'Nous vous avons remboursé 2 985 HTG sur le portefeuille +509 3700 1234 pour la commande MR-7F3K2QAB.',
    );
    expect(fr.params.map(norm)).toEqual(['Jean', '2 985 HTG', '+509 3700 1234', 'MR-7F3K2QAB']);
    const ht = buildCustomerMessage(
      makeOrder({ status: 'refunded', refundHtg: 2985, refundWallet: '+50937001234', locale: 'ht' }),
      'refunded',
      customerCtx,
    );
    expect(norm(ht.text)).toContain('Nou ranbouse w 2 985 HTG sou bous +509 3700 1234 pou kòmand MR-7F3K2QAB.');
  });

  it('has the documented params length for every template in both locales', () => {
    for (const locale of ['fr', 'ht'] as const) {
      for (const template of ALL_TEMPLATES) {
        const m = buildCustomerMessage(
          makeOrder({ locale, refundHtg: 100, refundWallet: '+50937001234' }),
          template,
          customerCtx,
        );
        expect(m.params, `${locale}/${template}`).toHaveLength(CUSTOMER_PARAM_COUNTS[template]);
        for (const p of m.params) {
          expect(p.length, `${locale}/${template}`).toBeGreaterThan(0);
          expect(p, `${locale}/${template}`).not.toMatch(/[\n\r\t]/);
        }
        expect(m.subject.length, `${locale}/${template}`).toBeGreaterThan(0);
        expect(m.html, `${locale}/${template}`).toContain('<table');
      }
    }
  });

  it('prefixes sandbox orders per locale', () => {
    const fr = buildCustomerMessage(makeOrder({ mode: 'sandbox' }), 'paid', customerCtx);
    expect(fr.text.startsWith(TEST_PREFIX)).toBe(true);
    expect(fr.subject.startsWith(TEST_PREFIX)).toBe(true);
    expect(fr.params[0].startsWith(TEST_PREFIX)).toBe(true);
    const ht = buildCustomerMessage(makeOrder({ mode: 'sandbox', locale: 'ht' }), 'paid', customerCtx);
    expect(ht.text.startsWith(TEST_PREFIX_HT)).toBe(true);
    expect(ht.subject.startsWith(TEST_PREFIX_HT)).toBe(true);
    expect(ht.params[0].startsWith(TEST_PREFIX_HT)).toBe(true);
  });

  it('shows the support line with hours and the not-affiliated line in the email', () => {
    const m = buildCustomerMessage(makeOrder(), 'paid', customerCtx);
    expect(norm(m.html)).toContain('+509 3111 2222');
    expect(m.html).toContain('8 h – 20 h, 7 j/7');
    expect(m.html).toContain('affilié');
  });
});

describe('textToHtml', () => {
  it('escapes markup, links URLs and splits paragraphs', () => {
    const html = textToHtml('Bonjour <b>Jean</b>,\n\nSuivi : https://x.y/fr/commande/MR-1?a=1&b=2.\nLigne 2');
    expect(html).toContain('&lt;b&gt;Jean&lt;/b&gt;');
    expect(html).toContain('<a href="https://x.y/fr/commande/MR-1?a=1&amp;b=2"');
    expect(html).toContain('</a>.<br>Ligne 2');
    expect(html.match(/<p/g)).toHaveLength(2);
  });
});
