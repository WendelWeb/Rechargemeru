/**
 * The direct (Digicel) MonCash provider, exercised through the facade.
 *
 * `isMoncashPaid` is the single most consequential boolean on this rail: a
 * wrong "true" makes the operator send real dollars for gourdes that never
 * moved. Everything here is pinned against Digicel's documented shapes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  moncashConfigured,
  moncashMode,
  moncashHost,
  moncashRedirectUrl,
  moncashBasicAuth,
  isMoncashPaid,
  createMoncashOrder,
  retrieveMoncashOrder,
  retrieveMoncashByTransactionId,
  moncashCheckoutAllowed,
  resetMoncashTokenCache,
} from '@/lib/payments/moncash';

const ENV = { ...process.env };
beforeEach(() => {
  resetMoncashTokenCache();
  for (const k of [
    'MONCASH_CLIENT_ID',
    'MONCASH_CLIENT_SECRET',
    'MONCASH_MODE',
    'MONCASH_PROVIDER',
    'BAZIK_USER_ID',
    'BAZIK_ID',
    'BAZIK_SECRET_KEY',
    'VERCEL_ENV',
  ]) {
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

const withDirect = () => {
  process.env.MONCASH_CLIENT_ID = 'id';
  process.env.MONCASH_CLIENT_SECRET = 'secret';
};
const withBazik = () => {
  process.env.BAZIK_USER_ID = 'bzk_sandbox_abc';
  process.env.BAZIK_SECRET_KEY = 'sk_sandbox_xyz';
};

describe('gating', () => {
  it('is not configured until BOTH credentials are set', () => {
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_ID = 'id';
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_SECRET = 'secret';
    expect(moncashConfigured()).toBe(true);
  });

  it('never throws when unconfigured — it resolves not_configured', async () => {
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 500 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    await expect(retrieveMoncashOrder('o1')).resolves.toEqual({ ok: false, message: 'not_configured' });
    await expect(retrieveMoncashByTransactionId('tx')).resolves.toEqual({ ok: false, message: 'not_configured' });
  });

  it('fails closed in production until MONCASH_PROVIDER names the provider', () => {
    withDirect();
    vi.stubEnv('NODE_ENV', 'production');
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_PROVIDER = 'direct';
    expect(moncashConfigured()).toBe(true);
    process.env.MONCASH_PROVIDER = 'bazik'; // named but not configured: refused, not substituted
    expect(moncashConfigured()).toBe(false);
  });
});

describe('mode and hosts', () => {
  it('defaults to sandbox — going live must be deliberate', () => {
    expect(moncashMode()).toBe('sandbox');
    expect(moncashHost()).toBe('sandbox.moncashbutton.digicelgroup.com');
  });

  it('switches to the live host only on MONCASH_MODE=live', () => {
    withDirect();
    process.env.MONCASH_MODE = 'live';
    expect(moncashMode()).toBe('live');
    expect(moncashHost()).toBe('moncashbutton.digicelgroup.com');
    process.env.MONCASH_MODE = 'LIVE';
    expect(moncashMode()).toBe('live');
    process.env.MONCASH_MODE = 'production'; // not the magic word
    expect(moncashMode()).toBe('sandbox');
  });

  it('builds an https redirect URL for the right environment', () => {
    expect(moncashRedirectUrl('tok123', 'sandbox')).toBe(
      'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=tok123',
    );
    expect(moncashRedirectUrl('tok123', 'live')).toBe(
      'https://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=tok123',
    );
  });

  it('url-encodes the token', () => {
    expect(moncashRedirectUrl('a b/c+d', 'sandbox')).toContain('token=a%20b%2Fc%2Bd');
  });
});

describe('moncashBasicAuth', () => {
  it('base64-encodes id:secret', () => {
    expect(moncashBasicAuth('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });
});

describe('isMoncashPaid', () => {
  it('is true only for a successful payment message', () => {
    expect(isMoncashPaid({ payment: { message: 'successful' } })).toBe(true);
    expect(isMoncashPaid({ payment: { message: 'SUCCESSFUL' } })).toBe(true);
    expect(isMoncashPaid({ payment: { message: ' successful ' } })).toBe(true);
  });

  it('is false for anything else — including shapes that merely look positive', () => {
    expect(isMoncashPaid({ payment: { message: 'pending' } })).toBe(false);
    expect(isMoncashPaid({ payment: { message: 'failed' } })).toBe(false);
    expect(isMoncashPaid({ payment: {} })).toBe(false);
    expect(isMoncashPaid({ status: 200 })).toBe(false);
    expect(isMoncashPaid(null)).toBe(false);
    expect(isMoncashPaid(undefined)).toBe(false);
    expect(isMoncashPaid('successful')).toBe(false);
  });
});

describe('createMoncashOrder', () => {
  beforeEach(withDirect);

  it('refuses a fractional or non-positive amount before any network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 12.5 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 0 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mints a token then creates the payment, and returns the gateway URL', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: u, body: String(init?.body ?? ''), auth: headers.Authorization ?? '' });
      if (u.endsWith('/Api/oauth/token')) {
        return json({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600 });
      }
      return json({ payment_token: { token: 'PTOK' } });
    });

    const r = await createMoncashOrder({ orderId: 'order-42', amountHtg: 1188 });
    expect(r).toEqual({
      ok: true,
      provider: 'direct',
      mode: 'sandbox',
      // Digicel verifies by the id WE chose, so our own reference is what gets
      // persisted — unlike Bazik, which mints its own.
      providerRef: 'order-42',
      redirectUrl:
        'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=PTOK',
    });

    expect(calls[0].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/Api/oauth/token');
    expect(calls[0].body).toBe('scope=read,write&grant_type=client_credentials');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);

    expect(calls[1].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/Api/v1/CreatePayment');
    expect(JSON.parse(calls[1].body)).toEqual({ amount: 1188, orderId: 'order-42' });
    expect(calls[1].auth).toBe('Bearer AT');
  });

  it('reuses the cached bearer within its 59-second life instead of re-authenticating', async () => {
    let oauthCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) {
        oauthCalls++;
        // 59s is what MonCash really returns. With a 60s safety window every
        // token would be born expired and every call would re-authenticate.
        return json({ access_token: 'AT', expires_in: 59 });
      }
      return json({ payment_token: { token: 'T' } });
    });

    await createMoncashOrder({ orderId: 'a', amountHtg: 100 });
    await createMoncashOrder({ orderId: 'b', amountHtg: 100 });
    expect(oauthCalls).toBe(1);
  });

  it('resolves a failure (never throws) when MonCash errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) return json({ access_token: 'AT', expires_in: 3600 });
      return new Response('gateway down', { status: 502 });
    });
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('502');
  });

  it('resolves a failure when the credentials are rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('401');
  });

  it('resolves a failure when the network is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r).toEqual({ ok: false, message: 'fetch failed' });
  });
});

describe('retrieveMoncashOrder', () => {
  beforeEach(withDirect);

  it('maps a successful retrieval', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) return json({ access_token: 'AT', expires_in: 3600 });
      return json({
        payment: {
          reference: 'order-42',
          transaction_id: '1234',
          cost: 1188,
          message: 'successful',
          payer: '50937001234',
        },
      });
    });

    const r = await retrieveMoncashOrder('order-42');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.transactionId).toBe('1234');
      expect(r.amountHtg).toBe(1188);
      expect(r.payer).toBe('50937001234');
    }
  });

  it('reports paid=false for an unpaid order rather than failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) return json({ access_token: 'AT', expires_in: 3600 });
      return json({ payment: { reference: 'o', message: 'pending' } });
    });
    const r = await retrieveMoncashOrder('o');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.paid).toBe(false);
  });
});

describe('retrieveMoncashByTransactionId', () => {
  it('asks Digicel by transaction id and returns OUR order id from payment.reference', async () => {
    withDirect();
    const calls: Array<{ url: string; body: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      if (String(url).endsWith('/Api/oauth/token')) return json({ access_token: 'AT', expires_in: 3600 });
      return json({
        payment: {
          reference: 'order-42',
          transaction_id: 'TX-9',
          cost: 2985,
          message: 'successful',
          payer: '50937001234',
        },
      });
    });

    const r = await retrieveMoncashByTransactionId('TX-9');
    expect(calls[1].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/Api/v1/RetrieveTransactionPayment');
    expect(JSON.parse(calls[1].body)).toEqual({ transactionId: 'TX-9' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.orderId).toBe('order-42');
      expect(r.paid).toBe(true);
      expect(r.transactionId).toBe('TX-9');
      expect(r.amountHtg).toBe(2985);
      expect(r.payer).toBe('50937001234');
    }
  });

  it('reports a missing reference as null rather than inventing an order id', async () => {
    withDirect();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) return json({ access_token: 'AT', expires_in: 3600 });
      return json({ payment: { transaction_id: 'TX-9', message: 'pending' } });
    });
    const r = await retrieveMoncashByTransactionId('TX-9');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.orderId).toBeNull();
      expect(r.paid).toBe(false);
    }
  });

  it('refuses a blank transaction id before any network call', async () => {
    withDirect();
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(retrieveMoncashByTransactionId('  ')).resolves.toEqual({
      ok: false,
      message: 'bad_transaction_id',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('is unsupported through Bazik — only Digicel answers to a transaction id', async () => {
    withBazik();
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(retrieveMoncashByTransactionId('TX-9')).resolves.toEqual({
      ok: false,
      message: 'unsupported_by_provider',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('moncashCheckoutAllowed', () => {
  it('is false when nothing is configured, whoever asks', () => {
    expect(moncashCheckoutAllowed(false)).toBe(false);
    expect(moncashCheckoutAllowed(true)).toBe(false);
  });

  it('allows a live rail to everyone', () => {
    withDirect();
    process.env.MONCASH_MODE = 'live';
    process.env.VERCEL_ENV = 'production';
    expect(moncashCheckoutAllowed(false)).toBe(true);
    expect(moncashCheckoutAllowed(true)).toBe(true);
  });

  it('allows a sandbox rail outside Vercel production', () => {
    withDirect();
    process.env.VERCEL_ENV = 'preview';
    expect(moncashCheckoutAllowed(false)).toBe(true);
    delete process.env.VERCEL_ENV;
    expect(moncashCheckoutAllowed(false)).toBe(true);
  });

  it('hides a sandbox rail in Vercel production from everyone but the admin', () => {
    withDirect();
    process.env.VERCEL_ENV = 'production';
    expect(moncashCheckoutAllowed(false)).toBe(false);
    expect(moncashCheckoutAllowed(true)).toBe(true);
  });
});
