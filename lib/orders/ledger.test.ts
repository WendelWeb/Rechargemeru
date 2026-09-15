/**
 * Le filet de sécurité, vérifié.
 *
 * Tout le reste du code part d'une de NOS commandes et demande au fournisseur
 * « celle-ci a-t-elle été payée ? ». Le 13 septembre 2026, la référence et
 * l'endpoint étaient faux en même temps, et un paiement réel est resté
 * invisible. Ce balayage part de l'autre bout : la liste de l'argent que le
 * fournisseur dit avoir reçu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrderRow } from '@/lib/orders/types';
import type { SettleResult } from '@/lib/orders/settle';

const listKobaraPayments = vi.fn();
const getOrderByProviderRef = vi.fn();
const getOrderById = vi.fn();
const logWebhook = vi.fn();
const natcashConfigured = vi.fn();

vi.mock('@/lib/payments/natcash/kobara', () => ({
  listKobaraPayments: (...a: unknown[]) => listKobaraPayments(...a),
}));
vi.mock('@/lib/payments/natcash', () => ({ natcashConfigured: () => natcashConfigured() }));
vi.mock('@/lib/orders/events', () => ({ logWebhook: (...a: unknown[]) => logWebhook(...a) }));
vi.mock('@/lib/orders/queries', () => ({
  getOrderByProviderRef: (...a: unknown[]) => getOrderByProviderRef(...a),
  getOrderById: (...a: unknown[]) => getOrderById(...a),
  isUuid: (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v),
}));

const { sweepKobaraLedger } = await import('@/lib/orders/ledger');

const NOW = new Date('2026-09-14T12:00:00.000Z');
const OUR_ORDER_ID = '28ada49b-9c70-4709-8887-ac096be72b81';

const entry = (over: Record<string, unknown> = {}) => ({
  paymentId: 'pay_9',
  orderId: OUR_ORDER_ID,
  status: 'paid',
  rawStatus: 'succeeded',
  amountHtg: 9387,
  transactionId: '178933654959448362',
  paidAt: new Date('2026-09-14T11:00:00.000Z'),
  createdAt: new Date('2026-09-14T10:59:00.000Z'),
  ...over,
});

const order = (over: Partial<OrderRow> = {}) =>
  ({ id: OUR_ORDER_ID, reference: 'MR-EKMQDW33', status: 'expired', ...over }) as unknown as OrderRow;

const settleTo = (status: SettleResult['status']) =>
  vi.fn().mockResolvedValue({ status, order: null } as unknown as SettleResult);

const sweep = (settle = settleTo('review')) =>
  sweepKobaraLedger({ now: NOW, maxAgeMs: 7 * 24 * 3600_000, limit: 100, settle });

beforeEach(() => {
  vi.clearAllMocks();
  natcashConfigured.mockReturnValue(true);
  getOrderByProviderRef.mockResolvedValue(null);
  getOrderById.mockResolvedValue(null);
  logWebhook.mockResolvedValue(undefined);
});

describe('sweepKobaraLedger', () => {
  it('récupère une commande que le fournisseur dit payée et que nous avons expirée', async () => {
    listKobaraPayments.mockResolvedValue([entry()]);
    getOrderByProviderRef.mockResolvedValue(order({ status: 'expired' }));
    const settle = settleTo('review');

    await expect(sweep(settle)).resolves.toMatchObject({ examined: 1, settled: 1, orphans: 0 });
    expect(settle).toHaveBeenCalledWith(OUR_ORDER_ID);
  });

  it('retrouve la commande par metadata.order_id quand notre référence ne correspond pas', async () => {
    // Le cœur du filet : même si provider_ref est faux chez nous, l'identifiant
    // que le fournisseur renvoie suffit à retrouver la commande.
    listKobaraPayments.mockResolvedValue([entry()]);
    getOrderByProviderRef.mockResolvedValue(null);
    getOrderById.mockResolvedValue(order());
    const settle = settleTo('granted');

    await expect(sweep(settle)).resolves.toMatchObject({ settled: 1 });
    expect(getOrderById).toHaveBeenCalledWith(OUR_ORDER_ID);
  });

  it('ne touche pas aux commandes dont les livres concordent déjà', async () => {
    listKobaraPayments.mockResolvedValue([entry()]);
    const settle = settleTo('already');
    for (const status of ['paid', 'fulfilled', 'refunded', 'needs_review'] as const) {
      vi.clearAllMocks();
      getOrderByProviderRef.mockResolvedValue(order({ status }));
      await expect(sweep(settle)).resolves.toMatchObject({ agreed: 1, settled: 0 });
      expect(settle).not.toHaveBeenCalled();
    }
  });

  it('signale un paiement encaissé sans commande correspondante', async () => {
    listKobaraPayments.mockResolvedValue([entry()]);
    await expect(sweep()).resolves.toMatchObject({ orphans: 1, settled: 0 });
    expect(logWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'natcash',
        status: 'failed',
        error: expect.stringContaining('sans commande correspondante'),
      }),
    );
  });

  it('ignore ce qui n’est pas encaissé, et ce qui est trop ancien', async () => {
    listKobaraPayments.mockResolvedValue([
      entry({ status: 'open', rawStatus: 'pending' }),
      entry({ status: 'unknown', rawStatus: 'quelque_chose' }),
      entry({ paidAt: new Date('2026-08-01T00:00:00.000Z'), createdAt: new Date('2026-08-01T00:00:00.000Z') }),
    ]);
    await expect(sweep()).resolves.toMatchObject({ examined: 0, settled: 0, orphans: 0 });
  });

  it('rapporte un registre illisible au lieu de conclure', async () => {
    listKobaraPayments.mockResolvedValue({ ok: false, message: 'HTTP 503' });
    await expect(sweep()).resolves.toMatchObject({ unavailable: 'HTTP 503', examined: 0 });
  });

  it('ne fait rien quand le rail n’est pas configuré', async () => {
    natcashConfigured.mockReturnValue(false);
    await expect(sweep()).resolves.toMatchObject({ unavailable: 'not_configured' });
    expect(listKobaraPayments).not.toHaveBeenCalled();
  });

  it('ne lance jamais : une entrée en erreur n’arrête pas le balayage', async () => {
    listKobaraPayments.mockResolvedValue([entry({ paymentId: 'pay_1' }), entry({ paymentId: 'pay_2' })]);
    getOrderByProviderRef.mockRejectedValueOnce(new Error('base indisponible')).mockResolvedValue(order());
    await expect(sweep(settleTo('granted'))).resolves.toMatchObject({ examined: 2, failed: 1, settled: 1 });
  });
});
