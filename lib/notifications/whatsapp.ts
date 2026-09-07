/**
 * WhatsApp facade: picks the configured adapter (Meta Cloud API or Twilio)
 * and applies the sandbox rule — in the Twilio sandbox only the admin who
 * joined the sandbox can receive messages, so customer messages are
 * reported as `skipped` instead of being attempted. Never throws.
 */
import { envTrim } from '@/lib/env';
import type { Locale, NotificationTemplate } from '@/lib/orders/types';
import { metaConfigured, metaLabel, sendMetaWhatsApp } from '@/lib/notifications/whatsapp/meta';
import { sendTwilioWhatsApp, twilioConfigured, twilioLabel, twilioSandbox } from '@/lib/notifications/whatsapp/twilio';

export type WhatsAppSendResult = { sent: boolean; skipped: boolean; id?: string; error?: string; reason?: string };

export type WhatsAppAudience = 'admin' | 'customer';

export type WhatsAppMessage = {
  /** E.164 recipient. */
  to: string;
  template: NotificationTemplate;
  locale: Locale;
  /** Template parameters in the documented order (Meta template messages). */
  params: string[];
  /** Rendered text — Twilio `Body`, and the Meta fallback without a template mapping. */
  text: string;
  audience: WhatsAppAudience;
};

export type WhatsAppProviderId = 'meta' | 'twilio';

export const WHATSAPP_PROVIDER_IDS: readonly WhatsAppProviderId[] = ['meta', 'twilio'];

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * An explicit `WHATSAPP_PROVIDER` is honoured or refused, never silently
 * redirected to the other adapter; without one, Meta wins over Twilio.
 */
export function pickWhatsAppProvider(
  requested: string | undefined,
  configured: Record<WhatsAppProviderId, boolean>,
): WhatsAppProviderId | null {
  const want = requested?.trim().toLowerCase();
  if (want) {
    if (want !== 'meta' && want !== 'twilio') return null;
    return configured[want] ? want : null;
  }
  if (configured.meta) return 'meta';
  if (configured.twilio) return 'twilio';
  return null;
}

export function activeWhatsAppProvider(): WhatsAppProviderId | null {
  return pickWhatsAppProvider(envTrim('WHATSAPP_PROVIDER'), { meta: metaConfigured(), twilio: twilioConfigured() });
}

export function whatsappConfigured(): boolean {
  return activeWhatsAppProvider() !== null;
}

/** `sandbox` when the active adapter is the Twilio sandbox (admin-only). */
export function whatsappMode(): 'sandbox' | 'live' {
  return activeWhatsAppProvider() === 'twilio' && twilioSandbox() ? 'sandbox' : 'live';
}

/** Human-readable target for the admin health page (French). */
export function whatsappLabel(): string {
  switch (activeWhatsAppProvider()) {
    case 'meta':
      return metaLabel();
    case 'twilio':
      return twilioLabel();
    default:
      return 'aucun fournisseur configuré';
  }
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const provider = activeWhatsAppProvider();
  if (!provider) return { sent: false, skipped: true, reason: 'not_configured' };
  if (!E164.test(msg.to)) return { sent: false, skipped: false, error: 'bad_recipient' };
  if (provider === 'twilio' && msg.audience === 'customer' && twilioSandbox()) {
    return { sent: false, skipped: true, reason: 'twilio_sandbox_customer' };
  }
  try {
    return provider === 'meta' ? await sendMetaWhatsApp(msg) : await sendTwilioWhatsApp(msg);
  } catch (e) {
    return { sent: false, skipped: false, error: e instanceof Error && e.message ? e.message : 'error' };
  }
}
