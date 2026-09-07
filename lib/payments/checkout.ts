/**
 * lib/payments/checkout.ts — which rails this browser may pay through.
 *
 * A method is offered when its provider is configured and, on the Vercel
 * production deployment, only when the rail is live or the browser carries
 * an admin session (a sandbox rail never moves money and its orders can
 * never be recharged). The same answer feeds the home page (which methods
 * to show) and `POST /api/orders` (which methods to accept), so the two can
 * never disagree.
 */
import type { GatewayMode, PaymentMethod } from '@/lib/orders/types';
import { moncashCheckoutAllowed, moncashLabel, moncashMode } from '@/lib/payments/moncash';
import { natcashCheckoutAllowed, natcashLabel, natcashMode } from '@/lib/payments/natcash';

export type MethodAvailability = {
  method: PaymentMethod;
  available: boolean;
  mode: GatewayMode;
  /** Display name of the rail: « MonCash » / « NatCash ». */
  label: string;
  /** The provider behind it, for the admin health page (French). */
  providerLabel: string;
};

export const METHOD_DISPLAY_LABELS: Record<PaymentMethod, string> = { moncash: 'MonCash', natcash: 'NatCash' };

/** Both rails, in display order, with whether this browser may use each. */
export function availableMethods(hasAdminSession: boolean): MethodAvailability[] {
  return [
    {
      method: 'moncash',
      available: moncashCheckoutAllowed(hasAdminSession),
      mode: moncashMode(),
      label: METHOD_DISPLAY_LABELS.moncash,
      providerLabel: moncashLabel(),
    },
    {
      method: 'natcash',
      available: natcashCheckoutAllowed(hasAdminSession),
      mode: natcashMode(),
      label: METHOD_DISPLAY_LABELS.natcash,
      providerLabel: natcashLabel(),
    },
  ];
}

export function methodAvailable(method: PaymentMethod, hasAdminSession: boolean): boolean {
  return method === 'moncash' ? moncashCheckoutAllowed(hasAdminSession) : natcashCheckoutAllowed(hasAdminSession);
}

/** The environment a new order on `method` starts in, before the provider answers. */
export function methodMode(method: PaymentMethod): GatewayMode {
  return method === 'moncash' ? moncashMode() : natcashMode();
}
