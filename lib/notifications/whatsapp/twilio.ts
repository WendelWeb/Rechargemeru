/**
 * WhatsApp through Twilio (Messages API, `Body` = the rendered text).
 *
 * Three variables, and nothing else, turn this adapter on:
 * `TWILIO_ACCOUNT_SID` (`AC…`), `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM`
 * — the sender, with or without the `whatsapp:` prefix. Where to click to read
 * each one is written down in docs/whatsapp-templates.md §9.
 *
 * The request is exactly what Twilio documents: HTTP Basic with the SID as
 * user and the auth token as password, an `application/x-www-form-urlencoded`
 * body, both numbers carrying the `whatsapp:` prefix, and a timeout so a
 * hanging call can never hold an order route open. The `sid` of the answer is
 * kept as the provider message id, which is what /admin/notifications shows.
 *
 * The Twilio sandbox (`TWILIO_SANDBOX=true`, or the shared sandbox number as
 * sender) only reaches numbers that have sent the « join … » keyword, and that
 * permission expires every 72 hours — so it is an admin-only channel: the
 * facade in `lib/notifications/whatsapp.ts` skips customer messages in that
 * mode rather than pretending to deliver them.
 *
 * Never throws; secrets are read at call time and never logged nor returned.
 */
import { envTrim } from '@/lib/env';
import type { WhatsAppMessage, WhatsAppSendResult } from '@/lib/notifications/whatsapp';

export const TWILIO_SANDBOX_FROM = '+14155238886';
export const TWILIO_TIMEOUT_MS = 15_000;

/** E.164, as everywhere else in the app. */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * `TWILIO_WHATSAPP_FROM` reduced to bare E.164: the `whatsapp:` prefix is
 * dropped (the adapter adds it back itself) and the separators a console
 * copy-paste carries — spaces, dashes, dots, parentheses — are removed, so
 * « whatsapp:+1 415 523 8886 » is recognised as the sandbox number instead of
 * being sent as a malformed sender.
 */
function fromNumber(): string | undefined {
  const raw = envTrim('TWILIO_WHATSAPP_FROM');
  if (!raw) return undefined;
  const bare = raw
    .replace(/^whatsapp:/i, '')
    .replace(/[\s().-]/g, '')
    .trim();
  return bare || undefined;
}

export function twilioConfigured(): boolean {
  return !!envTrim('TWILIO_ACCOUNT_SID') && !!envTrim('TWILIO_AUTH_TOKEN') && !!fromNumber();
}

/**
 * True when the sender is a usable E.164 number. A typo leaves the adapter
 * « configured » on purpose — /admin/sante can then say what is wrong, which
 * is more useful than WhatsApp silently reading as « not configured ».
 */
export function twilioSenderValid(): boolean {
  const from = fromNumber();
  return !!from && E164.test(from);
}

export function twilioSandbox(): boolean {
  const flag = envTrim('TWILIO_SANDBOX')?.toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes' || fromNumber() === TWILIO_SANDBOX_FROM;
}

/** Human-readable target for the admin health page (French). */
export function twilioLabel(): string {
  return twilioSandbox()
    ? 'Twilio WhatsApp (bac à sable — admin uniquement, « join » à renouveler toutes les 72 h)'
    : 'Twilio WhatsApp';
}

export async function sendTwilioWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const sid = envTrim('TWILIO_ACCOUNT_SID');
  const token = envTrim('TWILIO_AUTH_TOKEN');
  const from = fromNumber();
  if (!sid || !token || !from) return { sent: false, skipped: true, reason: 'not_configured' };
  // Twilio would answer 21212 several seconds later; saying it here puts the
  // typo in the notification journal instead of an opaque provider code.
  if (!E164.test(from)) return { sent: false, skipped: false, error: 'bad_sender' };

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
    if (!res.ok) return { sent: false, skipped: false, error: httpError(res.status, twilioDetail(data)) };
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

/** « 63016 — Failed to send freeform message » : the code is what one looks up. */
function twilioDetail(data: unknown): string {
  const message = readString(data, 'message');
  const raw = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).code : undefined;
  const code = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  if (code && message) return `${code} — ${message}`;
  return code || message;
}

function httpError(status: number, detail: string): string {
  const d = detail.replace(/\s+/g, ' ').trim();
  return `HTTP ${status}${d ? ` — ${d.slice(0, 160)}` : ''}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'error';
}
