import { describe, it, expect } from 'vitest';
import type { NewNotification, NotificationRow, NotificationTemplate, OrderRow } from '@/lib/orders/types';
import type { Settings } from '@/lib/settings/types';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import type { SendEmailInput, SendEmailResult } from '@/lib/notifications/email';
import type { WhatsAppMessage, WhatsAppSendResult } from '@/lib/notifications/whatsapp';
import { TEST_PREFIX } from '@/lib/notifications/templates';
import type { OrderEventInput } from '@/lib/orders/events';
import { notifyOrder, type NotifyDeps } from './dispatch';

const CREATED = new Date('2026-09-06T12:00:00Z');
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

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
    expect(customerRow.error).toBe('twilio_sandbox_customer');
    expect(eventTypes(f)).toContain('notification_skipped');
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
