/**
 * lib/analytics/labels.ts — the visitor journey in the operator's words.
 *
 * The journal stores codes (`step:details`, `error:formulaire phone,email`,
 * `/ht/commande/*`); the admin reads sentences: « est passé à l'écran « Vos
 * infos » », « bloqué sur : numéro WhatsApp, email », « Page d'une commande
 * (kreyòl) ». Pure, so every sentence is tested.
 */
import { formatUsdShort } from '@/lib/format';

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });

export function countryName(code: string | null | undefined): string {
  if (!code || code === 'unknown') return 'Pays inconnu';
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** « 🇭🇹 » from « HT »: two regional-indicator letters. */
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const PAGE_NAMES: Record<string, string> = {
  '': 'Accueil',
  '/suivi': 'Suivre ma commande',
  '/faq': 'Questions fréquentes',
  '/conditions': 'Conditions',
  '/commande/*': 'Page d’une commande',
  '/mes-commandes': 'Mes commandes',
  '/connexion': 'Connexion',
  '/inscription': 'Création de compte',
};

/** A path as the operator thinks of it: « Accueil (kreyòl) », « Page d’une commande ». */
export function pageName(path: string): string {
  const match = /^\/(fr|ht)(\/.*)?$/.exec(path);
  if (!match) return path;
  const lang = match[1] === 'ht' ? 'kreyòl' : 'français';
  const rest = match[2] ?? '';
  const known = PAGE_NAMES[rest] ?? PAGE_NAMES[rest.replace(/\/commande\/[^/]+/, '/commande/*')];
  return `${known ?? rest} (${lang})`;
}

export function sourceName(host: string | null | undefined): string {
  if (!host || host === 'direct') return 'Accès direct, WhatsApp ou favori';
  const known: Record<string, string> = {
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'google.com': 'Google',
    whatsapp: 'WhatsApp',
    't.co': 'X (Twitter)',
    'tiktok.com': 'TikTok',
    'youtube.com': 'YouTube',
  };
  return known[host] ?? host;
}

export const NET_LABELS: Record<string, string> = {
  'slow-2g': '2G lente',
  '2g': '2G',
  '3g': '3G',
  '4g': '4G ou mieux',
};

const STEP_LABELS: Record<string, string> = {
  amount: 'Montant',
  details: 'Vos infos',
  confirm: 'Vérifier',
  created: 'Commande créée, départ vers le paiement',
};

const FIELD_LABELS: Record<string, string> = {
  amount: 'montant',
  customerName: 'nom',
  meruAccount: 'identifiant Meru',
  phone: 'numéro WhatsApp',
  email: 'email',
};

const SERVER_ERRORS: Record<string, string> = {
  quote_changed: 'le taux a changé pendant la saisie',
  rate_limited: 'trop d’essais d’affilée',
  network: 'pas de connexion',
  provider_unreachable: 'le portefeuille ne répondait pas',
  provider_error: 'le portefeuille a refusé',
  method_unavailable: 'ce portefeuille était indisponible',
  not_configured: 'service pas prêt',
  bad_phone: 'numéro refusé',
  bad_meru_account: 'identifiant Meru refusé',
  wallet_limit: 'montant au-dessus du plafond',
  above_maximum: 'montant au-dessus du maximum',
  below_minimum: 'montant sous le minimum',
  db_error: 'erreur de notre côté',
};

const METHOD_NAMES: Record<string, string> = { moncash: 'MonCash', natcash: 'NatCash' };

export type EventLike = { type: string; name: string; target: string | null; value: number | null };

/** What kind of line a journey event makes: the timeline gives each its mark. */
export type EventTone = 'click' | 'step' | 'error' | 'submit';

/** One event of the journey, as a sentence. */
export function describeEvent(event: EventLike): { text: string; tone: EventTone } {
  switch (event.type) {
    case 'step':
      return { text: `Passe à l’écran « ${STEP_LABELS[event.name] ?? event.name} »`, tone: 'step' };
    case 'submit': {
      const parts = [
        event.value ? formatUsdShort(event.value, 'fr') : null,
        event.target ? (METHOD_NAMES[event.target] ?? event.target) : null,
      ].filter(Boolean);
      return { text: `Confirme la commande${parts.length ? ` (${parts.join(', ')})` : ''}`, tone: 'submit' };
    }
    case 'error': {
      if (event.name === 'formulaire') {
        const fields = (event.target ?? '')
          .split(',')
          .map((field) => FIELD_LABELS[field.trim()] ?? field.trim())
          .filter(Boolean);
        return { text: `Bloqué sur : ${fields.join(', ') || 'un champ'}`, tone: 'error' };
      }
      const why = event.target ? (SERVER_ERRORS[event.target] ?? event.target) : 'erreur';
      return { text: `Commande refusée : ${why}`, tone: 'error' };
    }
    default: {
      const where =
        event.target === 'whatsapp'
          ? ' → WhatsApp'
          : event.target && event.target.startsWith('/')
            ? ` → ${pageName(event.target)}`
            : event.target
              ? ` → ${event.target}`
              : '';
      return { text: `Touche « ${event.name} »${where}`, tone: 'click' };
    }
  }
}

/** No-break space: a number never leaves its unit behind on the next line. */
const NB = '\u00a0';

/** « 45 s », « 2 min 13 s », « 1 h 05 min » — an active time. */
export function formatActive(ms: number | null | undefined): string {
  const safe = Math.max(0, Math.round((ms ?? 0) / 1000));
  if (safe < 60) return `${safe}${NB}s`;
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) {
    const seconds = safe % 60;
    return seconds === 0 ? `${minutes}${NB}min` : `${minutes}${NB}min ${String(seconds).padStart(2, '0')}${NB}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}${NB}h ${String(minutes % 60).padStart(2, '0')}${NB}min`;
}
