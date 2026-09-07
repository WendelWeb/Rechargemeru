import { describe, it, expect } from 'vitest';
import {
  ACTIONABLE_STATUSES,
  PENDING_CHECK_WINDOW_MS,
  TRANSITIONS,
  allowedFrom,
  canTransition,
  inCheckingWindow,
  isExpired,
  statusLabelFr,
} from './transitions';
import type { OrderStatus } from './types';

const ALL_STATUSES = [
  'pending_payment',
  'paid',
  'needs_review',
  'fulfilled',
  'failed',
  'expired',
  'cancelled',
  'refunded',
] as const satisfies readonly OrderStatus[];

const minutes = (n: number) => n * 60_000;
const NOW = new Date('2026-09-06T18:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - minutes(min));

describe('TRANSITIONS', () => {
  it('lists every status exactly once', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('matches the spec table', () => {
    expect([...TRANSITIONS.pending_payment]).toEqual(['paid', 'needs_review', 'failed', 'expired', 'cancelled']);
    expect([...TRANSITIONS.paid]).toEqual(['fulfilled', 'refunded', 'needs_review']);
    expect([...TRANSITIONS.needs_review]).toEqual(['fulfilled', 'refunded', 'failed']);
    expect([...TRANSITIONS.fulfilled]).toEqual([]);
    for (const s of ['failed', 'expired', 'cancelled', 'refunded'] as const) {
      expect([...TRANSITIONS[s]]).toEqual(['needs_review']);
    }
  });

  it('never allows a status to transition to itself', () => {
    for (const s of ALL_STATUSES) expect(TRANSITIONS[s]).not.toContain(s);
  });
});

describe('canTransition', () => {
  it('accepts the allowed pairs', () => {
    const allowed: [OrderStatus, OrderStatus][] = [
      ['pending_payment', 'paid'],
      ['pending_payment', 'needs_review'],
      ['pending_payment', 'failed'],
      ['pending_payment', 'expired'],
      ['pending_payment', 'cancelled'],
      ['paid', 'fulfilled'],
      ['paid', 'refunded'],
      ['paid', 'needs_review'],
      ['needs_review', 'fulfilled'],
      ['needs_review', 'refunded'],
      ['needs_review', 'failed'],
      ['failed', 'needs_review'],
      ['expired', 'needs_review'],
      ['cancelled', 'needs_review'],
      ['refunded', 'needs_review'],
    ];
    for (const [from, to] of allowed) expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
  });

  it('refuses the forbidden pairs', () => {
    const refused: [OrderStatus, OrderStatus][] = [
      ['fulfilled', 'paid'],
      ['fulfilled', 'refunded'],
      ['fulfilled', 'needs_review'],
      ['fulfilled', 'failed'],
      ['paid', 'pending_payment'],
      ['paid', 'failed'],
      ['paid', 'expired'],
      ['paid', 'cancelled'],
      ['paid', 'paid'],
      ['needs_review', 'paid'],
      ['needs_review', 'cancelled'],
      ['needs_review', 'expired'],
      ['expired', 'paid'],
      ['expired', 'fulfilled'],
      ['failed', 'paid'],
      ['cancelled', 'paid'],
      ['refunded', 'fulfilled'],
      ['refunded', 'paid'],
      ['pending_payment', 'fulfilled'],
      ['pending_payment', 'refunded'],
    ];
    for (const [from, to] of refused) expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
  });

  it('fulfilled is terminal', () => {
    for (const to of ALL_STATUSES) expect(canTransition('fulfilled', to)).toBe(false);
  });
});

describe('allowedFrom', () => {
  it('needs_review can be reached from six statuses', () => {
    const sources = allowedFrom('needs_review');
    expect(sources).toHaveLength(6);
    expect(sources).toEqual(
      expect.arrayContaining(['pending_payment', 'paid', 'failed', 'expired', 'cancelled', 'refunded']),
    );
    expect(sources).not.toContain('needs_review');
    expect(sources).not.toContain('fulfilled');
  });

  it('is the exact inverse of TRANSITIONS', () => {
    expect(allowedFrom('paid')).toEqual(['pending_payment']);
    expect(allowedFrom('fulfilled')).toEqual(['paid', 'needs_review']);
    expect(allowedFrom('refunded')).toEqual(['paid', 'needs_review']);
    expect(allowedFrom('failed')).toEqual(['pending_payment', 'needs_review']);
    expect(allowedFrom('expired')).toEqual(['pending_payment']);
    expect(allowedFrom('cancelled')).toEqual(['pending_payment']);
    expect(allowedFrom('pending_payment')).toEqual([]);
    for (const to of ALL_STATUSES) {
      for (const from of allowedFrom(to)) expect(canTransition(from, to)).toBe(true);
    }
  });

  it('returns a fresh array each call', () => {
    const a = allowedFrom('needs_review');
    a.push('fulfilled');
    expect(allowedFrom('needs_review')).not.toContain('fulfilled');
  });
});

describe('isExpired', () => {
  it('is true only for a pending order whose deadline has passed', () => {
    expect(isExpired({ status: 'pending_payment', expiresAt: ago(1) }, NOW)).toBe(true);
    expect(isExpired({ status: 'pending_payment', expiresAt: ago(-1) }, NOW)).toBe(false);
    expect(isExpired({ status: 'pending_payment', expiresAt: NOW }, NOW)).toBe(false);
    for (const status of ALL_STATUSES.filter((s) => s !== 'pending_payment')) {
      expect(isExpired({ status, expiresAt: ago(60) }, NOW)).toBe(false);
    }
  });

  it('defaults to the current time', () => {
    expect(isExpired({ status: 'pending_payment', expiresAt: new Date(Date.now() - 1000) })).toBe(true);
    expect(isExpired({ status: 'pending_payment', expiresAt: new Date(Date.now() + 60_000) })).toBe(false);
  });
});

describe('ACTIONABLE_STATUSES and labels', () => {
  it('lists the statuses the operator must act on, paid first', () => {
    expect([...ACTIONABLE_STATUSES]).toEqual(['paid', 'needs_review']);
  });

  it('gives every status a French label that is not shouted', () => {
    for (const s of ALL_STATUSES) {
      const label = statusLabelFr(s);
      expect(label.length).toBeGreaterThan(2);
      expect(label).not.toBe(label.toUpperCase());
    }
    expect(statusLabelFr('pending_payment')).toBe('En attente de paiement');
    expect(statusLabelFr('paid')).toBe('Payée');
    expect(statusLabelFr('needs_review')).toBe('À vérifier');
    expect(statusLabelFr('fulfilled')).toBe('Rechargée');
    expect(statusLabelFr('failed')).toBe('Échouée');
    expect(statusLabelFr('expired')).toBe('Expirée');
    expect(statusLabelFr('cancelled')).toBe('Annulée');
    expect(statusLabelFr('refunded')).toBe('Remboursée');
  });
});

describe('inCheckingWindow', () => {
  const base = {
    status: 'pending_payment' as OrderStatus,
    returnedAt: null as Date | null,
    redirectExpiresAt: null as Date | null,
    createdAt: ago(30),
    lastVerifiedAt: null as Date | null,
  };

  it('is fifteen minutes', () => {
    expect(PENDING_CHECK_WINDOW_MS).toBe(15 * 60_000);
  });

  it('is false for any status other than pending_payment', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'pending_payment')) {
      expect(inCheckingWindow({ ...base, status, returnedAt: ago(1), createdAt: ago(1) }, null, NOW)).toBe(false);
    }
  });

  it('is true while the customer came back from the provider less than 15 minutes ago', () => {
    expect(inCheckingWindow({ ...base, returnedAt: ago(5) }, null, NOW)).toBe(true);
    expect(inCheckingWindow({ ...base, returnedAt: ago(14.9) }, null, NOW)).toBe(true);
    expect(inCheckingWindow({ ...base, returnedAt: ago(-0.5) }, null, NOW)).toBe(true);
  });

  it('keeps the window after a return even when a check already said unpaid', () => {
    expect(inCheckingWindow({ ...base, returnedAt: ago(5), lastVerifiedAt: ago(1) }, ago(1), NOW)).toBe(true);
  });

  it('closes fifteen minutes after the return', () => {
    expect(inCheckingWindow({ ...base, returnedAt: ago(15) }, null, NOW)).toBe(false);
    expect(inCheckingWindow({ ...base, returnedAt: ago(20) }, null, NOW)).toBe(false);
  });

  it('is true for a fresh order that has not been seen unpaid yet', () => {
    expect(inCheckingWindow({ ...base, createdAt: ago(5), redirectExpiresAt: ago(-5) }, null, NOW)).toBe(true);
    expect(inCheckingWindow({ ...base, createdAt: ago(0) }, null, NOW)).toBe(true);
  });

  it('is false for a fresh order once a verification came back unpaid', () => {
    expect(inCheckingWindow({ ...base, createdAt: ago(5), lastVerifiedAt: ago(1) }, ago(1), NOW)).toBe(false);
  });

  it('is false for an old order without a recent return', () => {
    expect(inCheckingWindow({ ...base, createdAt: ago(15) }, null, NOW)).toBe(false);
    expect(inCheckingWindow({ ...base, createdAt: ago(60), returnedAt: ago(40) }, null, NOW)).toBe(false);
  });

  it('defaults to the current time', () => {
    expect(inCheckingWindow({ ...base, createdAt: new Date() }, null)).toBe(true);
    expect(inCheckingWindow({ ...base, createdAt: new Date(Date.now() - minutes(16)) }, null)).toBe(false);
  });
});
