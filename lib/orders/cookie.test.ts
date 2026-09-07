import { describe, it, expect, afterEach, vi } from 'vitest';
import { ORDER_COOKIE, orderCookieOptions, readOrderCookie } from './cookie';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ORDER_COOKIE', () => {
  it('is the cookie the public actions and the API share', () => {
    expect(ORDER_COOKIE).toBe('rm_order');
  });
});

describe('readOrderCookie', () => {
  it('returns null without a Cookie header', () => {
    expect(readOrderCookie(null)).toBeNull();
    expect(readOrderCookie('')).toBeNull();
    expect(readOrderCookie('   ')).toBeNull();
  });

  it('reads a canonical reference', () => {
    expect(readOrderCookie('rm_order=MR-7F3K2QAB')).toBe('MR-7F3K2QAB');
  });

  it('finds the cookie among others and ignores whitespace around pairs', () => {
    expect(readOrderCookie('a=1;  rm_order=MR-7F3K2QAB ; b=2')).toBe('MR-7F3K2QAB');
    expect(readOrderCookie('meru_admin=abc.def; rm_order=MR-7F3K2QAB')).toBe('MR-7F3K2QAB');
  });

  it('normalizes the stored value (case, separators, missing prefix, URL encoding)', () => {
    expect(readOrderCookie('rm_order=mr%207f3k%202qab')).toBe('MR-7F3K2QAB');
    expect(readOrderCookie('rm_order=7f3k2qab')).toBe('MR-7F3K2QAB');
    expect(readOrderCookie('rm_order=mr_7f3k-2qab')).toBe('MR-7F3K2QAB');
  });

  it('does not confuse similarly named cookies', () => {
    expect(readOrderCookie('rm_order_x=MR-7F3K2QAB')).toBeNull();
    expect(readOrderCookie('xrm_order=MR-7F3K2QAB')).toBeNull();
    expect(readOrderCookie('rm_order')).toBeNull();
  });

  it('returns null for a value that is not a reference', () => {
    expect(readOrderCookie('rm_order=hello')).toBeNull();
    expect(readOrderCookie('rm_order=')).toBeNull();
    expect(readOrderCookie('rm_order=MR-7F3K2QA0')).toBeNull(); // 0 is not in the alphabet
    expect(readOrderCookie('rm_order=%E0%A4%A')).toBeNull(); // malformed percent-encoding
  });

  it('takes the first occurrence when the header repeats the cookie', () => {
    expect(readOrderCookie('rm_order=MR-AAAAAAAA; rm_order=MR-BBBBBBBB')).toBe('MR-AAAAAAAA');
  });
});

describe('orderCookieOptions', () => {
  it('is HttpOnly, Lax, root path, for the order TTL plus one hour', () => {
    expect(orderCookieOptions(30)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 90 * 60,
    });
    expect(orderCookieOptions(5).maxAge).toBe(65 * 60);
  });

  it('is Secure only in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(orderCookieOptions(30).secure).toBe(true);
  });

  it('never yields a negative or fractional max age', () => {
    expect(orderCookieOptions(-500).maxAge).toBe(60 * 60);
    expect(orderCookieOptions(7.5).maxAge).toBe(67 * 60);
  });
});
