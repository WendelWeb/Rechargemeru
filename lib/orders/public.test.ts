import { describe, it, expect } from 'vitest';
import type { OrderRow } from '@/lib/orders/types';
import { canSeeFullOrder, toFullOrder, toPublicOrder } from './public';

const NOW = new Date('2026-09-06T12:10:00Z');
const CREATED = new Date('2026-09-06T12:00:00Z');

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    reference: 'MR-7F3K2QAB',
    status: 'pending_payment',
    method: 'natcash',
    provider: 'kobara',
    providerRef: 'KOB_1',
    providerTransactionId: null,
    payerWallet: null,
    mode: 'live',
    usdCents: 2000,
    fxRateHtg: 132.5,
    baseHtg: 2650,
    feeLines: [{ id: 'svc', label: 'Frais de service', kind: 'percent', value: 5, basis: 'base', amountHtg: 133 }],
    totalHtg: 2783,
    paidHtg: null,
    fulfilledUsdCents: null,
    refundHtg: null,
    refundWallet: null,
    clerkUserId: null,
    customerName: 'Jean Baptiste',
    customerPhone: '+50937001234',
    customerEmail: 'jean@mail.com',
    meruAccountType: 'email',
    meruAccount: 'jean@mail.com',
    meruReference: null,
    redirectUrl: 'https://pay.example/x',
    redirectExpiresAt: new Date(CREATED.getTime() + 600_000),
    returnedAt: null,
    lastVerifiedAt: null,
    verifyAttempts: 0,
    failureReason: null,
    adminNote: null,
    locale: 'fr',
    createdAt: CREATED,
    updatedAt: CREATED,
    expiresAt: new Date(CREATED.getTime() + 1_800_000),
    paidAt: null,
    fulfilledAt: null,
    ...overrides,
  };
}

describe('toPublicOrder', () => {
  it('exposes only masked identity and the frozen receipt', () => {
    const p = toPublicOrder(makeOrder(), null, NOW);
    expect(p.reference).toBe('MR-7F3K2QAB');
    expect(p.firstName).toBe('Jean B.');
    expect(p.maskedPhone).toBe('+509 •••• 1234');
    expect(p.maskedMeruAccount).toBe('je•••@ma•••.com');
    expect(p.meruAccountType).toBe('email');
    expect(p.totalHtg).toBe(2783);
    expect(p.baseHtg).toBe(2650);
    expect(p.feeLines).toHaveLength(1);
    expect(p.effectiveRateHtg).toBe(139.15);
    expect(p.hasRedirect).toBe(true);
    expect(p.orderId).toBe('33333333-3333-4333-8333-333333333333');
    const keys = Object.keys(p);
    for (const hidden of ['customerName', 'customerPhone', 'customerEmail', 'meruAccount', 'redirectUrl', 'meruReference']) {
      expect(keys).not.toContain(hidden);
    }
  });

  it('handles single-word and multi-word names', () => {
    expect(toPublicOrder(makeOrder({ customerName: 'Widelene' }), null, NOW).firstName).toBe('Widelene');
    expect(toPublicOrder(makeOrder({ customerName: '  marie  claire   pierre ' }), null, NOW).firstName).toBe('Marie P.');
  });

  it('flags the verification window after a return and while the redirect is fresh', () => {
    const returned = toPublicOrder(makeOrder({ returnedAt: new Date(NOW.getTime() - 60_000) }), null, NOW);
    expect(returned.checking).toBe(true);
    expect(returned.status).toBe('pending_payment');

    const fresh = toPublicOrder(makeOrder(), null, NOW);
    expect(fresh.checking).toBe(true);

    const verifiedUnpaid = toPublicOrder(makeOrder(), new Date(NOW.getTime() - 30_000), NOW);
    expect(verifiedUnpaid.checking).toBe(false);

    const old = toPublicOrder(makeOrder({ createdAt: new Date(NOW.getTime() - 20 * 60_000) }), null, NOW);
    expect(old.checking).toBe(false);

    const paid = toPublicOrder(makeOrder({ status: 'paid', returnedAt: NOW }), null, NOW);
    expect(paid.checking).toBe(false);
  });

  it('derives expiry for a stale pending order, but not while still checking', () => {
    const stale = makeOrder({
      createdAt: new Date(NOW.getTime() - 40 * 60_000),
      expiresAt: new Date(NOW.getTime() - 10 * 60_000),
    });
    expect(toPublicOrder(stale, null, NOW).status).toBe('expired');
    const justBack = { ...stale, returnedAt: new Date(NOW.getTime() - 30_000) };
    const p = toPublicOrder(justBack, null, NOW);
    expect(p.status).toBe('pending_payment');
    expect(p.checking).toBe(true);
  });
});

describe('toFullOrder', () => {
  it('adds the private fields on top of the public ones', () => {
    const f = toFullOrder(makeOrder({ meruReference: 'MERU-1', fulfilledUsdCents: 2000 }), null, NOW);
    expect(f.customerName).toBe('Jean Baptiste');
    expect(f.customerPhone).toBe('+50937001234');
    expect(f.customerEmail).toBe('jean@mail.com');
    expect(f.meruAccount).toBe('jean@mail.com');
    expect(f.meruReference).toBe('MERU-1');
    expect(f.fulfilledUsdCents).toBe(2000);
    expect(f.redirectUrl).toBe('https://pay.example/x');
    expect(f.maskedPhone).toBe('+509 •••• 1234');
  });
});

describe('canSeeFullOrder', () => {
  it('matches the cookie reference in any spelling and refuses everything else', () => {
    const o = makeOrder();
    expect(canSeeFullOrder(o, 'MR-7F3K2QAB')).toBe(true);
    expect(canSeeFullOrder(o, 'mr 7f3k 2qab')).toBe(true);
    expect(canSeeFullOrder(o, '7F3K2QAB')).toBe(true);
    expect(canSeeFullOrder(o, 'MR-AAAAAAAA')).toBe(false);
    expect(canSeeFullOrder(o, '')).toBe(false);
    expect(canSeeFullOrder(o, null)).toBe(false);
    expect(canSeeFullOrder(o, undefined)).toBe(false);
  });

  it('opens the order to the account that placed it, with no cookie at all', () => {
    const o = makeOrder({ clerkUserId: 'user_owner' });
    expect(canSeeFullOrder(o, null, 'user_owner')).toBe(true);
    expect(canSeeFullOrder(o, undefined, 'user_owner')).toBe(true);
    expect(canSeeFullOrder(o, 'MR-AAAAAAAA', 'user_owner')).toBe(true);
  });

  it('refuses another signed-in account', () => {
    const o = makeOrder({ clerkUserId: 'user_owner' });
    expect(canSeeFullOrder(o, null, 'user_someone_else')).toBe(false);
  });

  it('never lets two nulls match on a guest order', () => {
    const guest = makeOrder({ clerkUserId: null });
    expect(canSeeFullOrder(guest, null, null)).toBe(false);
    expect(canSeeFullOrder(guest, null, '')).toBe(false);
    // …and the cookie still works for the browser that created it.
    expect(canSeeFullOrder(guest, 'MR-7F3K2QAB', null)).toBe(true);
  });
});
