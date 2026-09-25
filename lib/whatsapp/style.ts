/**
 * lib/whatsapp/style.ts — the operator's coaching, made safe to use.
 *
 * Whatever sits in the `whatsapp_style` row (or arrives from the form) goes
 * through `normalizeStyle` before anything reads it: unknown tones fall back
 * to the default, texts are trimmed and bounded, empty jokes are dropped, and
 * an override is kept only for a real message, tone and language. A bad row
 * can therefore never break the message menu — at worst it is ignored.
 */
import {
  DEFAULT_WHATSAPP_STYLE,
  STYLE_LIMITS,
  WHATSAPP_LOCALES,
  WHATSAPP_TONES,
  overrideKey,
  type WhatsAppLocale,
  type WhatsAppStyle,
  type WhatsAppTone,
} from '@/lib/whatsapp/types';

function isTone(value: unknown): value is WhatsAppTone {
  return typeof value === 'string' && (WHATSAPP_TONES as readonly string[]).includes(value);
}

function isLocale(value: unknown): value is WhatsAppLocale {
  return typeof value === 'string' && (WHATSAPP_LOCALES as readonly string[]).includes(value);
}

/** At most `max` characters, never cutting an emoji in half (code points, not UTF-16 units). */
export function clip(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? clip(value.replace(/\r\n?/g, '\n').trim(), max).trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** One joke per line of a textarea → the list the store keeps. */
export function jokesFromText(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => clip(line.trim(), STYLE_LIMITS.jokeLength))
    .filter((line) => line.length > 0)
    .slice(0, STYLE_LIMITS.jokeCount);
}

/**
 * A complete, bounded style from anything. `knownIds` restricts overrides to
 * messages that exist (pass the catalogue's ids); without it any id is kept.
 */
export function normalizeStyle(raw: unknown, knownIds?: ReadonlySet<string>): WhatsAppStyle {
  const input = record(raw);
  const closing = record(input.closing);
  const jokes = record(input.jokes);
  const overridesIn = record(input.overrides);

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(overridesIn)) {
    if (Object.keys(overrides).length >= STYLE_LIMITS.overrideCount) break;
    const [id, tone, locale] = key.split('|');
    if (!id || !isTone(tone) || !isLocale(locale)) continue;
    if (knownIds && !knownIds.has(id)) continue;
    const body = text(value, STYLE_LIMITS.overrideLength);
    if (body) overrides[overrideKey(id, tone, locale)] = body;
  }

  const jokeList = (locale: WhatsAppLocale): string[] => {
    const value = jokes[locale];
    const lines = Array.isArray(value) ? value.map((j) => text(j, STYLE_LIMITS.jokeLength)) : [];
    return lines.filter(Boolean).slice(0, STYLE_LIMITS.jokeCount);
  };

  return {
    defaultTone: isTone(input.defaultTone) ? input.defaultTone : DEFAULT_WHATSAPP_STYLE.defaultTone,
    emojis: typeof input.emojis === 'boolean' ? input.emojis : DEFAULT_WHATSAPP_STYLE.emojis,
    signatureName: text(input.signatureName, STYLE_LIMITS.signatureName),
    closing: { fr: text(closing.fr, STYLE_LIMITS.closing), ht: text(closing.ht, STYLE_LIMITS.closing) },
    jokes: { fr: jokeList('fr'), ht: jokeList('ht') },
    overrides,
  };
}
