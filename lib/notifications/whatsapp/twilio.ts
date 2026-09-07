/**
 * WhatsApp through Twilio (Messages API, `Body` = the rendered text).
 *
 * The Twilio sandbox (`TWILIO_SANDBOX=true` or the shared sandbox number as
 * sender) only reaches numbers that have sent the « join » keyword, so it is
 * an admin-only channel: the facade in `lib/notifications/whatsapp.ts` skips
 * customer messages in that mode. Never throws; secrets are read at call
 * time and never logged.
 */
import { envTrim } from '@/lib/env';
import type { WhatsAppMessage, WhatsAppSendResult } from '@/lib/notifications/whatsapp';

export const TWILIO_SANDBOX_FROM = '+14155238886';
export const TWILIO_TIMEOUT_MS = 15_000;

/** `TWILIO_WHATSAPP_FROM` with or without the `whatsapp:` prefix. */
function fromNumber(): string | undefined {
  const raw = envTrim('TWILIO_WHATSAPP_FROM');
  if (!raw) return undefined;
  const bare = raw.replace(/^whatsapp:/i, '').trim();
  return bare || undefined;
}

export function twilioConfigured(): boolean {
  return !!envTrim('TWILIO_ACCOUNT_SID') && !!envTrim('TWILIO_AUTH_TOKEN') && !!fromNumber();
}

export function twilioSandbox(): boolean {
  return envTrim('TWILIO_SANDBOX') === 'true' || fromNumber() === TWILIO_SANDBOX_FROM;
}

/** Human-readable target for the admin health page (French). */
export function twilioLabel(): string {
  return twilioSandbox()
    ? 'Twilio WhatsApp (sandbox — admin uniquement, « join » à renouveler toutes les 72 h)'
    : 'Twilio WhatsApp';
}

export async function sendTwilioWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const sid = envTrim('TWILIO_ACCOUNT_SID');
  const token = envTrim('TWILIO_AUTH_TOKEN');
  const from = fromNumber();
  if (!sid || !token || !from) return { sent: false, skipped: true, reason: 'not_configured' };

  const form = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${msg.to}`, Body: msg.text });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, skipped: false, error: httpError(res.status, readString(data, 'message')) };
    const id = readString(data, 'sid');
    return { sent: true, skipped: false, ...(id ? { id } : {}) };
  } catch (e) {
    return { sent: false, skipped: false, error: errorMessage(e) };
  }
}

function readString(data: unknown, key: string): string {
  if (typeof data !== 'object' || data === null) return '';
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function httpError(status: number, detail: string): string {
  const d = detail.replace(/\s+/g, ' ').trim();
  return `HTTP ${status}${d ? ` — ${d.slice(0, 160)}` : ''}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'error';
}
