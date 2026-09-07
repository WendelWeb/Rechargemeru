import { describe, it, expect, afterEach } from 'vitest';
import { siteUrl } from './site-url';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://x.y/';
    expect(siteUrl()).toBe('https://x.y');
  });

  it('prefers NEXT_PUBLIC_SITE_URL even on a Vercel preview', () => {
    process.env.NEXT_PUBLIC_SITE_URL = ' https://recharge.example ';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'abc.vercel.app';
    expect(siteUrl()).toBe('https://recharge.example');
  });

  it('uses VERCEL_URL outside production', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'abc.vercel.app';
    expect(siteUrl()).toBe('https://abc.vercel.app');
  });

  it('ignores VERCEL_URL in production (the canonical domain must be explicit)', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'abc.vercel.app';
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('falls back to localhost', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('treats a blank NEXT_PUBLIC_SITE_URL as unset', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '   ';
    delete process.env.VERCEL_URL;
    expect(siteUrl()).toBe('http://localhost:3000');
  });
});
