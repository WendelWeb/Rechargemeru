import { describe, it, expect } from 'vitest';
import type { GatewayFailure } from '@/lib/payments/gateway';
import type { MoncashFailure, MoncashPayment } from '@/lib/payments/moncash';
import type { NatcashPayment } from '@/lib/payments/natcash';
import type { NotificationTemplate, OrderEventRow, OrderRow, OrderStatus } from '@/lib/orders/types';
import type { OrderEventInput, OrderEventType } from './events';
import { settleOrder, type SettleDeps, type SettleOptions } from './settle';

const NOW = new Date('2026-09-06T12:10:00Z');
const CREATED = new Date('2026-09-06T12:00:00Z');
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER_ID,
    reference: 'MR-ABCDEFGH',
    status: 'pending_payment',
    method: 'moncash',
    provider: 'bazik',
    providerRef: 'BZK_123',
    providerTransactionId: null,
    payerWallet: null,
    mode: 'live',
    usdCents: 2000,
    fxRateHtg: 132.5,
    baseHtg: 2650,
    feeLines: [{ id: 'svc', label: 'Frais de service', kind: 'percent', value: 5, basis: 'base', amountHtg: 133 }],
    totalHtg: 2783,
    paidHtg: null,
    fulfilledUsdCents: null,
    refundHtg: null,
    refundWallet: null,
    clerkUserId: null,
    accountEmail: null,
    deviceId: null,
    customerName: 'Jean Baptiste',
    customerPhone: '+50937001234',
    customerEmail: null,
    meruAccountType: 'email',
    meruAccount: 'jean@mail.com',
    meruReference: null,
    redirectUrl: 'https://pay.example/x',
    redirectExpiresAt: new Date(CREATED.getTime() + 600_000),
    returnedAt: null,
    lastVerifiedAt: null,
    verifyAttempts: 0,
    failureReason: null,
    adminNote: null,
    locale: 'fr',
    createdAt: CREATED,
    updatedAt: CREATED,
    expiresAt: new Date(CREATED.getTime() + 1_800_000),
    paidAt: null,
    fulfilledAt: null,
    ...overrides,
  };
}

const paid = (amountHtg: number | null = 2783): MoncashPayment => ({
  ok: true,
  paid: true,
  transactionId: 'TX1',
  amountHtg,
  payer: '50937001234',
  raw: {},
});
const unpaid = (): MoncashPayment => ({ ok: true, paid: false, transactionId: null, amountHtg: null, payer: null, raw: {} });
const failure = (message: string): MoncashFailure => ({ ok: false, message });

const natPaid = (over: Partial<NatcashPayment> = {}): NatcashPayment => ({
  ok: true,
  paid: true,
  transactionId: 'NTX',
  amountHtg: 2783,
  payer: null,
  raw: {},
  matchedOrderId: ORDER_ID,
  matchedPaymentId: 'KOB_1',
  ...over,
});

type Fake = {
  deps: SettleDeps;
  orders: Map<string, OrderRow>;
  events: OrderEventRow[];
  notified: { orderId: string; template: NotificationTemplate }[];
  moncashCalls: number;
  natcashCalls: number;
  transitions: OrderStatus[];
};

type FakeOptions = {
  moncash?: Array<MoncashPayment | MoncashFailure>;
  natcash?: Array<NatcashPayment | GatewayFailure>;
  tolerance?: number;
  now?: Date;
  transitionNull?: boolean;
  retryDelaysMs?: number[];
};

function makeFake(order: OrderRow | null, opts: FakeOptions = {}): Fake {
  const orders = new Map<string, OrderRow>();
  if (order) orders.set(order.id, order);
  const moncashQueue = [...(opts.moncash ?? [paid()])];
  const natcashQueue = [...(opts.natcash ?? [natPaid()])];
  const fake: Fake = {
    orders,
    events: [],
    notified: [],
    moncashCalls: 0,
    natcashCalls: 0,
    transitions: [],
    deps: {} as SettleDeps,
  };
  let eventSeq = 0;
  const next = <T>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : queue[0]);
  fake.deps = {
    loadOrder: async (id) => orders.get(id) ?? null,
    transitionOrder: async (id, to, patch) => {
      fake.transitions.push(to);
      if (opts.transitionNull) return null;
      const current = orders.get(id);
      if (!current) return null;
      const updated: OrderRow = { ...current, ...patch, status: to, updatedAt: opts.now ?? NOW } as OrderRow;
      orders.set(id, updated);
      return updated;
    },
    updateOrder: async (id, patch) => {
      const current = orders.get(id);
      if (!current) return null;
      const updated: OrderRow = { ...current, ...patch, updatedAt: opts.now ?? NOW } as OrderRow;
      orders.set(id, updated);
      return updated;
    },
    appendEvent: async (ev: OrderEventInput) => {
      eventSeq += 1;
      const row: OrderEventRow = {
        id: `ev-${eventSeq}`,
        orderId: ev.orderId,
        type: ev.type,
        message: ev.message ?? null,
        data: ev.data ?? null,
        actor: ev.actor ?? 'system',
        createdAt: opts.now ?? NOW,
      };
      fake.events.push(row);
      return row;
    },
    lastEventOfType: async (orderId: string, type: OrderEventType) => {
      const found = fake.events.filter((e) => e.orderId === orderId && e.type === type);
      return found.length > 0 ? found[found.length - 1] : null;
    },
    retrieveMoncash: async () => {
      fake.moncashCalls += 1;
      return next(moncashQueue);
    },
    retrieveNatcash: async () => {
      fake.natcashCalls += 1;
      return next(natcashQueue);
    },
    notify: async (o: OrderRow, template: NotificationTemplate) => {
      fake.notified.push({ orderId: o.id, template });
    },
    now: () => opts.now ?? NOW,
    retryDelaysMs: opts.retryDelaysMs ?? [0, 0],
    amountToleranceHtg: async () => opts.tolerance ?? 0,
  };
  return fake;
}

const types = (f: Fake): OrderEventType[] => f.events.map((e) => e.type as OrderEventType);
const RECHECK: SettleOptions = { actor: 'customer', source: 'recheck' };

describe('settleOrder', () => {
  it('reports an unknown order without asking the provider', async () => {
    const f = makeFake(null);
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('unknown_order');
    expect(f.moncashCalls).toBe(0);
  });

  it.each(['paid', 'fulfilled', 'needs_review'] as const)('answers already for a %s order without a provider call', async (status) => {
    const f = makeFake(makeOrder({ status }));
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('already');
    expect(f.moncashCalls).toBe(0);
    expect(f.notified).toEqual([]);
  });

  it('grants a MonCash payment of the exact amount and notifies paid once', async () => {
    const f = makeFake(makeOrder());
    const r = await settleOrder(ORDER_ID, { actor: 'provider', source: 'webhook' }, f.deps);
    expect(r.status).toBe('granted');
    const o = f.orders.get(ORDER_ID)!;
    expect(o.status).toBe('paid');
    expect(o.paidHtg).toBe(2783);
    expect(o.providerTransactionId).toBe('TX1');
    expect(o.payerWallet).toBe('50937001234');
    expect(o.paidAt).toEqual(NOW);
    expect(o.lastVerifiedAt).toEqual(NOW);
    expect(o.verifyAttempts).toBe(1);
    expect(types(f)).toEqual(['verified_paid', 'status_changed']);
    expect(f.notified).toEqual([{ orderId: ORDER_ID, template: 'paid' }]);
    expect(r.order?.status).toBe('paid');
  });

  it('retries a transient provider failure and then grants', async () => {
    const f = makeFake(makeOrder(), { moncash: [failure('timeout'), paid()] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('granted');
    expect(f.moncashCalls).toBe(2);
  });

  it('records a non-transient provider failure as error', async () => {
    const f = makeFake(makeOrder(), { moncash: [failure('HTTP 404 — not found')] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('error');
    expect(f.moncashCalls).toBe(1);
    expect(types(f)).toEqual(['verification_failed']);
    expect(f.orders.get(ORDER_ID)!.verifyAttempts).toBe(1);
    expect(f.notified).toEqual([]);
  });

  it('answers not_configured when the order’s provider cannot be reached', async () => {
    const f = makeFake(makeOrder(), { moncash: [failure('order_provider_unavailable')] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('not_configured');
    expect(f.transitions).toEqual([]);
  });

  it('answers unpaid and records verified_unpaid at most once every five minutes', async () => {
    const f = makeFake(makeOrder(), { moncash: [unpaid()] });
    expect((await settleOrder(ORDER_ID, RECHECK, f.deps)).status).toBe('unpaid');
    expect((await settleOrder(ORDER_ID, RECHECK, f.deps)).status).toBe('unpaid');
    expect(types(f)).toEqual(['verified_unpaid']);
    expect(f.orders.get(ORDER_ID)!.status).toBe('pending_payment');
    expect(f.orders.get(ORDER_ID)!.verifyAttempts).toBe(2);

    const later = makeFake(f.orders.get(ORDER_ID)!, { moncash: [unpaid()], now: new Date(NOW.getTime() + 6 * 60_000) });
    later.events.push(...f.events);
    await settleOrder(ORDER_ID, RECHECK, later.deps);
    expect(types(later).filter((t) => t === 'verified_unpaid')).toHaveLength(2);
  });

  it('retries once on unpaid only when asked', async () => {
    const eager = makeFake(makeOrder(), { moncash: [unpaid(), paid()], retryDelaysMs: [0] });
    const r1 = await settleOrder(ORDER_ID, { ...RECHECK, source: 'retour', retryOnUnpaid: true }, eager.deps);
    expect(r1.status).toBe('granted');
    expect(eager.moncashCalls).toBe(2);

    const lazy = makeFake(makeOrder(), { moncash: [unpaid(), paid()], retryDelaysMs: [0] });
    const r2 = await settleOrder(ORDER_ID, { ...RECHECK, retryOnUnpaid: false }, lazy.deps);
    expect(r2.status).toBe('unpaid');
    expect(lazy.moncashCalls).toBe(1);
  });

  it('routes a short payment to review with amount_mismatch, within tolerance to paid', async () => {
    const strict = makeFake(makeOrder(), { moncash: [paid(2700)] });
    const r = await settleOrder(ORDER_ID, RECHECK, strict.deps);
    expect(r.status).toBe('review');
    const o = strict.orders.get(ORDER_ID)!;
    expect(o.status).toBe('needs_review');
    expect(o.paidHtg).toBe(2700);
    expect(o.failureReason).toBeTruthy();
    expect(types(strict)).toContain('amount_mismatch');
    expect(strict.notified).toEqual([{ orderId: ORDER_ID, template: 'needs_review' }]);

    const tolerant = makeFake(makeOrder(), { moncash: [paid(2700)], tolerance: 100 });
    expect((await settleOrder(ORDER_ID, RECHECK, tolerant.deps)).status).toBe('granted');
    expect(types(tolerant)).not.toContain('amount_mismatch');
  });

  it('routes an unreported amount to review with amount_unreported', async () => {
    const f = makeFake(makeOrder(), { moncash: [paid(null)] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('review');
    expect(types(f)).toContain('amount_unreported');
    expect(f.orders.get(ORDER_ID)!.paidHtg).toBeNull();
  });

  it('grants an overpayment but records the mismatch', async () => {
    const f = makeFake(makeOrder(), { moncash: [paid(3000)] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('granted');
    expect(types(f)).toContain('amount_mismatch');
    expect(f.orders.get(ORDER_ID)!.paidHtg).toBe(3000);
  });

  it('routes a payment confirmed after expiry to review with paid_after_expiry', async () => {
    const materialised = makeFake(makeOrder({ status: 'expired' }));
    const r1 = await settleOrder(ORDER_ID, { actor: 'system', source: 'cron' }, materialised.deps);
    expect(r1.status).toBe('review');
    expect(types(materialised)).toContain('paid_after_expiry');
    expect(materialised.orders.get(ORDER_ID)!.status).toBe('needs_review');

    const derived = makeFake(makeOrder({ expiresAt: new Date(NOW.getTime() - 1000) }));
    const r2 = await settleOrder(ORDER_ID, RECHECK, derived.deps);
    expect(r2.status).toBe('review');
    expect(types(derived)).toContain('paid_after_expiry');
  });

  it('routes a payment received after a refund to review with paid_after_refund', async () => {
    const f = makeFake(makeOrder({ status: 'refunded', refundHtg: 2783 }));
    const r = await settleOrder(ORDER_ID, { actor: 'system', source: 'cron' }, f.deps);
    expect(r.status).toBe('review');
    expect(types(f)).toContain('paid_after_refund');
    expect(f.notified).toEqual([{ orderId: ORDER_ID, template: 'needs_review' }]);
    expect(f.orders.get(ORDER_ID)!.failureReason).toContain('remboursement');
  });

  it('grants a NatCash retrieve-only answer only on a strict match', async () => {
    const natOrder = makeOrder({ method: 'natcash', provider: 'kobara', providerRef: 'KOB_1' });
    const strict = makeFake(natOrder, { natcash: [natPaid()] });
    expect((await settleOrder(ORDER_ID, RECHECK, strict.deps)).status).toBe('granted');
    expect(strict.natcashCalls).toBe(1);
    expect(strict.moncashCalls).toBe(0);

    const wrongOrder = makeFake(natOrder, { natcash: [natPaid({ matchedOrderId: null })] });
    expect((await settleOrder(ORDER_ID, RECHECK, wrongOrder.deps)).status).toBe('review');
    expect(wrongOrder.orders.get(ORDER_ID)!.status).toBe('needs_review');

    const wrongPayment = makeFake(natOrder, { natcash: [natPaid({ matchedPaymentId: 'OTHER' })] });
    expect((await settleOrder(ORDER_ID, RECHECK, wrongPayment.deps)).status).toBe('review');
  });

  it('answers pending when the NatCash provider cannot be read', async () => {
    const natOrder = makeOrder({ method: 'natcash', provider: 'kobara', providerRef: 'KOB_1' });
    const f = makeFake(natOrder, { natcash: [{ ok: false, message: 'unsupported_by_provider' }] });
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('pending');
    expect(f.orders.get(ORDER_ID)!.verifyAttempts).toBe(1);
    expect(f.transitions).toEqual([]);

    const noRef = makeFake(makeOrder({ method: 'natcash', provider: 'kobara', providerRef: null }));
    expect((await settleOrder(ORDER_ID, RECHECK, noRef.deps)).status).toBe('pending');
    expect(noRef.natcashCalls).toBe(0);
  });

  it('grants a NatCash order on a signed webhook proof without reading the provider', async () => {
    const natOrder = makeOrder({ method: 'natcash', provider: 'kobara', providerRef: 'KOB_1' });
    const f = makeFake(natOrder);
    const r = await settleOrder(
      ORDER_ID,
      {
        actor: 'provider',
        source: 'webhook',
        proof: { paid: true, amountHtg: 2783, transactionId: 'NTX9', payer: null },
      },
      f.deps,
    );
    expect(r.status).toBe('granted');
    expect(f.natcashCalls).toBe(0);
    expect(f.orders.get(ORDER_ID)!.providerTransactionId).toBe('NTX9');

    const unpaidProof = makeFake(natOrder);
    const r2 = await settleOrder(
      ORDER_ID,
      { actor: 'provider', source: 'webhook', proof: { paid: false, amountHtg: null, transactionId: null, payer: null } },
      unpaidProof.deps,
    );
    expect(r2.status).toBe('unpaid');
    expect(types(unpaidProof)).toEqual(['verified_unpaid']);
  });

  it('answers already and notifies nothing when another caller won the compare-and-set', async () => {
    const f = makeFake(makeOrder(), { transitionNull: true });
    const r = await settleOrder(ORDER_ID, { actor: 'provider', source: 'webhook' }, f.deps);
    expect(r.status).toBe('already');
    expect(f.notified).toEqual([]);
    expect(types(f)).toEqual([]);
  });

  it('never throws: a failing dependency yields error', async () => {
    const f = makeFake(makeOrder());
    f.deps.loadOrder = async () => {
      throw new Error('boom');
    };
    const r = await settleOrder(ORDER_ID, RECHECK, f.deps);
    expect(r.status).toBe('error');
    expect(r.message).toBe('boom');
  });
});
