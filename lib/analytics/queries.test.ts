import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_RANGES,
  RANGE_DAYS,
  SNAPSHOT_DAYS,
  analyticsOverview,
  dailyDayCount,
  dayKeyPortAuPrince,
  lastDayKeys,
  mergeDeviceStats,
  parseAnalyticsRange,
  previousWindow,
  rangeWindow,
  snapshotWindows,
  startOfDayDaysAgo,
  toCount,
  visitsSnapshot,
  zeroFillDaily,
  type DeviceHistory,
  type DeviceLatest,
  type DeviceOrders,
  type RankedDevice,
} from './queries';

/**
 * Port-au-Prince is UTC−4 in summer (EDT) and UTC−5 in winter (EST). In
 * 2026 the clocks jump forward on 8 March and fall back on 1 November, so
 * local midnight is 05:00Z before 8 March, 04:00Z from then to 1 November,
 * and 05:00Z again afterwards.
 */
const iso = (d: Date) => d.toISOString();

describe('parseAnalyticsRange', () => {
  it('keeps the three known ranges', () => {
    expect(ANALYTICS_RANGES).toEqual(['today', '7d', '30d']);
    expect(parseAnalyticsRange('today')).toBe('today');
    expect(parseAnalyticsRange('7d')).toBe('7d');
    expect(parseAnalyticsRange('30d')).toBe('30d');
  });

  it('defaults to the week for anything else', () => {
    expect(parseAnalyticsRange(undefined)).toBe('7d');
    expect(parseAnalyticsRange('')).toBe('7d');
    expect(parseAnalyticsRange('90d')).toBe('7d');
    expect(parseAnalyticsRange('yesterday')).toBe('7d');
    expect(parseAnalyticsRange([])).toBe('7d');
  });

  it('is forgiving about case, spaces and repeated parameters', () => {
    expect(parseAnalyticsRange(' 30D ')).toBe('30d');
    expect(parseAnalyticsRange('TODAY')).toBe('today');
    expect(parseAnalyticsRange(['30d', 'today'])).toBe('30d');
  });
});

describe('startOfDayDaysAgo', () => {
  it('is today’s local midnight for zero (or nonsense) days', () => {
    const now = new Date('2026-09-25T18:00:00Z');
    expect(iso(startOfDayDaysAgo(now, 0))).toBe('2026-09-25T04:00:00.000Z');
    expect(iso(startOfDayDaysAgo(now, -3))).toBe('2026-09-25T04:00:00.000Z');
    expect(iso(startOfDayDaysAgo(now, Number.NaN))).toBe('2026-09-25T04:00:00.000Z');
  });

  it('counts local calendar days, not UTC ones', () => {
    // 22:00 on the 24th in Port-au-Prince is already the 25th in UTC.
    const lateEvening = new Date('2026-09-25T02:00:00Z');
    expect(iso(startOfDayDaysAgo(lateEvening, 0))).toBe('2026-09-24T04:00:00.000Z');
    expect(iso(startOfDayDaysAgo(lateEvening, 1))).toBe('2026-09-23T04:00:00.000Z');
  });

  it('lands on the right midnight across the spring clock change', () => {
    // 10 March, 11:00 EDT. Six days back is 4 March, still in winter time.
    const now = new Date('2026-03-10T15:00:00Z');
    expect(iso(startOfDayDaysAgo(now, 6))).toBe('2026-03-04T05:00:00.000Z');
    // The change day itself: 8 March began at 05:00Z and lasted 23 hours.
    expect(iso(startOfDayDaysAgo(now, 2))).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(startOfDayDaysAgo(now, 1))).toBe('2026-03-09T04:00:00.000Z');
  });

  it('lands on the right midnight across the autumn clock change', () => {
    // 3 November, 10:00 EST. Six days back is 28 October, still in summer time.
    const now = new Date('2026-11-03T15:00:00Z');
    expect(iso(startOfDayDaysAgo(now, 6))).toBe('2026-10-28T04:00:00.000Z');
    // 1 November began at 04:00Z and lasted 25 hours.
    expect(iso(startOfDayDaysAgo(now, 2))).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(startOfDayDaysAgo(now, 1))).toBe('2026-11-02T05:00:00.000Z');
  });

  it('crosses month and year ends', () => {
    expect(iso(startOfDayDaysAgo(new Date('2026-03-01T12:00:00Z'), 29))).toBe('2026-01-31T05:00:00.000Z');
    expect(iso(startOfDayDaysAgo(new Date('2027-01-03T12:00:00Z'), 6))).toBe('2026-12-28T05:00:00.000Z');
    // 2028 is a leap year: 29 February exists.
    expect(iso(startOfDayDaysAgo(new Date('2028-03-01T12:00:00Z'), 1))).toBe('2028-02-29T05:00:00.000Z');
  });
});

describe('rangeWindow and previousWindow', () => {
  const now = new Date('2026-09-25T18:00:00Z'); // 14:00 in Port-au-Prince

  it('starts each range at a local midnight and ends it now', () => {
    expect(RANGE_DAYS).toEqual({ today: 1, '7d': 7, '30d': 30 });
    expect(rangeWindow('today', now)).toEqual({ from: new Date('2026-09-25T04:00:00Z'), to: now });
    expect(rangeWindow('7d', now)).toEqual({ from: new Date('2026-09-19T04:00:00Z'), to: now });
    expect(rangeWindow('30d', now)).toEqual({ from: new Date('2026-08-27T04:00:00Z'), to: now });
  });

  it('compares with a window of the same length that ends where the range starts', () => {
    const today = previousWindow(rangeWindow('today', now));
    expect(iso(today.from)).toBe('2026-09-24T14:00:00.000Z');
    expect(iso(today.to)).toBe('2026-09-25T04:00:00.000Z');
    const week = previousWindow(rangeWindow('7d', now));
    expect(week.to).toEqual(new Date('2026-09-19T04:00:00Z'));
    expect(week.to.getTime() - week.from.getTime()).toBe(now.getTime() - week.to.getTime());
  });

  it('has a 30-day range spanning the spring change start on the right local midnight', () => {
    const march = new Date('2026-03-20T12:00:00Z');
    expect(iso(rangeWindow('30d', march).from)).toBe('2026-02-19T05:00:00.000Z');
    expect(iso(rangeWindow('7d', march).from)).toBe('2026-03-14T04:00:00.000Z');
  });

  it('never produces a negative window', () => {
    const w = previousWindow({ from: new Date('2026-09-25T04:00:00Z'), to: new Date('2026-09-25T03:00:00Z') });
    expect(w.from).toEqual(w.to);
  });
});

describe('snapshotWindows', () => {
  it('covers today so far, all of yesterday and fourteen days', () => {
    const now = new Date('2026-09-25T18:00:00Z');
    const w = snapshotWindows(now);
    expect(w.today).toEqual({ from: new Date('2026-09-25T04:00:00Z'), to: now });
    expect(w.yesterday).toEqual({ from: new Date('2026-09-24T04:00:00Z'), to: new Date('2026-09-25T04:00:00Z') });
    expect(w.daily).toEqual({ from: new Date('2026-09-12T04:00:00Z'), to: now });
  });

  it('gives a 25-hour yesterday the day after the clocks fall back', () => {
    const w = snapshotWindows(new Date('2026-11-02T15:00:00Z'));
    expect(iso(w.yesterday.from)).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(w.yesterday.to)).toBe('2026-11-02T05:00:00.000Z');
    expect(w.yesterday.to.getTime() - w.yesterday.from.getTime()).toBe(25 * 3_600_000);
  });
});

describe('day keys', () => {
  it('names the local calendar day of an instant', () => {
    expect(dayKeyPortAuPrince(new Date('2026-09-25T18:00:00Z'))).toBe('2026-09-25');
    expect(dayKeyPortAuPrince(new Date('2026-09-25T03:59:59Z'))).toBe('2026-09-24');
    expect(dayKeyPortAuPrince(new Date('2026-09-25T04:00:00Z'))).toBe('2026-09-25');
    expect(dayKeyPortAuPrince(new Date('2027-01-01T04:30:00Z'))).toBe('2026-12-31');
  });

  it('lists the last N days oldest first, ending with the local today', () => {
    expect(lastDayKeys(new Date('2026-09-25T18:00:00Z'), 7)).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    // 22:00 on 1 March locally — already 2 March in UTC.
    expect(lastDayKeys(new Date('2026-03-02T03:00:00Z'), 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(lastDayKeys(new Date('2028-03-01T12:00:00Z'), 2)).toEqual(['2028-02-29', '2028-03-01']);
  });

  it('crosses both clock changes without skipping or repeating a day', () => {
    const spring = lastDayKeys(new Date('2026-03-10T15:00:00Z'), 5);
    expect(spring).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
    const autumn = lastDayKeys(new Date('2026-11-03T15:00:00Z'), 5);
    expect(autumn).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('gives each range its number of buckets', () => {
    expect(dailyDayCount('today')).toBe(7);
    expect(dailyDayCount('7d')).toBe(7);
    expect(dailyDayCount('30d')).toBe(30);
    expect(lastDayKeys(new Date('2026-09-25T18:00:00Z'), 30)).toHaveLength(30);
    expect(lastDayKeys(new Date('2026-09-25T18:00:00Z'), 0)).toEqual([]);
  });

  it('keys the first bucket on the same day the window starts', () => {
    for (const now of [new Date('2026-03-10T15:00:00Z'), new Date('2026-11-03T15:00:00Z'), new Date('2026-09-25T02:00:00Z')]) {
      for (const range of ANALYTICS_RANGES) {
        const days = dailyDayCount(range);
        expect(lastDayKeys(now, days)[0]).toBe(dayKeyPortAuPrince(startOfDayDaysAgo(now, days - 1)));
      }
    }
  });
});

describe('zeroFillDaily', () => {
  it('fills missing days with zeros and keeps the order of the keys', () => {
    const keys = ['2026-09-23', '2026-09-24', '2026-09-25'];
    const filled = zeroFillDaily(keys, [
      { day: '2026-09-25', visits: 4, devices: 3, pageViews: 9 },
      { day: '2026-09-23', visits: 1, devices: 1, pageViews: 2 },
      { day: '2026-08-01', visits: 99, devices: 99, pageViews: 99 },
    ]);
    expect(filled).toEqual([
      { day: '2026-09-23', visits: 1, devices: 1, pageViews: 2 },
      { day: '2026-09-24', visits: 0, devices: 0, pageViews: 0 },
      { day: '2026-09-25', visits: 4, devices: 3, pageViews: 9 },
    ]);
  });

  it('answers all zeros without rows', () => {
    expect(zeroFillDaily(['2026-09-25'], [])).toEqual([{ day: '2026-09-25', visits: 0, devices: 0, pageViews: 0 }]);
  });
});

describe('toCount', () => {
  it('reads the driver’s bigint strings and plain numbers', () => {
    expect(toCount('42')).toBe(42);
    expect(toCount(7)).toBe(7);
    expect(toCount(BigInt(3))).toBe(3);
  });

  it('answers zero for anything unusable', () => {
    expect(toCount(null)).toBe(0);
    expect(toCount(undefined)).toBe(0);
    expect(toCount('abc')).toBe(0);
    expect(toCount(-5)).toBe(0);
    expect(toCount(Number.NaN)).toBe(0);
    expect(toCount({})).toBe(0);
  });
});

describe('mergeDeviceStats', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const at = (s: string) => new Date(s);

  const ranked: RankedDevice[] = [
    { deviceId: A, visits: 2, pageViews: 5, lastInRange: at('2026-09-25T15:00:00Z') },
    { deviceId: B, visits: 3, pageViews: 4, lastInRange: at('2026-09-24T15:00:00Z') },
    { deviceId: C, visits: 2, pageViews: 2, lastInRange: at('2026-09-25T17:00:00Z') },
  ];
  const history: DeviceHistory[] = [
    { deviceId: A, totalVisits: 9, firstSeen: at('2026-08-01T12:00:00Z'), lastSeen: at('2026-09-25T15:00:00Z') },
    { deviceId: B, totalVisits: 3, firstSeen: at('2026-09-20T12:00:00Z'), lastSeen: at('2026-09-24T15:00:00Z') },
    { deviceId: C, totalVisits: 2, firstSeen: at('2026-09-25T16:00:00Z'), lastSeen: at('2026-09-25T17:00:00Z') },
  ];
  const latest: DeviceLatest[] = [
    { deviceId: A, label: 'Samsung Android · Chrome', kind: 'mobile', country: 'HT', city: 'Pétion-Ville' },
    { deviceId: B, label: 'Windows · Edge', kind: 'desktop', country: 'US', city: 'Miami' },
    { deviceId: C, label: null, kind: 'fridge', country: null, city: null },
  ];
  const orderCounts: DeviceOrders[] = [
    { deviceId: A, orders: 3, paidOrders: 2 },
    { deviceId: null, orders: 40, paidOrders: 40 },
  ];

  it('sorts by visits, then by the most recent sighting', () => {
    const stats = mergeDeviceStats(ranked, history, latest, orderCounts);
    expect(stats.map((s) => s.deviceId)).toEqual([B, C, A]);
  });

  it('joins history, latest attributes and orders onto each device', () => {
    const [b, c, a] = mergeDeviceStats(ranked, history, latest, orderCounts);
    expect(a).toEqual({
      deviceId: A,
      label: 'Samsung Android · Chrome',
      kind: 'mobile',
      visits: 2,
      pageViews: 5,
      totalVisits: 9,
      firstSeen: at('2026-08-01T12:00:00Z'),
      lastSeen: at('2026-09-25T15:00:00Z'),
      country: 'HT',
      city: 'Pétion-Ville',
      orders: 3,
      paidOrders: 2,
    });
    expect(b.orders).toBe(0);
    expect(b.paidOrders).toBe(0);
    expect(b.kind).toBe('desktop');
    // An unknown stored kind is shown as « other », never passed through.
    expect(c.kind).toBe('other');
    expect(c.label).toBeNull();
  });

  it('still describes a device missing from the lookups', () => {
    const [only] = mergeDeviceStats([ranked[0]], [], [], []);
    expect(only).toMatchObject({
      deviceId: A,
      label: null,
      kind: 'other',
      totalVisits: 2,
      firstSeen: at('2026-09-25T15:00:00Z'),
      lastSeen: at('2026-09-25T15:00:00Z'),
      orders: 0,
      paidOrders: 0,
    });
  });

  it('breaks full ties on the id so the table never reshuffles', () => {
    const when = at('2026-09-25T15:00:00Z');
    const tied: RankedDevice[] = [
      { deviceId: C, visits: 1, pageViews: 1, lastInRange: when },
      { deviceId: A, visits: 1, pageViews: 1, lastInRange: when },
    ];
    expect(mergeDeviceStats(tied, [], [], []).map((s) => s.deviceId)).toEqual([A, C]);
  });

  it('answers an empty table for no devices', () => {
    expect(mergeDeviceStats([], history, latest, orderCounts)).toEqual([]);
  });
});

describe('without a database', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('analyticsOverview answers zeros, the window and every day bucket — and never throws', async () => {
    const now = new Date('2026-09-25T18:00:00Z');
    const overview = await analyticsOverview('30d', now);
    expect(overview.dbReady).toBe(false);
    expect(overview.range).toBe('30d');
    expect(overview.from).toEqual(new Date('2026-08-27T04:00:00Z'));
    expect(overview.to).toEqual(now);
    expect(overview.summary).toEqual({ pageViews: 0, visits: 0, devices: 0, newDevices: 0, orderingDevices: 0 });
    expect(overview.previous).toEqual(overview.summary);
    expect(overview.daily).toHaveLength(30);
    expect(overview.daily[0]).toEqual({ day: '2026-08-27', visits: 0, devices: 0, pageViews: 0 });
    expect(overview.daily[29].day).toBe('2026-09-25');
    expect(overview.devices).toEqual([]);
    expect(overview.pages).toEqual([]);
    expect(overview.sources).toEqual([]);
    expect(overview.countries).toEqual([]);
    expect(overview.kinds).toEqual([]);
  });

  it('analyticsOverview gives « today » a week of buckets', async () => {
    const overview = await analyticsOverview('today', new Date('2026-09-25T18:00:00Z'));
    expect(overview.from).toEqual(new Date('2026-09-25T04:00:00Z'));
    expect(overview.daily.map((d) => d.day)).toEqual(lastDayKeys(new Date('2026-09-25T18:00:00Z'), 7));
  });

  it('analyticsOverview survives an unknown range and an invalid date', async () => {
    const overview = await analyticsOverview('90d' as never, new Date(Number.NaN));
    expect(overview.range).toBe('7d');
    expect(overview.daily).toHaveLength(7);
  });

  it('visitsSnapshot answers zeros and fourteen day buckets', async () => {
    const snapshot = await visitsSnapshot(new Date('2026-09-25T18:00:00Z'));
    expect(snapshot.dbReady).toBe(false);
    expect(snapshot.today).toEqual({ pageViews: 0, visits: 0, devices: 0, newDevices: 0, orderingDevices: 0 });
    expect(snapshot.yesterday).toEqual(snapshot.today);
    expect(snapshot.daily).toHaveLength(SNAPSHOT_DAYS);
    expect(snapshot.daily[0].day).toBe('2026-09-12');
    expect(snapshot.daily[13].day).toBe('2026-09-25');
  });
});
