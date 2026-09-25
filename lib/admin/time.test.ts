import { describe, expect, it } from 'vitest';
import { durationFr, minutesBetween, timeAgoFr } from '@/lib/admin/time';

// 25 septembre 2026, 14:05 à Port-au-Prince (UTC−4, heure d'été).
const NOW = new Date('2026-09-25T18:05:00.000Z');
const ago = (ms: number) => timeAgoFr(new Date(NOW.getTime() - ms), NOW);

describe('timeAgoFr', () => {
  it('dit « à l’instant » pendant la première minute', () => {
    expect(ago(0)).toBe('à l’instant');
    expect(ago(59_000)).toBe('à l’instant');
  });

  it('compte en minutes pendant la première heure', () => {
    expect(ago(60_000)).toBe('il y a 1 min');
    expect(ago(59 * 60_000)).toBe('il y a 59 min');
  });

  it('compte en heures tant que c’est aujourd’hui à Port-au-Prince', () => {
    expect(ago(2 * 3_600_000)).toBe('il y a 2 h');
    // 00:30 heure d'Haïti le même jour.
    expect(timeAgoFr(new Date('2026-09-25T04:30:00.000Z'), NOW)).toBe('il y a 13 h');
  });

  it('dit « hier » avec l’heure pour la veille, même tard le soir en UTC', () => {
    // 23:50 le 24 à Port-au-Prince = 03:50 UTC le 25.
    expect(timeAgoFr(new Date('2026-09-25T03:50:00.000Z'), NOW)).toBe('hier à 23:50');
    expect(timeAgoFr(new Date('2026-09-24T13:00:00.000Z'), NOW)).toBe('hier à 09:00');
  });

  it('revient au calendrier au-delà', () => {
    expect(timeAgoFr(new Date('2026-09-03T13:12:00.000Z'), NOW)).toBe('le 3 sept. à 09:12');
    expect(timeAgoFr(new Date('2025-12-31T15:00:00.000Z'), NOW)).toBe('le 31 déc. 2025');
  });

  it('parle au futur pour une échéance', () => {
    expect(timeAgoFr(new Date(NOW.getTime() + 12 * 60_000), NOW)).toBe('dans 12 min');
    expect(timeAgoFr(new Date(NOW.getTime() + 3 * 3_600_000), NOW)).toBe('dans 3 h');
  });

  it('ne dit rien d’une date absente ou invalide', () => {
    expect(timeAgoFr(null, NOW)).toBe('');
    expect(timeAgoFr(new Date(Number.NaN), NOW)).toBe('');
  });
});

describe('durationFr', () => {
  it('écrit une durée lisible', () => {
    expect(durationFr(20_000)).toBe('1 min');
    expect(durationFr(12 * 60_000)).toBe('12 min');
    expect(durationFr(2 * 3_600_000)).toBe('2 h');
    expect(durationFr(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 05');
    expect(durationFr(3 * 86_400_000 + 1)).toBe('3 j');
  });
});

describe('minutesBetween', () => {
  it('ne rend jamais un nombre négatif', () => {
    expect(minutesBetween(NOW, new Date(NOW.getTime() - 60_000))).toBe(0);
    expect(minutesBetween(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe(5);
  });
});
