/**
 * lib/whatsapp/template.ts — the tiny template language of the messages.
 *
 *   {prenom}          replaced by its value (see PLACEHOLDERS in ./types);
 *   [[ … {ref_meru} ]] an optional part: kept only when every placeholder
 *                     inside it has a value, dropped whole otherwise — so
 *                     « , référence Meru ABC123 » appears only when there is
 *                     a reference to give.
 *
 * An unknown placeholder is left as it was typed (`{prenmo}`), so an
 * operator's typo shows in the preview instead of silently vanishing.
 */
import { PLACEHOLDERS, type PlaceholderName, type TemplateVars } from '@/lib/whatsapp/types';

const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;
const OPTIONAL_RE = /\[\[([\s\S]*?)\]\]/g;

function isPlaceholder(name: string): name is PlaceholderName {
  return Object.prototype.hasOwnProperty.call(PLACEHOLDERS, name);
}

/** The placeholder names a template uses, in order of appearance, without duplicates. */
export function placeholdersIn(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) names.add(match[1]);
  return [...names];
}

/** The placeholders a template uses that do not exist. */
export function unknownPlaceholders(template: string): string[] {
  return placeholdersIn(template).filter((name) => !isPlaceholder(name));
}

function substitute(text: string, vars: Partial<TemplateVars>): string {
  return text.replace(PLACEHOLDER_RE, (whole, name: string) =>
    isPlaceholder(name) && vars[name] !== undefined ? vars[name] : whole,
  );
}

/** Fills a template: optional parts first, then every placeholder. */
export function fillTemplate(template: string, vars: Partial<TemplateVars>): string {
  const withOptionals = template.replace(OPTIONAL_RE, (_whole, inner: string) => {
    const names = placeholdersIn(inner);
    const complete = names.every((name) => isPlaceholder(name) && (vars[name] ?? '').trim() !== '');
    return complete ? inner : '';
  });
  return substitute(withOptionals, vars);
}

/*
 * Emojis: pictographs, plus the invisible pieces that glue them together
 * (variation selector 16, zero-width joiner, skin tones, the keycap mark),
 * plus flags (pairs of regional indicators). Stripping the keycap mark from
 * « 1️⃣ » leaves a plain « 1 », which is exactly what a numbered question
 * needs without emojis.
 */
const EMOJI_CLASS = '[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\u{1F3FB}-\\u{1F3FF}\\u{FE0F}\\u{200D}\\u{20E3}]';
/** An emoji run and the spaces just before it: « Jean 😊, » → « Jean, ». */
const EMOJI_RUN_RE = new RegExp(`[ \\t]*${EMOJI_CLASS}+`, 'gu');
/** « 1️⃣ » (digit, VS16, keycap) → « 1. », before the rest is stripped. */
const KEYCAP_RE = /(\d)\u{FE0F}?\u{20E3}/gu;

/**
 * Removes every emoji. Only the spaces an emoji leaves behind are touched:
 * the French space before « ? » or « : » stays where the author put it.
 */
export function stripEmojis(text: string): string {
  return text
    .replace(KEYCAP_RE, '$1.')
    .replace(EMOJI_RUN_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '');
}

/** True when the text contains at least one emoji. */
export function hasEmoji(text: string): boolean {
  return /[\p{Extended_Pictographic}]/u.test(text);
}
