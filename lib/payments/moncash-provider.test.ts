/**
 * Provider selection and the Bazik provider.
 *
 * The property that matters most on this rail: the facade must never quietly
 * charge through a different company than the operator asked for, and in
 * production it must refuse to guess at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pickMoncashProvider,
  moncashConfigured,
  moncashProviderId,
  moncashLabel,
  createMoncashOrder,
  retrieveMoncashOrder,
  retrieveMoncashOrderFrom,
  resetMoncashTokenCache,
} from '@/lib/payments/moncash';
import { isBazikPaid, bazikMode, tokenExpiryMs } from '@/lib/payments/moncash/bazik';

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
    'BAZIK_MODE',
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

describe('pickMoncashProvider', () => {
  const none = { direct: false, bazik: false };
  const both = { direct: true, bazik: true };

  it('falls back to whichever provider has credentials outside production', () => {
    expect(pickMoncashProvider(undefined, { direct: true, bazik: false }, false)).toBe('direct');
    expect(pickMoncashProvider(undefined, { direct: false, bazik: true }, false)).toBe('bazik');
    expect(pickMoncashProvider(undefined, none, false)).toBeNull();
  });

  it('prefers direct when both are configured — it is the cheaper path', () => {
    expect(pickMoncashProvider(undefined, both, false)).toBe('direct');
  });

  it('honours an explicit choice', () => {
    expect(pickMoncashProvider('bazik', both, false)).toBe('bazik');
    expect(pickMoncashProvider('direct', both, false)).toBe('direct');
    expect(pickMoncashProvider('  BAZIK  ', both, false)).toBe('bazik');
    expect(pickMoncashProvider('bazik', both, true)).toBe('bazik');
    expect(pickMoncashProvider('direct', both, true)).toBe('direct');
  });

  it('refuses rather than substituting when the named provider is unconfigured', () => {
    expect(pickMoncashProvider('bazik', { direct: true, bazik: false }, false)).toBeNull();
    expect(pickMoncashProvider('direct', { direct: false, bazik: true }, false)).toBeNull();
    expect(pickMoncashProvider('bazik', { direct: true, bazik: false }, true)).toBeNull();
  });

  it('treats an unknown name as "no preference" outside production', () => {
    expect(pickMoncashProvider('paypal', { direct: true, bazik: false }, false)).toBe('direct');
  });

  /**
   * Fail closed: in production the operator must SAY which company moves the
   * money. Guessing from whichever credentials happen to be present is how a
   * rotated key silently switches providers on a live site.
   */
  it('fails closed in production when MONCASH_PROVIDER is empty or unknown', () => {
    expect(pickMoncashProvider(undefined, both, true)).toBeNull();
    expect(pickMoncashProvider('', both, true)).toBeNull();
    expect(pickMoncashProvider('   ', both, true)).toBeNull();
    expect(pickMoncashProvider('paypal', both, true)).toBeNull();
  });
});

describe('facade wiring', () => {
  it('is unconfigured until some provider has credentials', () => {
    expect(moncashConfigured()).toBe(false);
    expect(moncashProviderId()).toBeNull();
    expect(moncashLabel()).toBe('aucun fournisseur configuré');
    withBazik();
    expect(moncashConfigured()).toBe(true);
    expect(moncashProviderId()).toBe('bazik');
    expect(moncashLabel()).toContain('Bazik');
  });

  it('routes to the provider named by MONCASH_PROVIDER', () => {
    withDirect();
    withBazik();
    expect(moncashProviderId()).toBe('direct');
    process.env.MONCASH_PROVIDER = 'bazik';
    expect(moncashProviderId()).toBe('bazik');
  });

  it('in production, resolves nothing until MONCASH_PROVIDER is explicit', () => {
    withDirect();
    withBazik();
    vi.stubEnv('NODE_ENV', 'production');
    expect(moncashProviderId()).toBeNull();
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_PROVIDER = 'bazik';
    expect(moncashProviderId()).toBe('bazik');
  });

  it('never throws when nothing is configured', async () => {
    await expect(createMoncashOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    await expect(retrieveMoncashOrder('o')).resolves.toEqual({ ok: false, message: 'not_configured' });
  });
});

describe('bazik provider', () => {
  beforeEach(withBazik);

  it('authenticates, then creates a payment and returns BAZIK’s own order id', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), body: String(init?.body ?? ''), auth: headers.Authorization ?? '' });
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ access_token: 'AT', token_type: 'bearer', expires_in: 86400, user_id: 'bzk_u' });
      }
      return json({
        success: true,
        data: {
          orderId: 'BZK_sandbox_abc_123',
          redirectUrl: 'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/xyz',
        },
      });
    });

    const r = await createMoncashOrder({
      orderId: 'our-order-1',
      amountHtg: 1188,
      description: 'Recharge Meru MR-ABCDEFGH',
      successUrl: 'https://example.test/api/payments/moncash/retour?orderId=our-order-1',
      errorUrl: 'https://example.test/fr/commande/MR-ABCDEFGH?cancelled=1',
      webhookUrl: 'https://example.test/api/webhooks/moncash?orderId=our-order-1',
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe('bazik');
      // THE point of providerRef: Bazik's id, not ours.
      expect(r.providerRef).toBe('BZK_sandbox_abc_123');
      expect(r.redirectUrl).toContain('moncashbutton');
      expect(r.mode).toBe('sandbox');
    }

    expect(calls[0].url).toBe('https://api.bazik.io/token');
    expect(JSON.parse(calls[0].body)).toEqual({ userID: 'bzk_sandbox_abc', secretKey: 'sk_sandbox_xyz' });

    expect(calls[1].url).toBe('https://api.bazik.io/moncash/token');
    expect(calls[1].auth).toBe('Bearer AT');
    const sent = JSON.parse(calls[1].body);
    expect(sent.gdes).toBe(1188);
    expect(sent.referenceId).toBe('our-order-1');
    // The user id comes from the TOKEN response, not the env value.
    expect(sent.userID).toBe('bzk_u');
    expect(sent.description).toBe('Recharge Meru MR-ABCDEFGH');
    expect(sent.successUrl).toBe('https://example.test/api/payments/moncash/retour?orderId=our-order-1');
    expect(sent.errorUrl).toBe('https://example.test/fr/commande/MR-ABCDEFGH?cancelled=1');
    expect(sent.webhookUrl).toBe('https://example.test/api/webhooks/moncash?orderId=our-order-1');
  });

  it('verifies by GET /order/{their id}', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      urls.push(String(url));
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ access_token: 'AT', expires_in: 86400, user_id: 'u' });
      }
      return json({
        success: true,
        data: { status: 'successful', gdes: 1188, transactionId: 'TX9', payer: '50937001234' },
      });
    });

    const r = await retrieveMoncashOrder('BZK_sandbox_abc_123');
    expect(urls[1]).toBe('https://api.bazik.io/order/BZK_sandbox_abc_123');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.amountHtg).toBe(1188);
      expect(r.transactionId).toBe('TX9');
      expect(r.payer).toBe('50937001234');
    }
  });

  it('surfaces Bazik’s own error message instead of a bare status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: 'Missing required parameters', message: 'Amount and userID are required' }, 400),
    );
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Amount and userID are required');
  });

  it('rejects a fractional amount before any network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(createMoncashOrder({ orderId: 'o', amountHtg: 12.5 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves a timeout as a message, never an exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    await expect(createMoncashOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'timeout',
    });
  });
});

describe('isBazikPaid', () => {
  it('accepts the spellings a gateway plausibly uses', () => {
    for (const s of ['successful', 'success', 'completed', 'paid', 'SUCCESSFUL']) {
      expect(isBazikPaid({ data: { status: s } }), s).toBe(true);
    }
    expect(isBazikPaid({ data: { paid: true } })).toBe(true);
    expect(isBazikPaid({ status: 'successful' })).toBe(true); // flat, as the live API answers
  });

  /** Erring toward "unpaid" only delays the recharge; erring the other way sends real dollars. */
  it('treats anything unrecognised as UNPAID', () => {
    for (const s of ['pending', 'failed', 'cancelled', 'processing', '']) {
      expect(isBazikPaid({ data: { status: s } }), s).toBe(false);
    }
    expect(isBazikPaid({ data: {} })).toBe(false);
    expect(isBazikPaid({})).toBe(false);
    expect(isBazikPaid(null)).toBe(false);
    expect(isBazikPaid('successful')).toBe(false);
  });
});

describe('retrieveMoncashOrderFrom — verifies through the SAME provider that created the order', () => {
  it('with no providerId, falls back to the env-driven pick', async () => {
    withBazik();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ access_token: 'AT', expires_in: 86400, user_id: 'u' });
      }
      return json({ success: true, data: { status: 'successful', gdes: 100 } });
    });
    const r = await retrieveMoncashOrderFrom(null, 'BZK_sandbox_x');
    expect(r.ok).toBe(true);
  });

  it('asks the order-creating provider even when the OTHER one is now the env default', async () => {
    withDirect();
    withBazik();
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      calls.push(String(url));
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ access_token: 'AT', expires_in: 86400, user_id: 'u' });
      }
      return json({ success: true, data: { status: 'successful', gdes: 100 } });
    });
    const r = await retrieveMoncashOrderFrom('bazik', 'BZK_sandbox_x');
    expect(r.ok).toBe(true);
    expect(calls.some((u) => u.includes('api.bazik.io'))).toBe(true);
    expect(calls.some((u) => u.includes('digicelgroup'))).toBe(false);
  });

  it('asks the order-creating provider even when production has no MONCASH_PROVIDER any more', async () => {
    // The order was created through `bazik`; whatever the facade resolves to
    // today, verification of an existing order goes back to Bazik.
    withBazik();
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ access_token: 'AT', expires_in: 86400, user_id: 'u' });
      }
      return json({ success: true, data: { status: 'successful', gdes: 100 } });
    });
    const r = await retrieveMoncashOrderFrom('bazik', 'BZK_sandbox_x');
    expect(r.ok).toBe(true);
  });

  it('refuses rather than silently asking the OTHER provider when the order-creating one is gone', async () => {
    withBazik();
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await retrieveMoncashOrderFrom('direct', 'our-order-id');
    expect(r).toEqual({ ok: false, message: 'order_provider_unavailable' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('bazik: the live API disagrees with its own docs', () => {
  it('reads the token from `token` (live) as well as `access_token` (docs)', async () => {
    process.env.BAZIK_ID = 'bzk_ed99283b_1786543705';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url) === 'https://api.bazik.io/token') {
        return json({
          success: true,
          token: 'LIVE_TOKEN',
          user_id: 'bzk_ed99283b_1786543705',
          expires_at: Date.now() + 86_400_000,
          message: 'Authentication successful',
        });
      }
      seen.push(((init?.headers ?? {}) as Record<string, string>).Authorization ?? '');
      return json({ orderId: 'BZK_production_x', redirectUrl: 'https://pay/x', environment: 'production' });
    });

    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 5 });
    expect(r.ok).toBe(true);
    expect(seen[0]).toBe('Bearer LIVE_TOKEN');
  });

  it('reads orderId/redirectUrl FLAT, not wrapped in `data`, and believes the response about the mode', async () => {
    process.env.BAZIK_ID = 'bzk_x';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://api.bazik.io/token') {
        return json({ token: 'T', user_id: 'u', expires_at: Date.now() + 60_000 });
      }
      return json({
        orderId: 'BZK_production_ed99283b_1786583330619_r2rb',
        // Digicel's own SDK emits http:// and Bazik passes it through.
        redirectUrl: 'http://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=abc',
        environment: 'production',
        status: 'pending',
      });
    });

    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerRef).toBe('BZK_production_ed99283b_1786583330619_r2rb');
      // A buyer types a wallet PIN on that page — it must never be plaintext.
      expect(r.redirectUrl.startsWith('https://')).toBe(true);
      expect(r.mode).toBe('live');
    }
  });

  it('defaults to live when the credential says nothing — over-warning is the safe direction', () => {
    process.env.BAZIK_ID = 'bzk_ed99283b_1786543705';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    expect(bazikMode()).toBe('live');
    process.env.BAZIK_MODE = 'sandbox';
    expect(bazikMode()).toBe('sandbox');
    delete process.env.BAZIK_MODE;
    process.env.BAZIK_ID = 'bzk_sandbox_abc';
    expect(bazikMode()).toBe('sandbox');
  });

  it('accepts BAZIK_ID as well as BAZIK_USER_ID', () => {
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    process.env.BAZIK_ID = 'bzk_a';
    expect(moncashProviderId()).toBe('bazik');
    delete process.env.BAZIK_ID;
    process.env.BAZIK_USER_ID = 'bzk_a';
    expect(moncashProviderId()).toBe('bazik');
  });

  it('tokenExpiryMs handles both expiry styles and never returns the past', () => {
    const now = 1_000_000_000_000;
    expect(tokenExpiryMs({ expires_at: now + 86_400_000 }, now)).toBe(now + 86_400_000 - 60_000);
    expect(tokenExpiryMs({ expires_in: 3600 }, now)).toBe(now + (3600 - 60) * 1000);
    expect(tokenExpiryMs({ expires_at: now - 5000 }, now)).toBe(now + 60_000);
    expect(tokenExpiryMs({}, now)).toBe(now + 300_000);
  });
});
