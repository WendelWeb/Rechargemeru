/**
 * lib/orders/reference.ts — the order number customers see and type.
 *
 * `MR-` followed by eight characters from a 32-symbol alphabet with no
 * look-alikes (no I, O, 0 or 1): 32^8 ≈ 1.1 × 10^12 values drawn with
 * `crypto.randomInt`, so one reference never hints at the next. Everything a
 * customer types on the tracking page goes through `normalizeReference`
 * before it reaches the database, so « mr 7f3k 2qab » finds « MR-7F3K2QAB ».
 */
import { randomInt } from 'node:crypto';

export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_LENGTH = 8;
export const REFERENCE_PREFIX = 'MR-';

/** Whitespace, underscores and hyphens of every width (U+2010 – U+2015): separators people type or paste. */
const SEPARATORS = /[\s\-_\u2010-\u2015]/g;

const defaultRand = (max: number): number => randomInt(max);

/**
 * A fresh reference. `rand(max)` must return an integer in `[0, max)`;
 * the default is the CSPRNG-backed `randomInt`, tests inject a deterministic
 * generator (`() => 0` gives `MR-AAAAAAAA`).
 */
export function generateReference(rand: (max: number) => number = defaultRand): string {
  const size = REFERENCE_ALPHABET.length;
  let body = '';
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    const index = rand(size);
    if (!Number.isInteger(index) || index < 0 || index >= size) {
      throw new RangeError(`generateReference: generator returned ${index}, expected an integer in [0, ${size})`);
    }
    body += REFERENCE_ALPHABET.charAt(index);
  }
  return REFERENCE_PREFIX + body;
}

/**
 * Canonical `MR-XXXXXXXX` from whatever the customer typed, or `null`.
 *
 * Case, spaces, hyphens and underscores are ignored and the `MR` prefix is
 * optional. A ten-character value must start with `MR`; an eight-character
 * value is taken as the body itself, so a body that happens to start with
 * `MR` is not eaten by the prefix rule.
 */
export function normalizeReference(input: string): string | null {
  const cleaned = input.toUpperCase().replace(SEPARATORS, '');
  let body: string;
  if (cleaned.length === REFERENCE_LENGTH + 2 && cleaned.startsWith('MR')) {
    body = cleaned.slice(2);
  } else if (cleaned.length === REFERENCE_LENGTH) {
    body = cleaned;
  } else {
    return null;
  }
  for (const ch of body) {
    if (!REFERENCE_ALPHABET.includes(ch)) return null;
  }
  return REFERENCE_PREFIX + body;
}
