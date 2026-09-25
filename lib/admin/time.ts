/**
 * lib/admin/time.ts — « il y a 5 min », for the operator.
 *
 * A list of orders is read for one question: what just happened? An absolute
 * timestamp (« 25 sept. 2026, 14:05 ») makes the reader do the subtraction;
 * « payée il y a 5 min » does it for them. Past a day the phrase goes back to
 * the calendar, because « il y a 3 jours » is vaguer than the date it hides.
 *
 * Every phrase reads after a past participle: « Payée il y a 5 min »,
 * « Créée hier à 14:05 », « Rechargée le 3 sept. à 09:12 ». Days are
 * Port-au-Prince days, like everything else the operator reads.
 */
import { TIME_ZONE, startOfDayPortAuPrince } from '@/lib/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const clock = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const yearOf = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric' });

/** « il y a 5 min », « hier à 14:05 », « le 3 sept. à 09:12 », « dans 12 min ». */
export function timeAgoFr(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const diff = now.getTime() - date.getTime();

  if (diff < 0) {
    const ahead = -diff;
    if (ahead < MINUTE) return 'dans un instant';
    if (ahead < HOUR) return `dans ${Math.round(ahead / MINUTE)} min`;
    if (ahead < DAY) return `dans ${Math.round(ahead / HOUR)} h`;
    return `le ${dayMonth.format(date)} à ${clock.format(date)}`;
  }

  if (diff < MINUTE) return 'à l’instant';
  if (diff < HOUR) return `il y a ${Math.floor(diff / MINUTE)} min`;

  const today = startOfDayPortAuPrince(now).getTime();
  if (date.getTime() >= today) return `il y a ${Math.floor(diff / HOUR)} h`;

  // Yesterday is the Port-au-Prince day that ends where today starts; taking
  // « start of today minus twelve hours » lands safely inside it, DST or not.
  const yesterday = startOfDayPortAuPrince(new Date(today - 12 * HOUR)).getTime();
  if (date.getTime() >= yesterday) return `hier à ${clock.format(date)}`;

  const sameYear = yearOf.format(date) === yearOf.format(now);
  return sameYear ? `le ${dayMonth.format(date)} à ${clock.format(date)}` : `le ${dayMonthYear.format(date)}`;
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE));
}

/** « 12 min », « 2 h 05 », « 3 j » — a duration, for « en attente depuis … ». */
export function durationFr(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < HOUR) return `${Math.max(1, Math.floor(safe / MINUTE))} min`;
  if (safe < DAY) {
    const hours = Math.floor(safe / HOUR);
    const minutes = Math.floor((safe % HOUR) / MINUTE);
    return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
  }
  return `${Math.floor(safe / DAY)} j`;
}
