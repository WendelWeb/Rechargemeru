import { describe, it, expect } from 'vitest';
import type { NewNotification, NotificationRow, NotificationTemplate, OrderRow } from '@/lib/orders/types';
import type { Settings } from '@/lib/settings/types';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import type { SendEmailInput, SendEmailResult } from '@/lib/notifications/email';
import type { WhatsAppMessage, WhatsAppSendResult } from '@/lib/notifications/whatsapp';
import { TEST_PREFIX } from '@/lib/notifications/templates';
import type { OrderEventInput } from '@/lib/orders/events';
import { customerEmails, notifyOrder, reasonLabel, type NotifyDeps } from './dispatch';

const CREATED = new Date('2026-09-06T12:00:00Z');
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

/** Money is formatted with narrow no-break spaces; compare on ordinary ones. */
const norm = (s: string) => s.replace(new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, 'g'), ' ');

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER_ID,
    reference: 'MR-ABCDEFGH',
    status: 'paid',
    method: 'moncash',
    provider: 'bazik',
    providerRef: 'BZK_123',
    providerTransactionId: 'TX1',
    payerWallet: '50937001234',
    mode: 'live',
    usdCents: 2000,
    fxRateHtg: 132.5,
    baseHtg: 2650,
    feeLines: [],
    totalHtg: 2783,
    paidHtg: 2783,
    fulfilledUsdCents: null,
    refundHtg: null,
    refundWallet: null,
    clerkUserId: null,
    accountEmail: null,
    deviceId: null,
    customerName: 'Jean Baptiste',
    customerPhone: '+50937001234',
    customerEmail: null,
    meruAccountType: 'email',
    meruAccount: 'jean@mail.com',
    meruReference: null,
    redirectUrl: null,
    redirectExpiresAt: null,
    returnedAt: null,
    lastVerifiedAt: null,
    verifyAttempts: 1,
    failureReason: null,
    adminNote: null,
    locale: 'fr',
    createdAt: CREATED,
    updatedAt: CREATED,
    expiresAt: new Date(CREATED.getTime() + 1_800_000),
    paidAt: CREATED,
    fulfilledAt: null,
    ...overrides,
  };
}

type Fake = {
  deps: NotifyDeps;
  rows: NotificationRow[];
  emails: SendEmailInput[];
  whatsapps: WhatsAppMessage[];
  events: OrderEventInput[];
};

type FakeOptions = {
  settings?: Partial<Settings>;
  email?: (input: SendEmailInput) => SendEmailResult;
  whatsapp?: (msg: WhatsAppMessage) => WhatsAppSendResult;
};

const ADMIN_EMAIL = 'ops@example.com';
const ADMIN_PHONE = '+50931112222';
const CUSTOMER_PHONE = '+50937001234';
/** What the customer typed in the order form. */
const FORM_EMAIL = 'jean.form@mail.com';
/** The verified address of the Clerk account that placed the order. */
const ACCOUNT_EMAIL = 'jean.account@mail.com';

function makeFake(opts: FakeOptions = {}): Fake {
  const fake: Fake = { rows: [], emails: [], whatsapps: [], events: [], deps: {} as NotifyDeps };
  let seq = 0;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    adminEmails: [ADMIN_EMAIL],
    adminWhatsappNumbers: [ADMIN_PHONE],
    notifyAdminEvents: ['paid', 'needs_review', 'failed'],
    notifyCustomerEvents: ['created', 'paid', 'fulfilled'],
    updatedAt: CREATED,
    ...opts.settings,
  };
  const sameKey = (a: NotificationRow, b: NewNotification) =>
    a.orderId === (b.orderId ?? null) &&
    a.template === b.template &&
    a.audience === b.audience &&
    a.channel === b.channel &&
    a.recipient === b.recipient;
  fake.deps = {
    settings: async () => settings,
    siteUrl: () => 'https://recharge.example',
    insertNotification: async (row) => {
      // The partial unique index: one live (pending/sent) original per key.
      const live = fake.rows.some(
        (r) => sameKey(r, row) && (r.status === 'pending' || r.status === 'sent') && r.resendOf === null,
      );
      if (live && !row.resendOf) return null;
      seq += 1;
      const inserted: NotificationRow = {
        id: `n-${seq}`,
        orderId: row.orderId ?? null,
        channel: row.channel,
        audience: row.audience,
        recipient: row.recipient,
        template: row.template,
        locale: row.locale ?? 'fr',
        status: row.status ?? 'pending',
        providerId: row.providerId ?? null,
        error: row.error ?? null,
        resendOf: row.resendOf ?? null,
        createdAt: CREATED,
      };
      fake.rows.push(inserted);
      return inserted;
    },
    updateNotification: async (id, patch) => {
      const idx = fake.rows.findIndex((r) => r.id === id);
      if (idx >= 0) fake.rows[idx] = { ...fake.rows[idx], ...patch } as NotificationRow;
    },
    latestNotification: async (key) => {
      const found = fake.rows.filter(
        (r) =>
          r.orderId === key.orderId &&
          r.template === key.template &&
          r.audience === key.audience &&
          r.channel === key.channel &&
          r.recipient === key.recipient,
      );
      return found.length > 0 ? found[found.length - 1] : null;
    },
    sendEmail: async (input) => {
      fake.emails.push(input);
      return opts.email ? opts.email(input) : { sent: true, skipped: false, id: 'em-1' };
    },
    sendWhatsApp: async (msg) => {
      fake.whatsapps.push(msg);
      return opts.whatsapp ? opts.whatsapp(msg) : { sent: true, skipped: false, id: 'wa-1' };
    },
    appendEvent: async (ev) => {
      fake.events.push(ev);
    },
  };
  return fake;
}

const eventTypes = (f: Fake) => f.events.map((e) => e.type);

describe('notifyOrder', () => {
  it('follows the matrix: admin channels for admin events, customer channels for customer events', async () => {
    const f = makeFake();
    const r = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 3, sent: 3, skipped: 0, failed: 0 });
    expect(f.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL]);
    expect(f.whatsapps.map((w) => [w.to, w.audience])).toEqual([
      [ADMIN_PHONE, 'admin'],
      ['+50937001234', 'customer'],
    ]);
    expect(f.rows.map((row) => [row.audience, row.channel, row.status, row.providerId])).toEqual([
      ['admin', 'email', 'sent', 'em-1'],
      ['admin', 'whatsapp', 'sent', 'wa-1'],
      ['customer', 'whatsapp', 'sent', 'wa-1'],
    ]);
    expect(eventTypes(f)).toEqual(['notification_sent', 'notification_sent', 'notification_sent']);
  });

  it('sends nothing for a template outside the matrix', async () => {
    const f = makeFake();
    const r = await notifyOrder(makeOrder({ status: 'expired' }), 'expired', {}, f.deps);
    expect(r).toEqual({ attempted: 0, sent: 0, skipped: 0, failed: 0 });
    expect(f.rows).toEqual([]);
  });

  it('emails the customer too when the order carries an email, in the order’s locale', async () => {
    const f = makeFake();
    await notifyOrder(makeOrder({ customerEmail: 'jean@mail.com', locale: 'ht' }), 'fulfilled', {}, f.deps);
    expect(f.emails.map((e) => e.to)).toEqual(['jean@mail.com']);
    expect(f.whatsapps.map((w) => [w.to, w.locale])).toEqual([['+50937001234', 'ht']]);
    expect(f.rows.every((row) => row.locale === 'ht' && row.audience === 'customer')).toBe(true);
  });

  it('prefixes every message about a sandbox order', async () => {
    const f = makeFake();
    await notifyOrder(makeOrder({ mode: 'sandbox' }), 'paid', {}, f.deps);
    expect(f.emails[0].subject.startsWith(TEST_PREFIX)).toBe(true);
    for (const w of f.whatsapps) {
      expect(w.text.startsWith('[T')).toBe(true);
      expect(w.params[0].startsWith('[T')).toBe(true);
    }
  });

  it('skips duplicates through the unique key and records one notification_skipped', async () => {
    const f = makeFake();
    await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    const again = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(again).toEqual({ attempted: 3, sent: 0, skipped: 3, failed: 0 });
    expect(f.emails).toHaveLength(1);
    expect(f.whatsapps).toHaveLength(2);
    expect(eventTypes(f).filter((t) => t === 'notification_skipped')).toHaveLength(1);
  });

  it('force resends and links the new rows to the previous ones', async () => {
    const f = makeFake();
    await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    const r = await notifyOrder(makeOrder(), 'paid', { force: true }, f.deps);
    expect(r).toEqual({ attempted: 3, sent: 3, skipped: 0, failed: 0 });
    const resent = f.rows.slice(3);
    expect(resent.map((row) => row.resendOf)).toEqual(['n-1', 'n-2', 'n-3']);
    expect(eventTypes(f).filter((t) => t === 'notification_skipped')).toHaveLength(0);

    const explicit = await notifyOrder(makeOrder(), 'paid', { force: true, resendOf: 'n-1' }, f.deps);
    expect(explicit.sent).toBe(3);
    expect(f.rows.slice(6).every((row) => row.resendOf === 'n-1')).toBe(true);
  });

  it('marks a Twilio-sandbox customer message as skipped without failing the batch', async () => {
    const f = makeFake({
      whatsapp: (msg) =>
        msg.audience === 'customer'
          ? { sent: false, skipped: true, reason: 'twilio_sandbox_customer' }
          : { sent: true, skipped: false, id: 'wa-admin' },
    });
    const r = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 3, sent: 2, skipped: 1, failed: 0 });
    const customerRow = f.rows.find((row) => row.audience === 'customer')!;
    expect(customerRow.status).toBe('skipped');
    // The journal carries a sentence, not a slug: the operator must be able to
    // read why a client got nothing without opening the code.
    expect(customerRow.error).toBe(
      'Bac à sable Twilio : seuls les numéros ayant envoyé « join » reçoivent, les messages client ne partent pas',
    );
    const skipped = String(f.events.find((e) => e.type === 'notification_skipped')?.message);
    expect(skipped).toContain('Bac à sable Twilio');
    expect(skipped).not.toContain('twilio_sandbox_customer');
  });

  it('records failures on the row and in the timeline', async () => {
    const f = makeFake({ email: () => ({ sent: false, skipped: false, error: 'HTTP 500 — boom' }) });
    const r = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 3, sent: 2, skipped: 0, failed: 1 });
    const emailRow = f.rows.find((row) => row.channel === 'email')!;
    expect(emailRow.status).toBe('failed');
    expect(emailRow.error).toBe('HTTP 500 — boom');
    expect(eventTypes(f)).toContain('notification_failed');

    // A failed row does not hold the unique key: the next call tries again.
    const retry = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(retry.failed).toBe(1);
    expect(f.emails).toHaveLength(2);
  });

  it('never throws when settings cannot be read', async () => {
    const f = makeFake();
    f.deps.settings = async () => {
      throw new Error('db down');
    };
    const r = await notifyOrder(makeOrder(), 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it('writes to the three recipients: the operator, the form address and the account address', async () => {
    const f = makeFake();
    const order = makeOrder({ customerEmail: FORM_EMAIL, accountEmail: ACCOUNT_EMAIL });
    const r = await notifyOrder(order, 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 5, sent: 5, skipped: 0, failed: 0 });
    expect(f.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL, FORM_EMAIL, ACCOUNT_EMAIL]);
    expect(f.whatsapps.map((w) => [w.to, w.audience])).toEqual([
      [ADMIN_PHONE, 'admin'],
      [CUSTOMER_PHONE, 'customer'],
    ]);
    // Two addresses are two legitimate rows: the unique index carries the recipient.
    expect(f.rows.map((row) => [row.audience, row.channel, row.recipient, row.status])).toEqual([
      ['admin', 'email', ADMIN_EMAIL, 'sent'],
      ['admin', 'whatsapp', ADMIN_PHONE, 'sent'],
      ['customer', 'whatsapp', CUSTOMER_PHONE, 'sent'],
      ['customer', 'email', FORM_EMAIL, 'sent'],
      ['customer', 'email', ACCOUNT_EMAIL, 'sent'],
    ]);
  });

  it('writes once when the form address and the account address are the same person', async () => {
    const f = makeFake();
    // The form is prefilled with the account address for a signed-in customer,
    // so this is the ordinary case — case and spacing included.
    const order = makeOrder({ customerEmail: '  Jean.Form@Mail.com ', accountEmail: 'jean.form@mail.com' });
    const r = await notifyOrder(order, 'paid', {}, f.deps);
    expect(r).toEqual({ attempted: 4, sent: 4, skipped: 0, failed: 0 });
    expect(f.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL, FORM_EMAIL]);
    expect(f.rows.filter((row) => row.audience === 'customer' && row.channel === 'email')).toHaveLength(1);
  });

  it('a guest order keeps the form address alone, an account-only order the account address', async () => {
    const guest = makeFake();
    await notifyOrder(makeOrder({ customerEmail: FORM_EMAIL, accountEmail: null }), 'paid', {}, guest.deps);
    expect(guest.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL, FORM_EMAIL]);

    const noForm = makeFake();
    await notifyOrder(makeOrder({ customerEmail: null, accountEmail: ACCOUNT_EMAIL }), 'paid', {}, noForm.deps);
    expect(noForm.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL, ACCOUNT_EMAIL]);

    const neither = makeFake();
    await notifyOrder(makeOrder({ customerEmail: null, accountEmail: null }), 'paid', {}, neither.deps);
    expect(neither.emails.map((e) => e.to)).toEqual([ADMIN_EMAIL]);
  });

  it('accepts every template without throwing', async () => {
    const templates: NotificationTemplate[] = ['created', 'paid', 'fulfilled', 'failed', 'expired', 'needs_review', 'refunded', 'reminder_24h'];
    const f = makeFake({
      settings: { notifyAdminEvents: templates, notifyCustomerEvents: templates },
    });
    for (const template of templates) {
      const r = await notifyOrder(makeOrder(), template, {}, f.deps);
      expect(r.attempted).toBe(3);
      expect(r.failed).toBe(0);
    }
  });
});

/**
 * The two moments the operator asked for: an order enters, then it is paid.
 * Both must leave on BOTH channels, to the operator and to the customer.
 */
describe('the two steps, email and WhatsApp', () => {
  const defaults = { notifyAdminEvents: DEFAULT_SETTINGS.notifyAdminEvents, notifyCustomerEvents: DEFAULT_SETTINGS.notifyCustomerEvents };

  it('warns the operator from the creation, by default', () => {
    expect(DEFAULT_SETTINGS.notifyAdminEvents).toContain('created');
    expect(DEFAULT_SETTINGS.notifyAdminEvents).toContain('paid');
    expect(DEFAULT_SETTINGS.notifyCustomerEvents).toContain('created');
    expect(DEFAULT_SETTINGS.notifyCustomerEvents).toContain('paid');
  });

  it('sends both events on both channels to all three recipients', async () => {
    const f = makeFake({ settings: defaults });
    const order = makeOrder({ customerEmail: FORM_EMAIL, accountEmail: ACCOUNT_EMAIL });
    for (const template of ['created', 'paid'] as const) {
      const r = await notifyOrder(order, template, {}, f.deps);
      expect(r, template).toEqual({ attempted: 5, sent: 5, skipped: 0, failed: 0 });
    }
    const byTemplate = (template: string) => f.rows.filter((row) => row.template === template);
    for (const template of ['created', 'paid']) {
      expect(byTemplate(template).map((row) => `${row.audience}/${row.channel}/${row.recipient}`)).toEqual([
        `admin/email/${ADMIN_EMAIL}`,
        `admin/whatsapp/${ADMIN_PHONE}`,
        `customer/whatsapp/${CUSTOMER_PHONE}`,
        `customer/email/${FORM_EMAIL}`,
        `customer/email/${ACCOUNT_EMAIL}`,
      ]);
    }
  });

  it('the creation message tells the customer to pay and keep the reference, the operator that an order is waiting', async () => {
    const f = makeFake({ settings: defaults });
    await notifyOrder(
      makeOrder({ status: 'pending_payment', paidHtg: null, customerEmail: FORM_EMAIL }),
      'created',
      {},
      f.deps,
    );
    const customer = f.emails.find((e) => e.to === FORM_EMAIL)!;
    expect(String(customer.text)).toContain('Terminez le paiement, gardez cette référence');
    expect(customer.subject).toContain('MR-ABCDEFGH');
    const operator = f.emails.find((e) => e.to === ADMIN_EMAIL)!;
    expect(operator.subject).toContain('en attente de paiement');
    expect(String(operator.text)).toContain('🆕 Nouvelle commande MR-ABCDEFGH');
    expect(String(operator.text)).toContain('en attente de paiement');
    const operatorWa = f.whatsapps.find((w) => w.audience === 'admin')!;
    expect(operatorWa.text).toContain('en attente de paiement');
  });

  it('the payment message announces the dollars to the customer and the transfer to do to the operator', async () => {
    const f = makeFake({ settings: defaults });
    await notifyOrder(makeOrder({ customerEmail: FORM_EMAIL }), 'paid', {}, f.deps);
    const customer = f.emails.find((e) => e.to === FORM_EMAIL)!;
    expect(norm(String(customer.text))).toContain('nous avons reçu votre paiement de 2 783 HTG par MonCash');
    expect(norm(String(customer.text))).toContain('envoie vos 20 $ US sur votre compte Meru');

    // The operator alert carries everything needed to send the dollars.
    const operator = f.emails.find((e) => e.to === ADMIN_EMAIL)!;
    expect(norm(operator.subject)).toBe('Payée MR-ABCDEFGH — envoyer 20 $ US sur Meru');
    const text = norm(String(operator.text));
    expect(text).toContain('envoyer 20 $ US sur Meru');
    expect(text).toContain('jean@mail.com');
    expect(text).toContain('Jean Baptiste');
    expect(text).toContain('+509 3700 1234');
    expect(text).toContain(`https://recharge.example/admin/commandes/${ORDER_ID}`);
    expect(norm(f.whatsapps.find((w) => w.audience === 'admin')!.text)).toContain('envoyer 20 $ US sur Meru');
  });

  it('renders the customer in the order’s language and the operator always in French', async () => {
    const fr = makeFake({ settings: defaults });
    await notifyOrder(makeOrder({ locale: 'fr', customerEmail: FORM_EMAIL }), 'created', {}, fr.deps);
    expect(fr.emails.find((e) => e.to === FORM_EMAIL)!.subject).toContain('Commande MR-ABCDEFGH créée');
    expect(fr.whatsapps.find((w) => w.audience === 'customer')!.locale).toBe('fr');

    const ht = makeFake({ settings: defaults });
    await notifyOrder(makeOrder({ locale: 'ht', customerEmail: FORM_EMAIL }), 'created', {}, ht.deps);
    const htMail = ht.emails.find((e) => e.to === FORM_EMAIL)!;
    expect(htMail.subject).toContain('Kòmand MR-ABCDEFGH kreye');
    expect(String(htMail.text)).toContain('Fini peman an, kenbe referans sa a');
    const htWa = ht.whatsapps.find((w) => w.audience === 'customer')!;
    expect(htWa.locale).toBe('ht');
    expect(htWa.text).toContain('Bonjou Jean');
    // The operator reads French whatever the customer chose.
    expect(ht.emails.find((e) => e.to === ADMIN_EMAIL)!.subject).toContain('Nouvelle commande');
    expect(ht.rows.filter((row) => row.audience === 'admin').every((row) => row.locale === 'fr')).toBe(true);
  });

  it('keeps the TEST prefix on both steps for a sandbox order', async () => {
    const f = makeFake({ settings: defaults });
    const order = makeOrder({ mode: 'sandbox', customerEmail: FORM_EMAIL, accountEmail: ACCOUNT_EMAIL });
    for (const template of ['created', 'paid'] as const) await notifyOrder(order, template, {}, f.deps);
    for (const email of f.emails) expect(email.subject.startsWith('[T')).toBe(true);
    for (const wa of f.whatsapps) {
      expect(wa.text.startsWith('[T')).toBe(true);
      expect(wa.params[0].startsWith('[T')).toBe(true);
    }
  });
});

describe('customerEmails', () => {
  it('keeps both addresses, lowercased, and collapses the duplicate', () => {
    expect(customerEmails({ customerEmail: FORM_EMAIL, accountEmail: ACCOUNT_EMAIL })).toEqual([FORM_EMAIL, ACCOUNT_EMAIL]);
    expect(customerEmails({ customerEmail: ' Jean.Form@Mail.com ', accountEmail: 'JEAN.FORM@mail.com' })).toEqual([FORM_EMAIL]);
    expect(customerEmails({ customerEmail: null, accountEmail: null })).toEqual([]);
    expect(customerEmails({ customerEmail: '  ', accountEmail: ACCOUNT_EMAIL })).toEqual([ACCOUNT_EMAIL]);
  });
});

describe('reasonLabel', () => {
  it('turns a machine reason into a French sentence and leaves the rest alone', () => {
    expect(reasonLabel('twilio_sandbox_customer')).toContain('Bac à sable Twilio');
    expect(reasonLabel('not_configured')).toBe('Canal non configuré sur ce serveur');
    expect(reasonLabel('bad_sender')).toContain('TWILIO_WHATSAPP_FROM');
    expect(reasonLabel('HTTP 500 — boom')).toBe('HTTP 500 — boom');
  });
});
