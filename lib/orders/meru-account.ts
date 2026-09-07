/**
 * lib/orders/meru-account.ts — the identifier the dollars are sent to.
 *
 * Meru has no API: the operator types this value into the Meru app by hand
 * and the transfer cannot be recalled. The operator accepts an email or a
 * Meru username, never a phone number. Everything is normalised once, at
 * order creation, so the admin copies exactly what the customer meant, and
 * masked on the public tracking page so a reference alone reveals nothing.
 */
import type { MeruAccountType } from '@/lib/orders/types';

/** RFC 5321 path limit; longer strings are never a real mailbox. */
const EMAIL_MAX_LENGTH = 254;
/** Deliberately simple: one `@`, no whitespace, a dot somewhere in the domain. Meru validates the rest. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Meru usernames: letters, digits, dot, underscore, dash; case kept as typed. */
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/i;
/** Leading « @ » or « $ » people copy from the app or type by habit. */
const USERNAME_SIGILS = /^[@$]+/;

const MASK = '•••';

const LABELS_FR: Record<MeruAccountType, string> = {
  email: 'Email Meru',
  username: "Nom d'utilisateur Meru",
};

/**
 * Canonical value for `type`, or `null` when the input cannot be a Meru
 * account of that type.
 *
 * - `email`: trimmed, lowercased, must look like `local@domain.tld`.
 * - `username`: trimmed, leading `@` / `$` removed, 3–40 characters of
 *   `[a-z0-9._-]` in any case.
 */
export function normalizeMeruAccount(type: MeruAccountType, raw: string): string | null {
  const trimmed = raw.trim();
  if (type === 'email') {
    const email = trimmed.toLowerCase();
    if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
    return EMAIL_RE.test(email) ? email : null;
  }
  const username = trimmed.replace(USERNAME_SIGILS, '');
  return USERNAME_RE.test(username) ? username : null;
}

/** First one or two characters, then the mask — never more than two. */
function maskPart(part: string): string {
  const visible = part.length > 2 ? 2 : 1;
  return part.slice(0, visible) + MASK;
}

/**
 * Public rendering: `je•••@ma•••.com` for an email (top-level domain kept,
 * so the customer recognises their provider), `je•••` for a username.
 * Malformed values degrade to a masked prefix rather than throwing.
 */
export function maskMeruAccount(type: MeruAccountType, value: string): string {
  const v = value.trim();
  if (v.length === 0) return MASK;
  if (type === 'username') return maskPart(v);
  const at = v.indexOf('@');
  if (at < 0) return maskPart(v);
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${maskPart(local)}@${maskPart(domainName)}${tld}`;
}

/** French label of an identifier type, for the admin and the notifications. */
export function meruAccountLabelFr(type: MeruAccountType): string {
  return LABELS_FR[type];
}
