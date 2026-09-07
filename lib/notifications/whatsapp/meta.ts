/**
 * WhatsApp through the Meta Cloud API (Graph API).
 *
 * Outside the 24-hour customer-service window Meta only delivers approved
 * *template* messages, so `WHATSAPP_META_TEMPLATES` maps each notification
 * template and locale to an approved template name:
 *
 *   { "paid": { "fr": "meru_paid_fr", "ht": "meru_paid_ht" }, ... }
 *
 * A locale without its own entry falls back to the `fr` one. Without any
 * mapping the message is sent as free text (valid only inside the window).
 * Never throws; the token is read at call time and never logged.
 */
import { envTrim } from '@/lib/env';
import type { Locale, NotificationTemplate } from '@/lib/orders/types';
import type { WhatsAppMessage, WhatsAppSendResult } from '@/lib/notifications/whatsapp';

export const META_GRAPH_VERSION = 'v21.0';
export const META_TIMEOUT_MS = 15_000;

export function metaConfigured(): boolean {
  return !!envTrim('WHATSAPP_META_TOKEN') && !!envTrim('WHATSAPP_META_PHONE_NUMBER_ID');
}

/** Language code sent with every template message (`fr` unless overridden). */
export function metaTemplateLanguage(): string {
  return envTrim('WHATSAPP_META_TEMPLATE_LANG') ?? 'fr';
}

/** Human-readable target for the admin health page (French). */
export function metaLabel(): string {
  return 'Meta WhatsApp Cloud API';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseTemplateMap(): Record<string, unknown> | null {
  const raw = envTrim('WHATSAPP_META_TEMPLATES');
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Approved template name for `(template, locale)`, falling back to `fr`; null without a mapping. */
export function metaTemplateName(template: NotificationTemplate, locale: Locale): string | null {
  const map = parseTemplateMap();
  if (!map) return null;
  const entry = map[template];
  if (typeof entry === 'string') return nonEmpty(entry);
  if (!isRecord(entry)) return null;
  return nonEmpty(entry[locale]) ?? nonEmpty(entry.fr);
}

type MetaTextParameter = { type: 'text'; text: string };

type MetaPayload =
  | {
      messaging_product: 'whatsapp';
      recipient_type: 'individual';
      to: string;
      type: 'template';
      template: {
        name: string;
        language: { code: string };
        components?: { type: 'body'; parameters: MetaTextParameter[] }[];
      };
    }
  | {
      messaging_product: 'whatsapp';
      recipient_type: 'individual';
      to: string;
      type: 'text';
      text: { preview_url: boolean; body: string };
    };

function templatePayload(to: string, name: string, params: string[]): MetaPayload {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: metaTemplateLanguage() },
      ...(params.length > 0
        ? { components: [{ type: 'body', parameters: params.map((text): MetaTextParameter => ({ type: 'text', text })) }] }
        : {}),
    },
  };
}

function textPayload(to: string, body: string): MetaPayload {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } };
}

export async function sendMetaWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const token = envTrim('WHATSAPP_META_TOKEN');
  const phoneNumberId = envTrim('WHATSAPP_META_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) return { sent: false, skipped: true, reason: 'not_configured' };

  // Graph API wants the E.164 digits without the leading « + ».
  const to = msg.to.replace(/^\+/, '');
  const templateName = metaTemplateName(msg.template, msg.locale);
  const payload = templateName ? templatePayload(to, templateName, msg.params) : textPayload(to, msg.text);

  try {
    const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = isRecord(data) && isRecord(data.error) ? (nonEmpty(data.error.message) ?? '') : '';
      return { sent: false, skipped: false, error: httpError(res.status, detail) };
    }
    const first = isRecord(data) && Array.isArray(data.messages) ? data.messages[0] : null;
    const id = isRecord(first) ? nonEmpty(first.id) : null;
    return { sent: true, skipped: false, ...(id ? { id } : {}) };
  } catch (e) {
    return { sent: false, skipped: false, error: errorMessage(e) };
  }
}

function httpError(status: number, detail: string): string {
  const d = detail.replace(/\s+/g, ' ').trim();
  return `HTTP ${status}${d ? ` — ${d.slice(0, 160)}` : ''}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'error';
}
