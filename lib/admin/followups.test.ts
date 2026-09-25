import { describe, expect, it } from 'vitest';
import {
  TOO_FRESH_MS,
  followUpState,
  inView,
  parseFollowUpDays,
  parseFollowUpView,
} from '@/lib/admin/followups';

const NOW = new Date('2026-09-25T18:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const contact = { label: 'ask_why@fun', at: ago(3_600_000), count: 1 };

describe('followUpState', () => {
  it('propose de relancer une commande expirée jamais contactée', () => {
    expect(followUpState({ status: 'expired', createdAt: ago(7_200_000) }, null, null, NOW)).toBe('todo');
  });

  it('laisse tranquille une commande en attente toute fraîche', () => {
    expect(followUpState({ status: 'pending_payment', createdAt: ago(TOO_FRESH_MS - 1) }, null, null, NOW)).toBe(
      'too_fresh',
    );
    expect(followUpState({ status: 'pending_payment', createdAt: ago(TOO_FRESH_MS + 1) }, null, null, NOW)).toBe('todo');
  });

  it('sait qu’on a déjà écrit', () => {
    expect(followUpState({ status: 'expired', createdAt: ago(7_200_000) }, contact, null, NOW)).toBe('contacted');
  });

  it('ne relance pas quelqu’un qui a payé une autre commande depuis', () => {
    expect(followUpState({ status: 'expired', createdAt: ago(7_200_000) }, contact, ago(60_000), NOW)).toBe('paid_later');
    // Un paiement plus ancien que la commande ne compte pas.
    expect(followUpState({ status: 'expired', createdAt: ago(7_200_000) }, null, ago(9_000_000), NOW)).toBe('todo');
  });
});

describe('inView', () => {
  it('range chaque état dans la bonne vue', () => {
    expect(inView('todo', 'todo')).toBe(true);
    expect(inView('contacted', 'todo')).toBe(false);
    expect(inView('contacted', 'done')).toBe(true);
    expect(inView('paid_later', 'done')).toBe(false);
    expect(inView('too_fresh', 'all')).toBe(true);
  });
});

describe('les paramètres de l’adresse', () => {
  it('ont des valeurs par défaut sûres', () => {
    expect(parseFollowUpView(undefined)).toBe('todo');
    expect(parseFollowUpView('done')).toBe('done');
    expect(parseFollowUpView('n’importe quoi')).toBe('todo');
    expect(parseFollowUpDays('7')).toBe(7);
    expect(parseFollowUpDays('12')).toBe(30);
    expect(parseFollowUpDays(undefined)).toBe(30);
  });
});
