/**
 * lib/admin/health.ts — « est-ce que tout marche ? » in one list.
 *
 * Everything is read from the environment at call time and nothing here ever
 * returns a secret: only whether it is present, which provider it selects and
 * what that implies. Three states:
 *
 * - `ok`   — configured and safe for real money;
 * - `warn` — configured but not what production needs (a sandbox rail, a
 *            Twilio sandbox that cannot text customers, an unset
 *            `MONCASH_PROVIDER` in production);
 * - `off`  — not configured at all.
 *
 * Email is deliberately `off` in red rather than grey: the admin `paid` /
 * `needs_review` alerts are what makes the operator send the dollars, and
 * WhatsApp alone is too fragile to carry them (spec §2).
 */
import { dbConfigured, envTrim, isProduction, isVercelProduction } from '@/lib/env';
import { adminConfigProblems, adminEmails } from '@/lib/auth/admin';
import { emailConfigured, emailSender } from '@/lib/notifications/email';
import { metaConfigured, metaLabel, metaTemplateLanguage } from '@/lib/notifications/whatsapp/meta';
import { twilioConfigured, twilioLabel, twilioSandbox } from '@/lib/notifications/whatsapp/twilio';
import { activeWhatsAppProvider, whatsappConfigured } from '@/lib/notifications/whatsapp';
import { moncashConfigured, moncashLabel, moncashMode, moncashProviderId } from '@/lib/payments/moncash';
import { natcashConfigured, natcashLabel, natcashMode } from '@/lib/payments/natcash';
import { siteUrl } from '@/lib/site-url';

export type HealthState = 'ok' | 'warn' | 'off';

export type IntegrationStatus = {
  /** Stable key, used as the React key and by the test buttons. */
  id: 'database' | 'admin' | 'site' | 'moncash' | 'natcash' | 'email' | 'whatsapp' | 'cron';
  label: string;
  state: HealthState;
  /** One line describing what is configured right now. */
  detail: string;
  /** What to do about it, when something should change. */
  hint?: string;
};

/** An admin channel silent for longer than this is worth a warning on the health page. */
export const ADMIN_NOTIFICATION_STALE_MS = 48 * 3_600_000;

export type NotificationFreshness = 'ok' | 'stale' | 'never';

/** How healthy the last successful admin notification on a channel looks. */
export function notificationFreshness(at: Date | null, now: Date = new Date()): NotificationFreshness {
  if (!at || Number.isNaN(at.getTime())) return 'never';
  return now.getTime() - at.getTime() > ADMIN_NOTIFICATION_STALE_MS ? 'stale' : 'ok';
}

function databaseStatus(): IntegrationStatus {
  return dbConfigured()
    ? { id: 'database', label: 'Base de données', state: 'ok', detail: 'DATABASE_URL est définie (Neon).' }
    : {
        id: 'database',
        label: 'Base de données',
        state: 'off',
        detail: 'DATABASE_URL absente : aucune commande ne peut être créée ni retrouvée.',
        hint: 'Ajoutez DATABASE_URL puis lancez « npm run db:migrate ».',
      };
}

/**
 * Admin access is Clerk plus a list: both keys present, and at least one
 * address in `ADMIN_EMAILS`. Only the COUNT is shown — the page names no
 * address, so a screenshot of `/admin/sante` gives away nothing about who can
 * sign in. Anyone whose address leaves that list loses access at the next
 * request; there is no session to revoke and no hash to regenerate.
 */
function adminStatus(): IntegrationStatus {
  const problems = adminConfigProblems();
  const count = adminEmails().length;
  const plural = count > 1 ? 's' : '';
  return problems.length === 0
    ? {
        id: 'admin',
        label: 'Accès administrateur',
        state: 'ok',
        detail: `Connexion Clerk configurée ; ${count} adresse${plural} autorisée${plural} dans ADMIN_EMAILS.`,
      }
    : {
        id: 'admin',
        label: 'Accès administrateur',
        state: 'warn',
        detail: problems.join(' '),
        hint: 'Les deux clés Clerk viennent du tableau de bord Clerk ; ADMIN_EMAILS liste les adresses autorisées, séparées par des virgules.',
      };
}

function siteStatus(): IntegrationStatus {
  const configured = envTrim('NEXT_PUBLIC_SITE_URL');
  const url = siteUrl();
  if (configured) {
    return { id: 'site', label: 'Adresse publique', state: 'ok', detail: `Les liens des notifications pointent vers ${url}.` };
  }
  return {
    id: 'site',
    label: 'Adresse publique',
    state: isVercelProduction() ? 'warn' : 'ok',
    detail: `NEXT_PUBLIC_SITE_URL absente : les liens des notifications utilisent ${url}.`,
    hint: isVercelProduction() ? 'Définissez NEXT_PUBLIC_SITE_URL sur le domaine définitif.' : undefined,
  };
}

function moncashStatus(): IntegrationStatus {
  if (!moncashConfigured()) {
    const production = isProduction() || isVercelProduction();
    const requested = envTrim('MONCASH_PROVIDER');
    return {
      id: 'moncash',
      label: 'MonCash',
      state: 'off',
      detail:
        production && !requested
          ? 'MONCASH_PROVIDER n’est pas défini : en production le rail est fermé tant que le fournisseur n’est pas nommé explicitement.'
          : `Aucun fournisseur MonCash configuré (${moncashLabel()}).`,
      hint: 'Renseignez MONCASH_PROVIDER (direct ou bazik) et les identifiants du fournisseur choisi.',
    };
  }
  const mode = moncashMode();
  const provider = moncashProviderId();
  const detail = `${moncashLabel()} — fournisseur « ${provider ?? 'inconnu'} », mode ${mode === 'sandbox' ? 'bac à sable' : 'réel'}.`;
  if (mode === 'sandbox') {
    return {
      id: 'moncash',
      label: 'MonCash',
      state: 'warn',
      detail,
      hint:
        isVercelProduction()
          ? 'En production, ce rail n’est proposé qu’au navigateur qui porte une session admin, et ses commandes portent la pastille TEST.'
          : 'Les paiements de ce rail sont fictifs : les commandes portent la pastille TEST et ne doivent jamais être rechargées.',
    };
  }
  return { id: 'moncash', label: 'MonCash', state: 'ok', detail };
}

function natcashStatus(): IntegrationStatus {
  if (!natcashConfigured()) {
    return {
      id: 'natcash',
      label: 'NatCash',
      state: 'off',
      detail: `Aucun fournisseur NatCash configuré (${natcashLabel()}).`,
      hint: 'Renseignez KOBARA_SECRET_KEY, et KOBARA_WEBHOOK_SECRET pour recevoir les webhooks signés.',
    };
  }
  const mode = natcashMode();
  const webhook = envTrim('KOBARA_WEBHOOK_SECRET');
  const detail = `${natcashLabel()} — mode ${mode === 'sandbox' ? 'bac à sable' : 'réel'}.`;
  if (!webhook) {
    return {
      id: 'natcash',
      label: 'NatCash',
      state: 'warn',
      detail: `${detail} KOBARA_WEBHOOK_SECRET absent : le webhook signé est refusé (503).`,
      hint: 'Sans webhook signé, un paiement NatCash ne peut atteindre que « À vérifier ».',
    };
  }
  if (mode === 'sandbox') {
    return {
      id: 'natcash',
      label: 'NatCash',
      state: 'warn',
      detail,
      hint: 'Les paiements de ce rail sont fictifs : les commandes portent la pastille TEST et ne doivent jamais être rechargées.',
    };
  }
  return { id: 'natcash', label: 'NatCash', state: 'ok', detail };
}

function emailStatus(): IntegrationStatus {
  if (!emailConfigured()) {
    return {
      id: 'email',
      label: 'Email (Resend)',
      state: 'off',
      detail: 'RESEND_API_KEY ou RESEND_FROM manquant — obligatoire pour les alertes admin « payée » et « à vérifier ».',
      hint: 'Sans email, la seule alerte restante est WhatsApp, trop fragile pour décider d’envoyer des dollars.',
    };
  }
  return { id: 'email', label: 'Email (Resend)', state: 'ok', detail: `Expéditeur ${emailSender() ?? 'configuré'}.` };
}

function whatsappStatus(): IntegrationStatus {
  const provider = activeWhatsAppProvider();
  if (!whatsappConfigured() || !provider) {
    return {
      id: 'whatsapp',
      label: 'WhatsApp',
      state: 'off',
      detail: 'Aucun fournisseur WhatsApp configuré : seul le bouton « Envoyer sur WhatsApp » de la fiche commande reste disponible.',
      hint: 'Configurez Meta Cloud API (WHATSAPP_META_TOKEN + WHATSAPP_META_PHONE_NUMBER_ID) ou Twilio.',
    };
  }
  if (provider === 'twilio') {
    const sandbox = twilioSandbox();
    return {
      id: 'whatsapp',
      label: 'WhatsApp',
      state: sandbox ? 'warn' : 'ok',
      detail: sandbox
        ? `${twilioLabel()} — bac à sable : seuls les numéros ayant fait « join » reçoivent les messages, et les messages CLIENT sont volontairement ignorés.`
        : twilioLabel(),
      hint: sandbox
        ? 'Le bac à sable Twilio ne sert qu’aux alertes admin ; il faut refaire « join » toutes les 72 heures.'
        : undefined,
    };
  }
  const templates = envTrim('WHATSAPP_META_TEMPLATES');
  return {
    id: 'whatsapp',
    label: 'WhatsApp',
    state: templates ? 'ok' : 'warn',
    detail: `${metaLabel()} — langue des modèles « ${metaTemplateLanguage()} ».${
      templates ? '' : ' Aucun modèle approuvé n’est déclaré : les messages partent en texte libre.'
    }`,
    hint: templates
      ? undefined
      : 'Hors de la fenêtre de 24 h, WhatsApp refuse le texte libre : déclarez WHATSAPP_META_TEMPLATES (voir docs/whatsapp-templates.md).',
  };
}

function cronStatus(): IntegrationStatus {
  return envTrim('CRON_SECRET')
    ? {
        id: 'cron',
        label: 'Tâche planifiée',
        state: 'ok',
        detail: 'CRON_SECRET défini : /api/cron/tick réconcilie, expire et relance les alertes.',
      }
    : {
        id: 'cron',
        label: 'Tâche planifiée',
        state: 'off',
        detail: 'CRON_SECRET absent : /api/cron/tick répond 503 et rien n’est réconcilié automatiquement.',
        hint: 'Utilisez « Re-vérifier les commandes en attente » sur le tableau de bord en attendant.',
      };
}

/** Every integration, in the order the health page shows them. */
export function integrationStatuses(): IntegrationStatus[] {
  return [
    databaseStatus(),
    adminStatus(),
    moncashStatus(),
    natcashStatus(),
    emailStatus(),
    whatsappStatus(),
    cronStatus(),
    siteStatus(),
  ];
}

/** True when at least one integration is `off` — the page then leads with a red banner. */
export function hasBlockingProblem(statuses: IntegrationStatus[]): boolean {
  return statuses.some((s) => s.state === 'off' && (s.id === 'database' || s.id === 'email' || s.id === 'admin'));
}

/** Whether the WhatsApp test button can send anything at all. */
export function whatsappTestable(): boolean {
  return whatsappConfigured() && (metaConfigured() || twilioConfigured());
}
