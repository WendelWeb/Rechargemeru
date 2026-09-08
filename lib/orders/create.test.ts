import { describe, it, expect } from 'vitest';
import { createOrderSchema } from './create';

/**
 * `createOrder` itself talks to the database, the settings store and a
 * payment provider, so what is unit-tested here is the boundary that decides
 * what a request is allowed to say about itself.
 *
 * The rule: everything about WHO is ordering — the Clerk user id and the
 * account's verified address — is read from the session by
 * `app/api/orders/route.ts` and passed to `createOrder` separately. The body
 * schema must therefore have no opinion to be overridden: a client that sends
 * `accountEmail` has that key dropped before anything reads it, so no request
 * can have an order's confirmations delivered to an address of its choosing.
 */
const BODY = {
  usdCents: 2000,
  method: 'moncash',
  customerName: 'Jean Baptiste',
  customerPhone: '+50937001234',
  customerEmail: 'jean@mail.com',
  meruAccountType: 'email',
  meruAccount: 'jean@mail.com',
  locale: 'fr',
  expectedTotalHtg: 2783,
  settingsUpdatedAt: '2026-09-06T12:00:00.000Z',
} as const;

describe('createOrderSchema', () => {
  it('accepts an ordinary order body', () => {
    const parsed = createOrderSchema.safeParse(BODY);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.customerEmail).toBe('jean@mail.com');
  });

  it('drops an account address the request tried to dictate', () => {
    const parsed = createOrderSchema.safeParse({ ...BODY, accountEmail: 'attaquant@example.com' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('accountEmail');
    expect(JSON.stringify(parsed.data)).not.toContain('attaquant@example.com');
  });

  it('drops a Clerk user id the request tried to dictate', () => {
    const parsed = createOrderSchema.safeParse({ ...BODY, clerkUserId: 'user_somebody_else' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('clerkUserId');
  });
});
