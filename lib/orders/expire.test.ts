/**
 * L'incident du 13 septembre 2026 en un fichier de tests.
 *
 * Une commande réellement payée (MR-EKMQDW33, 9 387 HTG) a été marquée
 * « expirée » parce que ce balayage écrivait les commandes NatCash en perte
 * sans jamais interroger le fournisseur. La règle qui en découle est absolue,
 * et ces tests existent pour qu'elle ne puisse plus être défaite :
 *
 *   une commande n'est expirée que si le fournisseur a positivement dit
 *   qu'elle n'a pas été payée, ou s'il n'existe aucune référence à
 *   interroger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrderRow, OrderStatus } from '@/lib/orders/types';
import type { SettleResult } from '@/lib/orders/settle';

const listExpiredPending = vi.fn();
const transitionOrder = vi.fn();
const appendEvent = vi.fn();
const notifyOrder = vi.fn();

vi.mock('@/lib/orders/queries', () => ({
  listExpiredPending: (...a: unknown[]) => listExpiredPending(...a),
  transitionOrder: (...a: unknown[]) => transitionOrder(...a),
}));
vi.mock('@/lib/orders/events', () => ({ appendEvent: (...a: unknown[]) => appendEvent(...a) }));
vi.mock('@/lib/notifications/dispatch', () => ({ notifyOrder: (...a: unknown[]) => notifyOrder(...a) }));

const { expireStaleOrders } = await import('@/lib/orders/expire');

const NOW = new Date('2026-09-14T12:00:00.000Z');

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord-1',
    reference: 'MR-EKMQDW33',
    status: 'pending_payment',
    method: 'natcash',
    provider: 'kobara',
    providerRef: 'pay_9',
    verifyAttempts: 0,
    expiresAt: new Date('2026-09-14T11:00:00.000Z'),
    ...over,
  } as unknown as OrderRow;
}

const settled = (status: SettleResult['status']): SettleResult =>
  ({ status, order: null }) as unknown as SettleResult;

function run(rows: OrderRow[], answer: SettleResult) {
  listExpiredPending.mockResolvedValue(rows);
  const verifyFirst = vi.fn().mockResolvedValue(answer);
  return { verifyFirst, promise: expireStaleOrders({ now: NOW, limit: 10, verifyFirst }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  transitionOrder.mockImplementation(async (_id: string, to: OrderStatus) => order({ status: to }));
  notifyOrder.mockResolvedValue({ attempted: 0, sent: 0, skipped: 0, failed: 0 });
  appendEvent.mockResolvedValue(undefined);
});

describe('expireStaleOrders — la règle du 13 septembre', () => {
  it('interroge le fournisseur pour NatCash, comme pour MonCash', async () => {
    const { verifyFirst, promise } = run([order({ method: 'natcash' })], settled('unpaid'));
    await promise;
    // Avant la correction, une commande NatCash était expirée sans un seul appel.
    expect(verifyFirst).toHaveBeenCalledWith('ord-1');
  });

  it('n’expire que sur un « non payé » explicite du fournisseur', async () => {
    const { promise } = run([order()], settled('unpaid'));
    await expect(promise).resolves.toMatchObject({ expired: 1, unverified: 0, escalated: 0 });
    expect(transitionOrder).toHaveBeenCalledWith('ord-1', 'expired', {});
  });

  it.each<SettleResult['status']>(['error', 'pending', 'not_configured', 'unknown_order'])(
    'refuse d’expirer quand la réponse est « %s » et réessaiera',
    async (status) => {
      const { promise } = run([order({ verifyAttempts: 1 })], settled(status));
      await expect(promise).resolves.toMatchObject({ expired: 0, unverified: 1, escalated: 0 });
      expect(transitionOrder).not.toHaveBeenCalled();
      expect(appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'verification_failed' }),
      );
    },
  );

  it('escalade en « à vérifier » plutôt que d’abandonner, après trop d’échecs', async () => {
    const { promise } = run([order({ verifyAttempts: 5 })], settled('error'));
    await expect(promise).resolves.toMatchObject({ expired: 0, unverified: 0, escalated: 1 });
    expect(transitionOrder).toHaveBeenCalledWith(
      'ord-1',
      'needs_review',
      expect.objectContaining({ failureReason: expect.stringContaining('Impossible de vérifier') }),
    );
    expect(notifyOrder).toHaveBeenCalledWith(expect.anything(), 'needs_review');
  });

  it('laisse la commande à son nouveau statut quand le règlement la récupère', async () => {
    for (const status of ['granted', 'review'] as const) {
      vi.clearAllMocks();
      const { promise } = run([order()], settled(status));
      await expect(promise).resolves.toMatchObject({ expired: 0, recovered: 1 });
      expect(transitionOrder).not.toHaveBeenCalled();
    }
  });

  it('expire sans appel quand aucune référence fournisseur n’existe', async () => {
    const { verifyFirst, promise } = run([order({ providerRef: null })], settled('unpaid'));
    await expect(promise).resolves.toMatchObject({ expired: 1 });
    // Rien n'a pu être payé : il n'y a jamais eu de paiement à créer.
    expect(verifyFirst).not.toHaveBeenCalled();
  });

  it('ne laisse pas une commande en erreur interrompre le balayage', async () => {
    listExpiredPending.mockResolvedValue([order({ id: 'ord-1' }), order({ id: 'ord-2' })]);
    transitionOrder.mockRejectedValueOnce(new Error('base indisponible'));
    const verifyFirst = vi.fn().mockResolvedValue(settled('unpaid'));
    await expect(expireStaleOrders({ now: NOW, limit: 10, verifyFirst })).resolves.toMatchObject({
      expired: 1,
    });
  });

  it('ne lance jamais, même si la liste échoue', async () => {
    listExpiredPending.mockRejectedValue(new Error('base indisponible'));
    const verifyFirst = vi.fn();
    await expect(expireStaleOrders({ now: NOW, limit: 10, verifyFirst })).resolves.toEqual({
      expired: 0,
      recovered: 0,
      unverified: 0,
      escalated: 0,
    });
  });
});
