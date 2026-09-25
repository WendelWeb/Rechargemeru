/**
 * lib/whatsapp/context.ts — what the messages need from the settings, read
 * once per page and handed to `buildWhatsAppKit` for every order listed.
 */
import type { OrderRow } from '@/lib/orders/types';
import type { Settings } from '@/lib/settings/types';
import { siteUrl } from '@/lib/site-url';
import { buildWhatsAppKit, type WhatsAppContext, type WhatsAppKit } from '@/lib/whatsapp/render';

export function whatsappContext(settings: Settings): WhatsAppContext {
  return {
    businessName: settings.businessName,
    siteUrl: siteUrl(),
    slaFr: settings.fulfilmentSlaFr,
    slaHt: settings.fulfilmentSlaHt,
    supportHours: settings.supportHours,
    minUsdCents: settings.minUsdCents,
  };
}

/** The kits of a list of orders, by id; orders that may receive nothing are left out. */
export function whatsappKits(orders: readonly OrderRow[], settings: Settings): Record<string, WhatsAppKit> {
  const ctx = whatsappContext(settings);
  const out: Record<string, WhatsAppKit> = {};
  for (const order of orders) {
    const kit = buildWhatsAppKit(order, ctx);
    if (kit) out[order.id] = kit;
  }
  return out;
}
