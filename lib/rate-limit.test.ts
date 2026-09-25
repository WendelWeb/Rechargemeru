import { describe, it, expect } from 'vitest';
import { allowHit, rateLimit, ipFromHeaders, RATE_LIMITS } from './rate-limit';

const WINDOW = { max: 3, windowMs: 10_000 };

describe('allowHit — pure sliding window', () => {
  it('allows up to max hits inside the window, then refuses', () => {
    const hits = new Map<string, number[]>();
    expect(allowHit(hits, 'ip-1', 0, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 2_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 3_000, WINDOW)).toBe(false);
  });

  it('hits expire once the window has passed', () => {
    const hits = new Map<string, number[]>();
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(false);
    expect(allowHit(hits, 'ip-1', WINDOW.windowMs, WINDOW)).toBe(true);
  });

  it('a refused hit is not recorded (refusals do not extend the lockout)', () => {
    const hits = new Map<string, number[]>();
    allowHit(hits, 'k', 0, { max: 1, windowMs: 10_000 });
    expect(allowHit(hits, 'k', 9_000, { max: 1, windowMs: 10_000 })).toBe(false);
    expect(hits.get('k')).toEqual([0]);
    expect(allowHit(hits, 'k', 10_000, { max: 1, windowMs: 10_000 })).toBe(true);
  });
});

describe('rateLimit — bucket+key keyed shared window', () => {
  it('applies the window per bucket+key', () => {
    const key = `test-ip-${Date.now()}`;
    const window = { max: 2, windowMs: 10_000 };
    const now = Date.now();
    expect(rateLimit('bucket-a', key, window, now)).toBe(true);
    expect(rateLimit('bucket-a', key, window, now)).toBe(true);
    expect(rateLimit('bucket-a', key, window, now)).toBe(false);
  });

  it('two buckets for the same key never share a quota', () => {
    const key = `test-ip-shared-${Date.now()}`;
    const window = { max: 1, windowMs: 10_000 };
    const now = Date.now();
    expect(rateLimit('bucket-b1', key, window, now)).toBe(true);
    expect(rateLimit('bucket-b1', key, window, now)).toBe(false);
    expect(rateLimit('bucket-b2', key, window, now)).toBe(true);
  });

  it('two different keys in the same bucket never block each other', () => {
    const window = { max: 1, windowMs: 10_000 };
    const now = Date.now();
    const keyA = `test-ip-a-${now}`;
    const keyB = `test-ip-b-${now}`;
    expect(rateLimit('bucket-c', keyA, window, now)).toBe(true);
    expect(rateLimit('bucket-c', keyA, window, now)).toBe(false);
    expect(rateLimit('bucket-c', keyB, window, now)).toBe(true);
  });

  it('accepts a phone number as the key (orderPhone bucket)', () => {
    const phone = '+50937001234';
    const bucket = `orderPhone-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < RATE_LIMITS.orderPhone.max; i++) {
      expect(rateLimit(bucket, phone, RATE_LIMITS.orderPhone, now)).toBe(true);
    }
    expect(rateLimit(bucket, phone, RATE_LIMITS.orderPhone, now)).toBe(false);
    expect(rateLimit(bucket, phone, RATE_LIMITS.orderPhone, now + RATE_LIMITS.orderPhone.windowMs)).toBe(true);
  });
});

describe('ipFromHeaders', () => {
  it('reads the first hop of x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' });
    expect(ipFromHeaders(h)).toBe('203.0.113.9');
  });

  it('trims whitespace around the first hop', () => {
    const h = new Headers({ 'x-forwarded-for': '  203.0.113.9  , 70.41.3.18' });
    expect(ipFromHeaders(h)).toBe('203.0.113.9');
  });

  it('falls back to "unknown" when the header is absent or empty', () => {
    expect(ipFromHeaders(new Headers())).toBe('unknown');
    expect(ipFromHeaders(new Headers({ 'x-forwarded-for': '' }))).toBe('unknown');
  });
});

describe('RATE_LIMITS', () => {
  it('defines the eight named windows with the agreed budgets', () => {
    expect(RATE_LIMITS.orderIp).toEqual({ max: 60, windowMs: 600_000 });
    expect(RATE_LIMITS.orderPhone).toEqual({ max: 5, windowMs: 600_000 });
    expect(RATE_LIMITS.recheck).toEqual({ max: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.retour).toEqual({ max: 20, windowMs: 300_000 });
    expect(RATE_LIMITS.track).toEqual({ max: 20, windowMs: 300_000 });
    expect(RATE_LIMITS.login).toEqual({ max: 10, windowMs: 900_000 });
    expect(RATE_LIMITS.visit).toEqual({ max: 120, windowMs: 600_000 });
    expect(RATE_LIMITS.events).toEqual({ max: 240, windowMs: 600_000 });
    expect(Object.keys(RATE_LIMITS)).toHaveLength(8);
  });

  it('every window is positive', () => {
    for (const w of Object.values(RATE_LIMITS)) {
      expect(w.max).toBeGreaterThan(0);
      expect(w.windowMs).toBeGreaterThan(0);
    }
  });
});
