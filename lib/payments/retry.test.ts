import { describe, it, expect } from 'vitest';
import { isTransient, retrieveWithRetry, paymentSettled, DEFAULT_RETRY_DELAYS_MS } from './retry';

describe('isTransient', () => {
  it('treats timeouts, 5xx and network errors as worth asking again', () => {
    for (const m of [
      'timeout',
      'network',
      'HTTP 500',
      'HTTP 502 — gateway down',
      'HTTP 503 Service Unavailable',
      'fetch failed',
      'ECONNRESET',
      'socket hang up',
    ]) {
      expect(isTransient(m), m).toBe(true);
    }
  });

  it('treats real answers as final', () => {
    for (const m of [
      'not_configured',
      'not_found',
      'order_provider_unavailable',
      'unsupported_by_provider',
      'HTTP 400 — Amount and userID are required',
      'HTTP 401',
      'HTTP 404',
      'bad_json',
      '',
    ]) {
      expect(isTransient(m), m).toBe(false);
    }
  });
});

type Answer = { ok: true; paid: boolean } | { ok: false; message: string };
const settled = (r: Answer) => (r.ok ? r.paid : !isTransient(r.message));

describe('paymentSettled', () => {
  it('a paid answer is always final', () => {
    expect(paymentSettled({ ok: true, paid: true })).toBe(true);
    expect(paymentSettled({ ok: true, paid: true }, { retryOnUnpaid: true })).toBe(true);
  });

  it('an unpaid answer is final unless the caller wants to wait for the wallet', () => {
    expect(paymentSettled({ ok: true, paid: false })).toBe(true);
    expect(paymentSettled({ ok: true, paid: false }, { retryOnUnpaid: false })).toBe(true);
    expect(paymentSettled({ ok: true, paid: false }, { retryOnUnpaid: true })).toBe(false);
  });

  it('a failure is final unless transient', () => {
    expect(paymentSettled({ ok: false, message: 'not_found' })).toBe(true);
    expect(paymentSettled({ ok: false, message: 'unsupported_by_provider' })).toBe(true);
    expect(paymentSettled({ ok: false, message: 'timeout' })).toBe(false);
    expect(paymentSettled({ ok: false, message: 'HTTP 503' }, { retryOnUnpaid: true })).toBe(false);
  });
});

describe('retrieveWithRetry', () => {
  it('uses a 400 ms then 900 ms schedule by default', () => {
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([400, 900]);
  });

  it('returns immediately when the first answer is settled', async () => {
    let calls = 0;
    const r = await retrieveWithRetry<Answer>(
      async () => {
        calls++;
        return { ok: true, paid: true };
      },
      settled,
      [0, 0],
    );
    expect(r).toEqual({ ok: true, paid: true });
    expect(calls).toBe(1);
  });

  it('retries a transient failure until the provider answers', async () => {
    const answers: Answer[] = [{ ok: false, message: 'timeout' }, { ok: false, message: 'HTTP 502' }, { ok: true, paid: true }];
    let calls = 0;
    const r = await retrieveWithRetry<Answer>(async () => answers[calls++], settled, [0, 0]);
    expect(r).toEqual({ ok: true, paid: true });
    expect(calls).toBe(3);
  });

  it('retries a "not paid yet" answer when the caller says it is not settled', async () => {
    const answers: Answer[] = [{ ok: true, paid: false }, { ok: true, paid: true }];
    let calls = 0;
    const r = await retrieveWithRetry<Answer>(async () => answers[calls++], settled, [0, 0]);
    expect(r).toEqual({ ok: true, paid: true });
    expect(calls).toBe(2);
  });

  it('gives up after the schedule and returns the last answer', async () => {
    let calls = 0;
    const r = await retrieveWithRetry<Answer>(
      async () => {
        calls++;
        return { ok: false, message: 'timeout' };
      },
      settled,
      [0, 0],
    );
    expect(r).toEqual({ ok: false, message: 'timeout' });
    expect(calls).toBe(3);
  });

  it('does not retry a final answer', async () => {
    let calls = 0;
    const r = await retrieveWithRetry<Answer>(
      async () => {
        calls++;
        return { ok: false, message: 'not_found' };
      },
      settled,
      [0, 0],
    );
    expect(r).toEqual({ ok: false, message: 'not_found' });
    expect(calls).toBe(1);
  });
});
