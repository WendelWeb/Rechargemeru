/**
 * The NatCash rail is read back from Kobara's payment LIST — the only read
 * that gateway serves. `verifyKobaraSignature` stays pinned because a signed
 * webhook, if the operator ever configures one, is stronger proof still, and
 * anyone who got past it could make the operator send real dollars.
 *
 * `checkKobaraOrder` is pinned hardest of all, because this is where the
 * 2026-09-13 incident happened: `GET /api/v1/payments/{id}` does not exist,
 * the 404 read as "cannot tell", and a really-paid order (MR-EKMQDW33,
 * 9 387 HTG) expired. The mistake is symmetrical — treating "I could not find
 * out" as "paid" sends dollars for nothing; treating it as "not paid" sends a
 * customer who was already debited back to pay a second time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyKobaraSignature,
  readKobaraEvent,
  isKobaraPaid,
  createKobaraOrder,
  checkKobaraOrder,
  kobaraMode,
} from '@/lib/payments/natcash/kobara';
import {
  natcashConfigured,
  natcashMode,
  natcashLabel,
  natcashProviderId,
  createNatcashOrder,
  retrieveNatcashOrder,
  natcashCheckoutAllowed,
} from '@/lib/payments/natcash';

const SECRET = 'whsec_kobara_test';
const NOW = Date.parse('2026-09-06T12:00:00Z');
const T = Math.floor(NOW / 1000);

const BODY = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  data: {
    payment: {
      id: 'pay_1',
      kobara_reference: 'KBR-PAY-1',
      amount: 2985,
      currency: 'HTG',
      status: 'succeeded',
      provider: 'natcash',
      metadata: { order_id: 'order-1' },
    },
  },
});

const sign = (payload: string, secret = SECRET) => createHmac('sha256', secret).update(payload).digest('hex');

const ENV = { ...process.env };
beforeEach(() => {
  for (const k of ['KOBARA_SECRET_KEY', 'KOBARA_WEBHOOK_SECRET', 'KOBARA_MODE', 'KOBARA_API_BASE', 'VERCEL_ENV']) {
    delete process.env[k];
  }
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('verifyKobaraSignature', () => {
  it('accepts a signature over the raw body (the docs’ own form)', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  it('also accepts the Stripe-style "<t>.<body>" payload', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(`${T}.${BODY}`)}`, SECRET, NOW)).toBe(true);
  });

  it('refuses a body that was altered after signing', () => {
    const tampered = BODY.replace('"amount":2985', '"amount":1');
    expect(tampered).not.toBe(BODY);
    expect(verifyKobaraSignature(tampered, `t=${T},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a signature made with a different secret', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY, 'wrong')}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a replayed notification more than five minutes old', () => {
    const old = T - 6 * 60;
    expect(verifyKobaraSignature(BODY, `t=${old},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a notification dated more than five minutes in the future', () => {
    const future = T + 6 * 60;
    expect(verifyKobaraSignature(BODY, `t=${future},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('accepts one that is merely a few minutes late', () => {
    const recent = T - 120;
    expect(verifyKobaraSignature(BODY, `t=${recent},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  /**
   * A timestamp is MANDATORY. Without one, a captured webhook could be
   * replayed forever — and on this rail a replay is a real `paid`.
   */
  it('refuses a valid HMAC that carries no timestamp', () => {
    expect(verifyKobaraSignature(BODY, `v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a timestamp that is not a number', () => {
    expect(verifyKobaraSignature(BODY, `t=yesterday,v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
    expect(verifyKobaraSignature(BODY, `t=,v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it.each([
    ['no header at all', null],
    ['a header with no v1', `t=${T}`],
    ['an empty header', ''],
    ['garbage', 'not-a-signature'],
  ])('refuses %s', (_label, header) => {
    expect(verifyKobaraSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it('refuses everything when no secret is configured — unverifiable is not trusted', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY)}`, undefined, NOW)).toBe(false);
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY)}`, '', NOW)).toBe(false);
  });
});

describe('readKobaraEvent', () => {
  it('extracts our own order id, the amount and the transaction reference', () => {
    expect(readKobaraEvent(JSON.parse(BODY))).toEqual({
      eventType: 'payment.succeeded',
      paymentId: 'pay_1',
      orderId: 'order-1',
      paid: true,
      amountHtg: 2985,
      transactionId: 'KBR-PAY-1',
    });
  });

  it('reports paid=false for an event that is not a success', () => {
    const pending = JSON.parse(BODY);
    pending.data.payment.status = 'pending';
    expect(readKobaraEvent(pending)?.paid).toBe(false);
  });

  it('returns null for anything that is not a payment event', () => {
    expect(readKobaraEvent(null)).toBeNull();
    expect(readKobaraEvent({})).toBeNull();
    expect(readKobaraEvent({ type: 'ping', data: {} })).toBeNull();
    expect(readKobaraEvent('payment.succeeded')).toBeNull();
  });

  it('reports a missing order id rather than inventing one', () => {
    const orphan = JSON.parse(BODY);
    delete orphan.data.payment.metadata;
    expect(readKobaraEvent(orphan)?.orderId).toBeNull();
  });
});

describe('isKobaraPaid', () => {
  it('accepts only an explicit success', () => {
    for (const s of ['succeeded', 'SUCCESS', ' completed ', 'paid']) {
      expect(isKobaraPaid(s)).toBe(true);
    }
  });

  it('treats anything else as not paid — "pending" is not a maybe-yes', () => {
    for (const s of ['pending', 'failed', 'canceled', '', 'unknown', null, undefined, 1]) {
      expect(isKobaraPaid(s)).toBe(false);
    }
  });
});

describe('kobaraMode', () => {
  it('reads the environment off the key, defaulting to live when unsure', () => {
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_test_abc';
    expect(kobaraMode()).toBe('sandbox');
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_live_abc';
    expect(kobaraMode()).toBe('live');
    process.env.KOBARA_SECRET_KEY = 'something_else';
    expect(kobaraMode()).toBe('live');
    process.env.KOBARA_MODE = 'sandbox';
    expect(kobaraMode()).toBe('sandbox');
  });
});

describe('createKobaraOrder', () => {
  beforeEach(() => {
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_test_abc';
  });

  it('creates a NatCash payment carrying our order id and the callback URLs', async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({
        url: String(url),
        body: String(init?.body ?? ''),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return json({
        data: {
          id: 'pay_9',
          kobara_reference: 'KBR-9',
          status: 'pending',
          checkout_url: 'http://checkout.kobara.app/pay_9',
        },
      });
    });

    const r = await createKobaraOrder({
      orderId: 'order-1',
      amountHtg: 2985,
      successUrl: 'https://example.test/api/payments/natcash/retour?orderId=order-1',
      errorUrl: 'https://example.test/fr/commande/MR-ABCDEFGH?cancelled=1',
      webhookUrl: 'https://example.test/api/webhooks/natcash?orderId=order-1',
    });

    expect(r).toEqual({
      ok: true,
      redirectUrl: 'https://checkout.kobara.app/pay_9',
      providerRef: 'pay_9',
      mode: 'sandbox',
    });
    expect(calls[0].url).toBe('https://api.kobara.app/api/v1/payments');
    expect(calls[0].headers.Authorization).toBe('Bearer kbr_sk_test_abc');
    expect(calls[0].headers['Idempotency-Key']).toBe('order-1');
    const sent = JSON.parse(calls[0].body);
    expect(sent.amount).toBe(2985);
    expect(sent.currency).toBe('HTG');
    expect(sent.provider).toBe('natcash');
    expect(sent.description).toBe('Recharge Meru');
    expect(sent.metadata).toEqual({ order_id: 'order-1' });
    expect(sent.success_url).toBe('https://example.test/api/payments/natcash/retour?orderId=order-1');
    expect(sent.error_url).toBe('https://example.test/fr/commande/MR-ABCDEFGH?cancelled=1');
    expect(sent.webhook_url).toBe('https://example.test/api/webhooks/natcash?orderId=order-1');
  });

  it('honours KOBARA_API_BASE and a custom description', async () => {
    process.env.KOBARA_API_BASE = 'https://sandbox.kobara.app/';
    const urls: string[] = [];
    const bodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      urls.push(String(url));
      bodies.push(String(init?.body ?? ''));
      return json({ id: 'pay_1', checkout_url: 'https://c/1' });
    });
    await createKobaraOrder({ orderId: 'o', amountHtg: 100, description: 'Recharge Meru MR-ABCDEFGH' });
    expect(urls[0]).toBe('https://sandbox.kobara.app/api/v1/payments');
    expect(JSON.parse(bodies[0]).description).toBe('Recharge Meru MR-ABCDEFGH');
  });

  it('reports a malformed create response instead of handing out a broken redirect', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: { id: 'pay_9' } }));
    await expect(createKobaraOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'malformed_create_response',
    });
  });

  it('surfaces Kobara’s error message on a 4xx and resolves a timeout as a message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: { message: 'Amount too low' } }, 422));
    const r = await createKobaraOrder({ orderId: 'o', amountHtg: 1 });
    expect(r).toEqual({ ok: false, message: 'HTTP 422 Amount too low' });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    await expect(createKobaraOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'timeout',
    });
  });

  it('never throws when unconfigured', async () => {
    delete process.env.KOBARA_SECRET_KEY;
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(createKobaraOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('checkKobaraOrder', () => {
  beforeEach(() => {
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_test_abc';
  });

  /** One page of the list endpoint, in the shape the live API returns. */
  const page = (rows: unknown[], hasMore = false, nextOffset?: number) =>
    json({ data: rows, pagination: { has_more: hasMore, next_offset: nextOffset } });

  const paid = {
    id: 'pay_9',
    kobara_reference: 'KBR-9',
    status: 'succeeded',
    amount: 2985,
    metadata: { order_id: 'order-1', provider_transaction_id: '178933654959448362' },
  };

  it('reads the payment out of the list, with the ids settle compares', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      urls.push(String(url));
      return page([{ id: 'autre' }, paid]);
    });

    const r = await checkKobaraOrder('pay_9');

    expect(urls[0]).toBe('https://api.kobara.app/api/v1/payments?limit=50&offset=0');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.amountHtg).toBe(2985);
      // The wallet's own number, which support quotes — not Kobara's.
      expect(r.transactionId).toBe('178933654959448362');
      expect(r.matchedOrderId).toBe('order-1');
      expect(r.matchedPaymentId).toBe('pay_9');
      expect(r.payer).toBeNull();
      expect(r.raw).toEqual(paid);
    }
  });

  it('pages until it finds the payment, following next_offset', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      urls.push(String(url));
      return urls.length === 1 ? page([{ id: 'vieux' }], true, 50) : page([paid]);
    });

    const r = await checkKobaraOrder('pay_9');

    expect(urls).toEqual([
      'https://api.kobara.app/api/v1/payments?limit=50&offset=0',
      'https://api.kobara.app/api/v1/payments?limit=50&offset=50',
    ]);
    expect(r.ok && r.paid).toBe(true);
  });

  /**
   * THE REGRESSION. An order Kobara has never heard of must answer
   * `not_found`, which settlement reads as "could not verify". If this ever
   * returns `{ ok: true, paid: false }`, a paid customer is told to pay again.
   */
  it('answers not_found — never "unpaid" — when the payment is not in the list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(page([{ id: 'quelqu-un-dautre' }]));
    await expect(checkKobaraOrder('pay_9')).resolves.toEqual({ ok: false, message: 'not_found' });
  });

  it('stops walking after a bounded number of pages', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      return page([{ id: 'jamais-le-bon' }], true, calls * 50);
    });
    await expect(checkKobaraOrder('pay_9')).resolves.toEqual({ ok: false, message: 'not_found' });
    expect(calls).toBe(6);
  });

  it('reports a payment Kobara still holds as pending, without guessing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      page([{ id: 'pay_9', status: 'pending', amount: 0 }]),
    );
    const r = await checkKobaraOrder('pay_9');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(false);
      expect(r.amountHtg).toBeNull();
      expect(r.matchedOrderId).toBeNull();
      expect(r.matchedPaymentId).toBe('pay_9');
      expect(r.transactionId).toBeNull();
    }
  });

  it('matches on kobara_reference too, and uses it as the payment id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      page([{ kobara_reference: 'KBR-9', status: 'succeeded', amount: 10 }]),
    );
    const r = await checkKobaraOrder('KBR-9');
    expect(r.ok && r.matchedPaymentId).toBe('KBR-9');
  });

  it('passes transport failures through as messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: 'boom' }, 500));
    await expect(checkKobaraOrder('pay_9')).resolves.toEqual({ ok: false, message: 'HTTP 500 boom' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(checkKobaraOrder('pay_9')).resolves.toEqual({ ok: false, message: 'network' });
  });
});

describe('natcash facade', () => {
  it('is unconfigured, sandbox and unlabeled until a key is present', async () => {
    expect(natcashConfigured()).toBe(false);
    expect(natcashMode()).toBe('sandbox');
    expect(natcashLabel()).toBe('aucun fournisseur configuré');
    expect(natcashProviderId()).toBeNull();
    await expect(createNatcashOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    await expect(retrieveNatcashOrder('pay_1')).resolves.toEqual({ ok: false, message: 'not_configured' });
  });

  it('reports Kobara once a key is present', () => {
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_live_abc';
    expect(natcashConfigured()).toBe(true);
    expect(natcashMode()).toBe('live');
    expect(natcashProviderId()).toBe('kobara');
    expect(natcashLabel()).toContain('Kobara');
  });

  it('propagates the strict-match ids through retrieveNatcashOrder', async () => {
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_test_abc';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        data: [{ id: 'pay_9', status: 'succeeded', amount: 2985, metadata: { order_id: 'order-1' } }],
        pagination: { has_more: false },
      }),
    );
    const r = await retrieveNatcashOrder('pay_9');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matchedOrderId).toBe('order-1');
      expect(r.matchedPaymentId).toBe('pay_9');
    }
  });

  it('natcashCheckoutAllowed mirrors the MonCash rule', () => {
    expect(natcashCheckoutAllowed(false)).toBe(false);
    expect(natcashCheckoutAllowed(true)).toBe(false);

    process.env.KOBARA_SECRET_KEY = 'kbr_sk_test_abc';
    process.env.VERCEL_ENV = 'production';
    expect(natcashCheckoutAllowed(false)).toBe(false);
    expect(natcashCheckoutAllowed(true)).toBe(true);

    process.env.VERCEL_ENV = 'preview';
    expect(natcashCheckoutAllowed(false)).toBe(true);

    process.env.VERCEL_ENV = 'production';
    process.env.KOBARA_SECRET_KEY = 'kbr_sk_live_abc';
    expect(natcashCheckoutAllowed(false)).toBe(true);
  });
});
