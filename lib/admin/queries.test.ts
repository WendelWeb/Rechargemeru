import { describe, expect, it } from 'vitest';
import { ORDERS_PAGE_SIZE } from '@/lib/orders/queries';
import { parseOrderFilters, toOrderFilters } from './queries';

describe('parseOrderFilters', () => {
  it('falls back to « tout » on an empty query string', () => {
    const f = parseOrderFilters({});
    expect(f.status).toBe('all');
    expect(f.method).toBe('all');
    expect(f.mode).toBe('all');
    expect(f.q).toBe('');
    expect(f.fromDay).toBe('');
    expect(f.toDay).toBe('');
    expect(f.from).toBeUndefined();
    expect(f.to).toBeUndefined();
    expect(f.page).toBe(1);
    expect(f.limit).toBe(ORDERS_PAGE_SIZE);
    expect(f.offset).toBe(0);
  });

  it('keeps values the domain knows', () => {
    const f = parseOrderFilters({
      status: 'needs_review',
      method: 'natcash',
      mode: 'sandbox',
      q: '  MR-7F3K2QAB  ',
      page: '3',
    });
    expect(f.status).toBe('needs_review');
    expect(f.method).toBe('natcash');
    expect(f.mode).toBe('sandbox');
    expect(f.q).toBe('MR-7F3K2QAB');
    expect(f.page).toBe(3);
    expect(f.offset).toBe(2 * ORDERS_PAGE_SIZE);
  });

  it('drops values the domain does not know', () => {
    const f = parseOrderFilters({ status: 'paid_maybe', method: 'zelle', mode: 'staging', page: '0' });
    expect(f.status).toBe('all');
    expect(f.method).toBe('all');
    expect(f.mode).toBe('all');
    expect(f.page).toBe(1);
  });

  it('reads a Port-au-Prince day range, half-open and inclusive of both days', () => {
    const f = parseOrderFilters({ from: '2026-09-06', to: '2026-09-08' });
    expect(f.fromDay).toBe('2026-09-06');
    expect(f.toDay).toBe('2026-09-08');
    expect(f.from?.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(f.to?.toISOString()).toBe('2026-09-09T04:00:00.000Z');
  });

  it('ignores a malformed or impossible date instead of throwing', () => {
    const f = parseOrderFilters({ from: '06/09/2026', to: '2026-02-30' });
    expect(f.fromDay).toBe('');
    expect(f.toDay).toBe('');
    expect(f.from).toBeUndefined();
    expect(f.to).toBeUndefined();
  });

  it('takes the first entry of a repeated parameter and trims long searches', () => {
    const f = parseOrderFilters({ status: ['paid', 'failed'], q: ['x'.repeat(300)] });
    expect(f.status).toBe('paid');
    expect(f.q).toHaveLength(100);
  });

  it('clamps an absurd page number', () => {
    expect(parseOrderFilters({ page: '999999999' }).page).toBe(10_000);
    expect(parseOrderFilters({ page: 'trois' }).page).toBe(1);
  });

  it('hands listOrders exactly what it understands', () => {
    const query = toOrderFilters(parseOrderFilters({ status: 'paid', mode: 'live', q: 'Jean', from: '2026-09-06', page: '2' }));
    expect(query).toEqual({
      status: 'paid',
      method: 'all',
      mode: 'live',
      q: 'Jean',
      from: new Date('2026-09-06T04:00:00.000Z'),
      to: undefined,
      limit: ORDERS_PAGE_SIZE,
      offset: ORDERS_PAGE_SIZE,
    });
  });
});
