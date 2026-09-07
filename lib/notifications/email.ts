/**
 * Email channel — Resend REST API through `fetch`, no SDK.
 *
 * Never throws: every failure is `{ sent: false, error }`, and a missing
 * configuration is `{ sent: false, skipped: true }` so callers can
 * `await sendEmail(...)` unconditionally. The API key is read from the
 * environment at call time and is never logged nor returned.
 */
import { envTrim } from '@/lib/env';

export type SendEmailResult = { sent: boolean; skipped: boolean; id?: string; error?: string };

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text alternative (deliverability and accessibility). */
  text?: string;
  replyTo?: string;
};

export const EMAIL_TIMEOUT_MS = 15_000;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Both the key and the verified sender are required — admin alerts rely on it. */
export function emailConfigured(): boolean {
  return !!envTrim('RESEND_API_KEY') && !!envTrim('RESEND_FROM');
}

/** The sender address that will be used, for the admin health page. */
export function emailSender(): string | null {
  return envTrim('RESEND_FROM') ?? null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = envTrim('RESEND_API_KEY');
  const from = envTrim('RESEND_FROM');
  if (!key || !from) return { sent: false, skipped: true };

  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((r) => r.trim()).filter((r) => r.length > 0);
  if (to.length === 0) return { sent: false, skipped: false, error: 'no_recipient' };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, skipped: false, error: httpError(res.status, body) };
    }
    const data: unknown = await res.json().catch(() => ({}));
    const id = typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string' ? data.id : null;
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
