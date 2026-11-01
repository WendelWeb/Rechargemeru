import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { availability, createOrder } = vi.hoisted(() => ({
  availability: { ORDERS_PAUSED: true },
  createOrder: vi.fn(),
}));

vi.mock('@/lib/orders/availability', () => availability);
vi.mock('@/lib/env', () => ({ dbConfigured: () => true }));
vi.mock('@/lib/auth/admin', () => ({ currentAdmin: async () => null }));
vi.mock('@/lib/auth/clerk', () => ({ currentUserEmail: async () => null, currentUserId: async () => null }));
vi.mock('@/lib/orders/create', async () => {
  const { z } = await import('zod');
  return { createOrder, createOrderSchema: z.object({ customerPhone: z.string() }) };
});

import { POST } from './route';

function order() {
  return new NextRequest('https://www.rechargemeru.com/api/orders', {
    method: 'POST',
    body: JSON.stringify({ customerPhone: '+50937001234' }),
    headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
  });
}

describe('POST /api/orders while the shop is closed', () => {
  beforeEach(() => {
    availability.ORDERS_PAUSED = true;
    createOrder.mockReset();
  });

  it('refuses the order and creates nothing', async () => {
    const res = await POST(order());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'orders_paused' });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('lets orders through again once reopened', async () => {
    availability.ORDERS_PAUSED = false;
    createOrder.mockResolvedValue({ ok: false, error: 'bad_phone' });
    const res = await POST(order());
    expect(res.status).toBe(400);
    expect(createOrder).toHaveBeenCalledOnce();
  });
});
