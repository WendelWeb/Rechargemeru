import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_RANGES,
  DEVICE_ORDER_LIMIT,
  JOURNEY_EVENT_LIMIT,
  JOURNEY_VISIT_LIMIT,
  RANGE_DAYS,
  SNAPSHOT_DAYS,
  analyticsOverview,
  assembleJourneys,
  dailyDayCount,
  dayKeyPortAuPrince,
  deviceDetail,
  deviceFromRow,
  lastDayKeys,
  mergeDeviceStats,
  parseAnalyticsRange,
  previousWindow,
  rangeWindow,
  snapshotWindows,
  startOfDayDaysAgo,
  toCount,
  toDate,
  toNullableInt,
  toText,
  visitsSnapshot,
  zeroFillDaily,
  zeroFunnel,
  zeroSummary,
  type DeviceActive,
  type DeviceHistory,
  type DeviceLatest,
  type DeviceOrders,
  type JourneyEventRow,
  type JourneyMeasureRow,
  type JourneyPageRow,
  type RankedDevice,
  type VisitSpan,
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
    { deviceId: A, label: 'Samsung Android · Chrome', kind: 'mobile', country: 'HT', city: 'Pétion-Ville', path: '/fr/suivi' },
    { deviceId: B, label: 'Windows · Edge', kind: 'desktop', country: 'US', city: 'Miami', path: '/ht' },
    { deviceId: C, label: null, kind: 'fridge', country: null, city: null, path: null },
  ];
  const orderCounts: DeviceOrders[] = [
    { deviceId: A, orders: 3, paidOrders: 2 },
    { deviceId: null, orders: 40, paidOrders: 40 },
  ];
  const activeTimes: DeviceActive[] = [
    { deviceId: A, activeMs: 95_000 },
    { deviceId: B, activeMs: 4_500 },
  ];

  it('sorts by visits, then by the most recent sighting', () => {
    const stats = mergeDeviceStats(ranked, history, latest, orderCounts);
    expect(stats.map((s) => s.deviceId)).toEqual([B, C, A]);
  });

  it('joins history, latest attributes, orders and active time onto each device', () => {
    const [b, c, a] = mergeDeviceStats(ranked, history, latest, orderCounts, activeTimes);
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
      activeMs: 95_000,
      lastPath: '/fr/suivi',
    });
    expect(b.activeMs).toBe(4_500);
    expect(b.lastPath).toBe('/ht');
    // No `page_end` in the window: zero, not missing.
    expect(c.activeMs).toBe(0);
    expect(c.lastPath).toBeNull();
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
      activeMs: 0,
      lastPath: null,
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
    expect(overview.summary).toEqual({
      pageViews: 0,
      visits: 0,
      devices: 0,
      newDevices: 0,
      orderingDevices: 0,
      activeMs: 0,
      avgVisitMs: 0,
      singlePageVisits: 0,
    });
    expect(overview.previous).toEqual(overview.summary);
    expect(overview.daily).toHaveLength(30);
    expect(overview.daily[0]).toEqual({ day: '2026-08-27', visits: 0, devices: 0, pageViews: 0 });
    expect(overview.daily[29].day).toBe('2026-09-25');
    expect(overview.devices).toEqual([]);
    expect(overview.pages).toEqual([]);
    expect(overview.sources).toEqual([]);
    expect(overview.countries).toEqual([]);
    expect(overview.kinds).toEqual([]);
    expect(overview.clicks).toEqual([]);
    expect(overview.funnel).toEqual({
      visits: 0,
      sawHome: 0,
      reachedDetails: 0,
      reachedConfirm: 0,
      submitted: 0,
      orders: 0,
      paid: 0,
    });
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
    expect(snapshot.today).toEqual(zeroSummary());
    expect(snapshot.today.activeMs).toBe(0);
    expect(snapshot.today.avgVisitMs).toBe(0);
    expect(snapshot.today.singlePageVisits).toBe(0);
    expect(snapshot.yesterday).toEqual(snapshot.today);
    expect(snapshot.daily).toHaveLength(SNAPSHOT_DAYS);
    expect(snapshot.daily[0].day).toBe('2026-09-12');
    expect(snapshot.daily[13].day).toBe('2026-09-25');
  });

  it('deviceDetail answers null — for a well-formed id too — and never throws', async () => {
    await expect(deviceDetail('3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b')).resolves.toBeNull();
  });
});

describe('deviceDetail — malformed ids', () => {
  it('answers null before touching any database', async () => {
    for (const id of ['', 'abc', "x' or 1=1 --", '3f2b8c1e9a4d4e7f8b210c5d6e7f8a9b', ' 3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b']) {
      await expect(deviceDetail(id)).resolves.toBeNull();
    }
    await expect(deviceDetail(undefined as never)).resolves.toBeNull();
  });
});

describe('raw row readers', () => {
  it('toDate reads Postgres timestamptz text, with its offset', () => {
    expect(toDate('2026-09-25 18:00:00.123456+00')).toEqual(new Date('2026-09-25T18:00:00.123Z'));
    expect(toDate('2026-09-25 14:00:00-04')).toEqual(new Date('2026-09-25T18:00:00Z'));
    expect(toDate('2026-09-25T18:00:00.000Z')).toEqual(new Date('2026-09-25T18:00:00Z'));
    const date = new Date('2026-09-25T18:00:00Z');
    expect(toDate(date)).toBe(date);
    expect(toDate(date.getTime())).toEqual(date);
  });

  it('toDate answers null for anything that is not an instant', () => {
    for (const value of [null, undefined, '', 'garbage', new Date(Number.NaN), {}, true]) {
      expect(toDate(value)).toBeNull();
    }
  });

  it('toText keeps strings only', () => {
    expect(toText('/fr')).toBe('/fr');
    expect(toText('')).toBe('');
    expect(toText(null)).toBeNull();
    expect(toText(undefined)).toBeNull();
    expect(toText(3)).toBeNull();
  });

  it('toNullableInt reads integers and bigint sums, and keeps NULL as null', () => {
    expect(toNullableInt(4500)).toBe(4500);
    expect(toNullableInt('4500')).toBe(4500);
    expect(toNullableInt(BigInt(7))).toBe(7);
    expect(toNullableInt(0)).toBe(0);
    expect(toNullableInt(null)).toBeNull();
    expect(toNullableInt(undefined)).toBeNull();
    expect(toNullableInt('abc')).toBeNull();
    expect(toNullableInt({})).toBeNull();
  });
});

describe('zero values', () => {
  it('has every summary figure and every funnel stage at zero', () => {
    expect(zeroSummary()).toEqual({
      pageViews: 0,
      visits: 0,
      devices: 0,
      newDevices: 0,
      orderingDevices: 0,
      activeMs: 0,
      avgVisitMs: 0,
      singlePageVisits: 0,
    });
    expect(zeroFunnel()).toEqual({
      visits: 0,
      sawHome: 0,
      reachedDetails: 0,
      reachedConfirm: 0,
      submitted: 0,
      orders: 0,
      paid: 0,
    });
    expect(DEVICE_ORDER_LIMIT).toBe(20);
  });
});

describe('deviceFromRow', () => {
  const ID = '3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b';

  it('reads the facts row as the driver hands it over', () => {
    const device = deviceFromRow(ID, {
      page_views: '12',
      label: 'Samsung Android · Chrome',
      kind: 'mobile',
      country: 'HT',
      city: 'Pétion-Ville',
      screen: '390x844',
      net: '3g',
      lang: 'fr-FR',
      first_seen: '2026-09-01 12:00:00+00',
      last_seen: '2026-09-25 18:00:00.5+00',
      active_ms: '184000',
      visits: '4',
    });
    expect(device).toEqual({
      deviceId: ID,
      label: 'Samsung Android · Chrome',
      kind: 'mobile',
      country: 'HT',
      city: 'Pétion-Ville',
      screen: '390x844',
      net: '3g',
      lang: 'fr-FR',
      firstSeen: new Date('2026-09-01T12:00:00Z'),
      lastSeen: new Date('2026-09-25T18:00:00.500Z'),
      visits: 4,
      pageViews: 12,
      activeMs: 184_000,
    });
  });

  it('describes a device seen only through its events', () => {
    const device = deviceFromRow(ID, {
      page_views: '0',
      label: null,
      kind: null,
      first_seen: '2026-09-25 18:00:00+00',
      last_seen: '2026-09-25 18:05:00+00',
      active_ms: '0',
      visits: '1',
    });
    expect(device).toMatchObject({ pageViews: 0, visits: 1, kind: 'other', label: null, screen: null });
  });

  it('answers null for a device nobody ever saw', () => {
    expect(deviceFromRow(ID, undefined)).toBeNull();
    expect(
      deviceFromRow(ID, { page_views: '0', first_seen: null, last_seen: null, active_ms: '0', visits: '0' }),
    ).toBeNull();
  });
});

describe('assembleJourneys', () => {
  const at = (s: string) => new Date(`2026-09-25T${s}Z`);
  const V1 = 'visitAAAA1111';
  const V2 = 'visitBBBB2222';
  const HOME = 'viewHome00000001';
  const FORM = 'viewForm00000002';
  const FAQ = 'viewFaq000000003';

  const spans: VisitSpan[] = [
    { visitId: V1, start: at('10:00:00'), end: at('10:09:00') },
    { visitId: V2, start: at('15:00:00'), end: at('15:02:00') },
  ];
  const pages: JourneyPageRow[] = [
    // Deliberately out of order: the assembler sorts.
    { visitId: V1, viewId: FORM, path: '/fr/commander', at: at('10:03:00'), referrerHost: null, utmSource: null },
    { visitId: V1, viewId: HOME, path: '/fr', at: at('10:00:00'), referrerHost: 'facebook.com', utmSource: 'wa_status' },
    { visitId: V2, viewId: null, path: '/ht', at: at('15:00:00'), referrerHost: null, utmSource: null },
    { visitId: V2, viewId: FAQ, path: '/ht/faq', at: at('15:01:00'), referrerHost: null, utmSource: null },
  ];
  const events: JourneyEventRow[] = [
    { visitId: V1, type: 'submit', name: 'order_form', target: null, value: null, path: '/fr/commander', at: at('10:08:00') },
    { visitId: V1, type: 'click', name: 'cta_hero', target: '/fr/commander', value: null, path: '/fr', at: at('10:02:00') },
    { visitId: V1, type: 'step', name: 'details', target: null, value: null, path: '/fr/commander', at: at('10:04:00') },
    { visitId: V1, type: 'error', name: 'phone', target: 'customerPhone', value: 2, path: '/fr/commander', at: at('10:05:00') },
    // Measures and unknown kinds are never listed as events.
    { visitId: V1, type: 'page_end', name: 'page', target: null, value: 999, path: '/fr', at: at('10:03:00') },
    { visitId: V1, type: 'mystery', name: 'x', target: null, value: null, path: '/fr', at: at('10:03:00') },
    // A visit outside the spans is left out.
    { visitId: 'ghostVisit99', type: 'click', name: 'lost', target: null, value: null, path: '/fr', at: at('11:00:00') },
  ];
  const measures: JourneyMeasureRow[] = [
    // The home page went to the background twice: 3 000 ms, then 1 500 ms more.
    { visitId: V1, viewId: HOME, type: 'page_end', value: 3_000 },
    { visitId: V1, viewId: HOME, type: 'page_end', value: 1_500 },
    { visitId: V1, viewId: HOME, type: 'scroll', value: 40 },
    { visitId: V1, viewId: HOME, type: 'scroll', value: 85 },
    { visitId: V1, viewId: HOME, type: 'scroll', value: 60 },
    { visitId: V1, viewId: FORM, type: 'page_end', value: 120_000 },
    { visitId: V1, viewId: FORM, type: 'page_end', value: null },
    // A page_end without view: the visit's time, nobody's page.
    { visitId: V1, viewId: null, type: 'page_end', value: 500 },
    { visitId: V2, viewId: FAQ, type: 'scroll', value: 0 },
  ];

  const journeys = assembleJourneys({ spans, pages, events, measures });
  const [second, first] = journeys;

  it('lists the visits newest first', () => {
    expect(journeys.map((j) => j.visitId)).toEqual([V2, V1]);
  });

  it('sums every page_end of a page — two reports of 3 000 and 1 500 ms are 4 500 ms', () => {
    expect(first.pages[0]).toEqual({ viewId: HOME, path: '/fr', at: at('10:00:00'), activeMs: 4_500, scrollPct: 85 });
  });

  it('keeps the deepest scroll, ignores a NULL page_end, and says null when nothing was measured', () => {
    expect(first.pages[1]).toEqual({
      viewId: FORM,
      path: '/fr/commander',
      at: at('10:03:00'),
      activeMs: 120_000,
      scrollPct: null,
    });
    // A scroll of 0 % is a measure, not a missing one.
    expect(second.pages[1]).toMatchObject({ viewId: FAQ, activeMs: null, scrollPct: 0 });
  });

  it('never attaches measures to a page without a view id', () => {
    expect(second.pages[0]).toEqual({ viewId: null, path: '/ht', at: at('15:00:00'), activeMs: null, scrollPct: null });
  });

  it('sums the visit’s page_end, view or not', () => {
    expect(first.activeMs).toBe(3_000 + 1_500 + 120_000 + 500);
    expect(second.activeMs).toBe(0);
  });

  it('takes the referrer and the campaign of the first page', () => {
    expect(first.referrer).toBe('facebook.com');
    expect(first.utm).toBe('wa_status');
    expect(second.referrer).toBeNull();
    expect(second.utm).toBeNull();
  });

  it('lists only taps, steps, refusals and submissions, in order', () => {
    expect(first.events.map((e) => `${e.type}:${e.name}`)).toEqual([
      'click:cta_hero',
      'step:details',
      'error:phone',
      'submit:order_form',
    ]);
    expect(first.events[2]).toEqual({
      type: 'error',
      name: 'phone',
      target: 'customerPhone',
      value: 2,
      path: '/fr/commander',
      at: at('10:05:00'),
    });
    expect(second.events).toEqual([]);
  });

  it('keeps the span, widened to any row outside it', () => {
    expect(first.start).toEqual(at('10:00:00'));
    expect(first.end).toEqual(at('10:09:00'));
    const [widened] = assembleJourneys({
      spans: [{ visitId: V1, start: at('10:01:00'), end: at('10:02:00') }],
      pages,
      events,
      measures: [],
    });
    expect(widened.start).toEqual(at('10:00:00'));
    expect(widened.end).toEqual(at('10:08:00'));
  });

  it('matches a page’s measures on its view id, even when they came under the next visit', () => {
    const [later, earlier] = assembleJourneys({
      spans: [
        { visitId: V1, start: at('10:00:00'), end: at('10:00:00') },
        { visitId: V2, start: at('10:45:00'), end: at('10:45:00') },
      ],
      pages: [{ visitId: V1, viewId: HOME, path: '/fr', at: at('10:00:00'), referrerHost: null, utmSource: null }],
      events: [],
      measures: [
        { visitId: V1, viewId: HOME, type: 'page_end', value: 60_000 },
        // The tab came back 45 minutes later: a new visit id, the same page.
        { visitId: V2, viewId: HOME, type: 'page_end', value: 20_000 },
      ],
    });
    expect(earlier.pages[0].activeMs).toBe(80_000);
    expect(earlier.activeMs).toBe(60_000);
    expect(later.activeMs).toBe(20_000);
    expect(later.pages).toEqual([]);
  });

  it('keeps the first 300 events of a visit and at most 30 visits', () => {
    const many: JourneyEventRow[] = Array.from({ length: 350 }, (_, i) => ({
      visitId: V1,
      type: 'click',
      name: `b${i}`,
      target: null,
      value: null,
      path: '/fr',
      at: new Date(at('10:00:00').getTime() + i * 1000),
    }));
    const [only] = assembleJourneys({ spans: [spans[0]], pages: [], events: many, measures: [] });
    expect(only.events).toHaveLength(JOURNEY_EVENT_LIMIT);
    expect(only.events[299].name).toBe('b299');

    const lots: VisitSpan[] = Array.from({ length: 40 }, (_, i) => ({
      visitId: `visit${String(i).padStart(4, '0')}`,
      start: new Date(at('00:00:00').getTime() + i * 60_000),
      end: new Date(at('00:00:00').getTime() + i * 60_000),
    }));
    const listed = assembleJourneys({ spans: lots, pages: [], events: [], measures: [] });
    expect(listed).toHaveLength(JOURNEY_VISIT_LIMIT);
    expect(listed[0].visitId).toBe('visit0039');
    expect(listed[29].visitId).toBe('visit0010');
  });

  it('lists a repeated span once and answers nothing for no spans', () => {
    expect(assembleJourneys({ spans: [spans[0], spans[0]], pages, events, measures })).toHaveLength(1);
    expect(assembleJourneys({ spans: [], pages, events, measures })).toEqual([]);
  });
});
