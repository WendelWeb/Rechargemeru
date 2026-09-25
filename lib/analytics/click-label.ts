/**
 * lib/analytics/click-label.ts — what a click is called in the journal.
 *
 * The journal says « a cliqué « Continuer » », never « a tapé jean@… »:
 * only the name of what was pressed is kept — a button's words, a link's
 * destination — and nothing a visitor typed. As a last guard, a name that
 * looks like personal data (an address, a phone number) is replaced by the
 * kind of element it was.
 */

const MAX_NAME = 80;
const MAX_TARGET = 200;

/** Personal data a label must never carry: an email, a run of six digits or more (a phone). */
const PERSONAL_RE = /@|\d[\d\s.-]{5,}\d/;

/** Collapses whitespace and bounds the length; `null` for nothing usable or anything personal. */
export function cleanLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (PERSONAL_RE.test(text)) return null;
  const chars = Array.from(text);
  return chars.length <= MAX_NAME ? text : `${chars.slice(0, MAX_NAME - 1).join('')}…`;
}

/**
 * Where a link goes, in the words of the journal: a path on this site
 * (« /fr/suivi »), « whatsapp » for a wa.me link — without the number or the
 * pre-written text — or the other site's host.
 */
export function linkTarget(href: string | null | undefined, ownOrigin: string): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, ownOrigin);
  } catch {
    return null;
  }
  if (url.protocol === 'tel:') return 'téléphone';
  if (url.protocol === 'mailto:') return 'email';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'wa.me' || host.endsWith('whatsapp.com')) return 'whatsapp';
  if (url.origin === ownOrigin) {
    const path = url.pathname.replace(/\/commande\/[^/]+/, '/commande/*');
    return path.slice(0, MAX_TARGET);
  }
  return host.slice(0, MAX_TARGET);
}

/** What kind of element was pressed, when it has no usable name of its own. */
export function kindLabel(tag: string, type?: string | null): string {
  const lower = tag.toLowerCase();
  if (lower === 'a') return 'lien';
  if (lower === 'input' && type === 'radio') return 'choix';
  if (lower === 'input' && type === 'checkbox') return 'case';
  if (lower === 'summary') return 'dépliant';
  if (lower === 'select') return 'liste';
  return 'bouton';
}
