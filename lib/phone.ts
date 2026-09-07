/**
 * lib/phone.ts — WhatsApp phone numbers, stored as E.164 strings.
 *
 * Two shapes are accepted: Haitian mobiles (`+509` + 8 digits, local part
 * starting with 2–5) and North American numbers (`+1` + 10 digits, for the
 * diaspora paying for family). Everything else is refused: the number is
 * where we reach the customer about their money, so a typo must fail loudly
 * at the form rather than silently at notification time.
 */

const HAITIAN_LOCAL = /^[2-5]\d{7}$/;
const NANP = /^1[2-9][0-9]{9}$/;
const E164_NANP = /^\+1\d{10}$/;
const E164_HAITI = /^\+509\d{8}$/;

function haitian(local: string): string | null {
  return HAITIAN_LOCAL.test(local) ? `+509${local}` : null;
}

/**
 * Normalizes any common spelling to E.164, or `null` when the input is not a
 * Haitian or North American number: strips every non-digit, drops a leading
 * international `00`, then accepts 8 digits (Haitian local), `509` + 8, or
 * `1` + 10 (NANP: area code not starting with 0 or 1).
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) return haitian(digits);
  if (digits.length === 11 && digits.startsWith('509')) return haitian(digits.slice(3));
  if (digits.length === 11 && digits.startsWith('1')) return NANP.test(digits) ? `+${digits}` : null;
  return null;
}

export function isHaitian(e164: string): boolean {
  return e164.startsWith('+509');
}

export function lastFour(e164: string): string {
  return e164.slice(-4);
}

/** Public-page mask: `+509 •••• 1234`, `+1 ••• ••• 4567`. */
export function maskPhone(e164: string): string {
  if (isHaitian(e164)) return `+509 •••• ${lastFour(e164)}`;
  if (E164_NANP.test(e164)) return `+1 ••• ••• ${lastFour(e164)}`;
  return `•••• ${lastFour(e164)}`;
}

/** Human spacing: `+509 3700 1234`, `+1 555 123 4567`; unknown shapes pass through. */
export function formatPhone(e164: string): string {
  if (E164_HAITI.test(e164)) {
    const local = e164.slice(4);
    return `+509 ${local.slice(0, 4)} ${local.slice(4)}`;
  }
  if (E164_NANP.test(e164)) {
    const local = e164.slice(2);
    return `+1 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return e164;
}
