import { describe, it, expect } from 'vitest';
import {
  TIME_ZONE,
  formatHtg,
  formatUsd,
  formatUsdShort,
  formatRate,
  formatDateTime,
  startOfDayPortAuPrince,
  startOfMonthPortAuPrince,
  localDayRange,
} from './format';

const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('format', () => {
  it('uses the Port-au-Prince zone', () => expect(TIME_ZONE).toBe('America/Port-au-Prince'));

  it('gourdes', () => {
    expect(norm(formatHtg(2985))).toBe('2 985 HTG');
    expect(norm(formatHtg(0))).toBe('0 HTG');
    expect(norm(formatHtg(75))).toBe('75 HTG');
    expect(norm(formatHtg(1234567))).toBe('1 234 567 HTG');
  });

  it('dollars per locale', () => {
    expect(norm(formatUsd(2000, 'fr'))).toBe('20,00 $ US');
    expect(norm(formatUsd(2000, 'ht'))).toBe('20,00 dola US');
    expect(norm(formatUsdShort(2000, 'fr'))).toBe('20 $ US');
    expect(norm(formatUsdShort(2050, 'ht'))).toBe('20,50 dola US');
  });

  it('dollars keep two decimals from integer cents without float drift', () => {
    expect(norm(formatUsd(5, 'fr'))).toBe('0,05 $ US');
    expect(norm(formatUsd(1999, 'ht'))).toBe('19,99 dola US');
    expect(norm(formatUsd(123456, 'fr'))).toBe('1 234,56 $ US');
    expect(norm(formatUsdShort(10000, 'ht'))).toBe('100 dola US');
    expect(norm(formatUsdShort(1, 'fr'))).toBe('0,01 $ US');
  });

  it('rate', () => {
    expect(norm(formatRate(132.5, 'fr'))).toBe('1 $ US = 132,50 HTG');
    expect(norm(formatRate(132.5, 'ht'))).toBe('1 dola US = 132,50 HTG');
    expect(norm(formatRate(154.45, 'fr'))).toBe('1 $ US = 154,45 HTG');
  });

  it('dates in Port-au-Prince time', () => {
    expect(formatDateTime(new Date('2026-09-06T18:05:00Z'))).toContain('14:05');
    expect(norm(formatDateTime(new Date('2026-09-06T18:05:00Z')))).toBe('6 sept. 2026, 14:05');
    expect(norm(formatDateTime(new Date('2026-01-15T12:07:00Z')))).toBe('15 janv. 2026, 07:07');
    expect(norm(formatDateTime(new Date('2026-09-07T03:30:00Z')))).toBe('6 sept. 2026, 23:30');
  });

  it('local day and month starts', () => {
    expect(startOfDayPortAuPrince(new Date('2026-09-06T18:05:00Z')).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(startOfDayPortAuPrince(new Date('2026-09-07T02:30:00Z')).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(startOfMonthPortAuPrince(new Date('2026-09-06T18:05:00Z')).toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(startOfDayPortAuPrince(new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-15T05:00:00.000Z'); // winter, UTC-5
    expect(startOfMonthPortAuPrince(new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });

  it('handles the daylight-saving transition days', () => {
    // 2026-03-08: clocks jump from 02:00 EST to 03:00 EDT. Local midnight was still UTC-5.
    expect(startOfDayPortAuPrince(new Date('2026-03-08T20:00:00Z')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    // 2026-11-01: clocks fall back at 02:00 EDT. Local midnight was still UTC-4.
    expect(startOfDayPortAuPrince(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    // The month start in March is in UTC-5, even when asked from a UTC-4 instant.
    expect(startOfMonthPortAuPrince(new Date('2026-03-20T12:00:00Z')).toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });

  it('day range', () => {
    const r = localDayRange('2026-09-06');
    expect(r.from.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-09-07T04:00:00.000Z');
  });

  it('day range across the daylight-saving change is one local day, not 24 h', () => {
    const spring = localDayRange('2026-03-08');
    expect(spring.from.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(spring.to.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    const fall = localDayRange('2026-11-01');
    expect(fall.from.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(fall.to.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('day range refuses malformed dates', () => {
    expect(() => localDayRange('2026-9-6')).toThrow(RangeError);
    expect(() => localDayRange('2026-02-30')).toThrow(RangeError);
    expect(() => localDayRange('hier')).toThrow(RangeError);
  });
});
