import { describe, expect, it } from 'vitest';
import {
  STATUS_DOT_CLASS,
  STATUS_FILTER_ORDER,
  STATUS_PLURAL_FR,
  formatStatusList,
  orderMomentFr,
  parseStatusList,
} from '@/lib/admin/order-status';
import { ORDER_STATUSES } from '@/lib/orders/types';

const NOW = new Date('2026-09-25T18:05:00.000Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe('parseStatusList', () => {
  it('lit une liste séparée par des virgules, dans l’ordre d’attention', () => {
    expect(parseStatusList('expired,paid')).toEqual(['paid', 'expired']);
    expect(parseStatusList(['pending_payment', 'fulfilled,paid'])).toEqual(['paid', 'pending_payment', 'fulfilled']);
  });

  it('ignore ce qui n’est pas un statut et rend « toutes » pour rien', () => {
    expect(parseStatusList('payée,<script>,paid')).toEqual(['paid']);
    expect(parseStatusList(undefined)).toEqual([]);
    expect(parseStatusList('')).toEqual([]);
  });

  it('fait l’aller-retour avec formatStatusList', () => {
    expect(formatStatusList(parseStatusList('failed,paid,failed'))).toBe('paid,failed');
    expect(formatStatusList([])).toBe('');
  });
});

describe('les tables de libellés', () => {
  it('couvrent chaque statut', () => {
    for (const status of ORDER_STATUSES) {
      expect(STATUS_PLURAL_FR[status], status).toBeTruthy();
      expect(STATUS_DOT_CLASS[status], status).toBeTruthy();
      expect(STATUS_FILTER_ORDER, status).toContain(status);
    }
  });
});

describe('orderMomentFr', () => {
  const base = { createdAt: minutesAgo(90), paidAt: null, fulfilledAt: null, expiresAt: minutesAgo(60) };

  it('parle de la recharge quand elle est faite', () => {
    expect(orderMomentFr({ ...base, status: 'fulfilled', paidAt: minutesAgo(80), fulfilledAt: minutesAgo(5) }, NOW)).toBe(
      'Rechargée il y a 5 min',
    );
  });

  it('parle du paiement quand il existe', () => {
    expect(orderMomentFr({ ...base, status: 'paid', paidAt: minutesAgo(12) }, NOW)).toBe('Payée il y a 12 min');
  });

  it('parle de l’échéance pour une commande expirée', () => {
    expect(orderMomentFr({ ...base, status: 'expired' }, NOW)).toBe('Expirée il y a 1 h');
  });

  it('parle de la création sinon', () => {
    expect(orderMomentFr({ ...base, status: 'pending_payment', createdAt: minutesAgo(3) }, NOW)).toBe('Créée il y a 3 min');
  });
});
