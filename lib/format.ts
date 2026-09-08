/**
 * lib/format.ts — every human-facing money and date string, in one place.
 *
 * Money arrives as integers (USD cents, whole gourdes) and is formatted from
 * those integers — no float division on the way to the screen. Labels follow
 * the copy rules: fr « 20 $ US », ht « 20 dola US », gourdes « 2 985 HTG »,
 * never a bare « $ ». Dates are shown in Port-au-Prince time; the day/month
 * helpers derive the zone offset from Intl so daylight-saving days are right.
 */

export type FormatLocale = 'fr' | 'ht';

export const TIME_ZONE = 'America/Port-au-Prince';

/** No-break space: keeps « 2 985 HTG » and « 20 $ US » on one line. */
const NBSP = '\u00a0';

const integerFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const rateFormatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toInt(n: number): number {
  const rounded = Number.isFinite(n) ? Math.round(n) : 0;
  return rounded === 0 ? 0 : rounded; // folds -0 into 0
}

function usdUnit(locale: FormatLocale): string {
  return locale === 'ht' ? `dola${NBSP}US` : `$${NBSP}US`;
}

/** `1 234,56` from 123456 cents; drops the decimals when allowed and whole. */
function centsToText(cents: number, keepDecimals: boolean): string {
  const safe = toInt(cents);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeText = integerFormatter.format(whole);
  if (!keepDecimals && frac === 0) return `${sign}${wholeText}`;
  return `${sign}${wholeText},${String(frac).padStart(2, '0')}`;
}

/** « 2 985 HTG » */
export function formatHtg(htg: number): string {
  return `${integerFormatter.format(toInt(htg))}${NBSP}HTG`;
}

/** « 20,00 $ US » / « 20,00 dola US » — always two decimals. */
export function formatUsd(cents: number, locale: FormatLocale): string {
  return `${centsToText(cents, true)}${NBSP}${usdUnit(locale)}`;
}

/** « 20 $ US » when whole, « 20,50 dola US » otherwise. */
export function formatUsdShort(cents: number, locale: FormatLocale): string {
  return `${centsToText(cents, false)}${NBSP}${usdUnit(locale)}`;
}

/**
 * « 1 $ US = 132,50 HTG » / « 1 dola US = 132,50 HTG »
 *
 * Every space is a no-break space, the two around the « = » included: a rate
 * is one fact, and on a 360px phone the plain spaces let it split as
 * « Taux tout compris : 1 $ US » / « = 168,00 HTG » — a line that opens on an
 * equals sign, under the total it is supposed to explain. Unbroken it is
 * ~170px at its longest, so it still fits the narrowest column we render it
 * in (the receipt on a 320px screen) and simply takes its own line.
 */
export function formatRate(rate: number, locale: FormatLocale): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  return `1${NBSP}${usdUnit(locale)}${NBSP}=${NBSP}${rateFormatter.format(safe)}${NBSP}HTG`;
}

const humanFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** « 6 sept. 2026, 14:05 » in Port-au-Prince time; « — » for an invalid date. */
export function formatDateTime(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  const parts = humanFormatter.formatToParts(d);
  return `${partValue(parts, 'day')} ${partValue(parts, 'month')} ${partValue(parts, 'year')}, ${partValue(parts, 'hour')}:${partValue(parts, 'minute')}`;
}

const wallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The Port-au-Prince wall clock for an instant (month is 1-based). */
function wallClock(date: Date): WallClock {
  const parts = wallClockFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(partValue(parts, type)) || 0;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

/** UTC minus local, in ms, at that instant: +4 h in summer, +5 h in winter. */
function zoneOffsetMs(date: Date): number {
  const w = wallClock(date);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return wholeSeconds - wallAsUtc;
}

/**
 * The instant of local midnight on a calendar day. The offset is read at the
 * naive guess and once more at the corrected guess, so the day a clock change
 * happens still resolves to its true midnight.
 */
function localMidnightUtc(year: number, monthIndex: number, day: number): Date {
  const naive = Date.UTC(year, monthIndex, day);
  const first = naive + zoneOffsetMs(new Date(naive));
  const second = naive + zoneOffsetMs(new Date(first));
  return new Date(second);
}

export function startOfDayPortAuPrince(now: Date): Date {
  const w = wallClock(now);
  return localMidnightUtc(w.year, w.month - 1, w.day);
}

export function startOfMonthPortAuPrince(now: Date): Date {
  const w = wallClock(now);
  return localMidnightUtc(w.year, w.month - 1, 1);
}

/**
 * `[from, to)` for one Port-au-Prince calendar day given as `YYYY-MM-DD`.
 * Throws a RangeError for anything that is not a real calendar date, so
 * callers validate user input before (or catch around) this call.
 */
export function localDayRange(yyyyMmDd: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!match) throw new RangeError('localDayRange: expected a YYYY-MM-DD date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new RangeError('localDayRange: not a calendar date');
  }
  const from = localMidnightUtc(year, month - 1, day);
  const to = startOfDayPortAuPrince(new Date(from.getTime() + 36 * 3_600_000));
  return { from, to };
}
