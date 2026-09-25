'use server';

/**
 * lib/admin/actions.ts — every write the operator can make.
 *
 * Three invariants hold for every function below:
 *
 * 1. **`await requireAdmin()` first** — signing in is Clerk's business, not
 *    this file's. `proxy.ts` already guards the routes; this is the second
 *    lock, because a Server Action is an endpoint of its own.
 * 2. **Status changes go through `transitionOrder`** — one compare-and-set
 *    `UPDATE … WHERE id = ? AND status IN (origines)`. Zero rows means the
 *    cron, a webhook or another tab already moved the order: the action says
 *    « déjà traitée » and writes NO event and NO notification. That is what
 *    makes a double tap on a phone harmless.
 * 3. **Events and notifications come after a successful CAS**, never before.
 *
 * A file marked `'use server'` may only export async functions (types are
 * erased, so the state types below are fine).
 */
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/admin';
import { formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import { appendEvent } from '@/lib/orders/events';
import { maskMeruAccount, meruAccountLabelFr, normalizeMeruAccount } from '@/lib/orders/meru-account';
import { getOrderById, transitionOrder, updateOrder } from '@/lib/orders/queries';
import { reconcile, type ReconcileTally } from '@/lib/orders/reconcile';
import { settleOrder, type SettleStatus } from '@/lib/orders/settle';
import { statusLabelFr } from '@/lib/orders/transitions';
import {
  MERU_ACCOUNT_TYPES,
  type MeruAccountType,
  type NotificationLabel,
  type NotificationTemplate,
  type OrderRow,
  type OrderStatus,
} from '@/lib/orders/types';
import { notifyOrder, recordManualWhatsApp } from '@/lib/notifications/dispatch';
import { sendEmail } from '@/lib/notifications/email';
import { sendWhatsApp } from '@/lib/notifications/whatsapp';
import { retrieveMoncashOrder, moncashConfigured, moncashLabel, moncashProviderId } from '@/lib/payments/moncash';
import { normalizePhone } from '@/lib/phone';
import { settingsInputSchema } from '@/lib/settings/schema';
import { getSettings, updateSettings } from '@/lib/settings/store';
import { siteUrl } from '@/lib/site-url';

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

/** What every form action reports back to `useActionState`. */
export type ActionState = {
  ok?: boolean;
  /** Confirmation to show in green. */
  message?: string;
  /** Refusal to show in red. */
  error?: string;
};

export type SettingsFormState = ActionState & {
  /** Zod messages keyed by field path, e.g. `feeRules.0.value`. */
  fieldErrors?: Record<string, string>;
};

export type SweepState = ActionState & { tally?: ReconcileTally };

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** Driver failures are logged in full and shown as one neutral sentence — a Postgres error can carry the connection string. */
function writeFailed(what: string, err: unknown): ActionState {
  console.error(`[admin/actions] ${what} failed: ${errorText(err)}`);
  return { error: "L'action n'a pas pu être enregistrée. Réessayez ; si cela persiste, ouvrez « Santé »." };
}

const ALREADY = "Cette commande a déjà été traitée (ou son statut ne permet plus cette action). Rechargez la page.";
const NOT_FOUND = 'Commande introuvable.';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function textOrNull(formData: FormData, name: string, max: number): string | null {
  const value = text(formData, name).slice(0, max);
  return value.length > 0 ? value : null;
}

/** « 20 », « 20.5 », « 20,00 » → cents; `null` for anything else. */
function usdToCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Whole gourdes from a typed amount; `null` for anything else. */
function toWholeHtg(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.0+)?$/.test(cleaned)) return null;
  const htg = Math.round(Number(cleaned));
  return Number.isSafeInteger(htg) ? htg : null;
}

function toNumber(raw: string): number {
  return Number(raw.replace(/[\s  ]/g, '').replace(',', '.'));
}

function toInt(raw: string): number {
  const value = toNumber(raw);
  return Number.isFinite(value) ? Math.round(value) : Number.NaN;
}

/** One recipient per line or comma, blanks dropped. */
function toList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Every admin surface that can show this order. */
function revalidateOrder(orderId: string): void {
  revalidatePath('/admin');
  revalidatePath('/admin/commandes');
  revalidatePath(`/admin/commandes/${orderId}`);
  revalidatePath('/admin/notifications');
  revalidatePath('/admin/relances');
}

/** Records the status change on the timeline after a successful compare-and-set. */
async function recordTransition(order: OrderRow, to: OrderStatus): Promise<void> {
  await appendEvent({
    orderId: order.id,
    type: 'status_changed',
    actor: 'admin',
    message: `Statut : ${statusLabelFr(order.status)} → ${statusLabelFr(to)}`,
    data: { from: order.status, to },
  });
}

/* -------------------------------------------------------------------------- */
/* Order actions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * « Marquer rechargée » — the only irreversible button in the app: it means
 * the dollars have already left the operator's Meru account. The amount
 * defaults to what the customer ordered but is editable, because what was
 * actually sent is what the books must record.
 */
export async function markFulfilledAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };

    const typed = text(formData, 'fulfilledUsd');
    const cents = typed ? usdToCents(typed) : order.usdCents;
    if (cents === null || cents <= 0) return { error: 'Montant envoyé invalide : indiquez des dollars, par exemple 20.00.' };
    const meruReference = textOrNull(formData, 'meruReference', 120);

    const updated = await transitionOrder(orderId, 'fulfilled', {
      fulfilledUsdCents: cents,
      fulfilledAt: new Date(),
      meruReference,
    });
    if (!updated) return { error: ALREADY };

    await appendEvent({
      orderId,
      type: 'fulfilled',
      actor: 'admin',
      message: `Rechargée : ${formatUsd(cents, 'fr')} envoyés sur ${updated.meruAccount}${
        meruReference ? ` (réf. Meru ${meruReference})` : ''
      }`,
      data: { fulfilledUsdCents: cents, meruReference, orderedUsdCents: order.usdCents },
    });
    await recordTransition(order, 'fulfilled');
    await notifyOrder(updated, 'fulfilled');
    revalidateOrder(orderId);
    return { ok: true, message: `Commande ${updated.reference} marquée rechargée (${formatUsd(cents, 'fr')}).` };
  } catch (err) {
    return writeFailed('markFulfilledAction', err);
  }
}

/** Closes an order the operator cannot honour; the reason is shown to the customer. */
export async function markFailedAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const reason = textOrNull(formData, 'reason', 200);
    if (!reason) return { error: 'Indiquez la raison de l’échec : elle est envoyée au client.' };
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };

    const updated = await transitionOrder(orderId, 'failed', { failureReason: reason });
    if (!updated) return { error: ALREADY };

    await appendEvent({
      orderId,
      type: 'marked_failed',
      actor: 'admin',
      message: `Marquée échouée : ${reason}`,
      data: { reason, previousStatus: order.status },
    });
    await recordTransition(order, 'failed');
    await notifyOrder(updated, 'failed');
    revalidateOrder(orderId);
    return { ok: true, message: 'Commande marquée échouée et client prévenu.' };
  } catch (err) {
    return writeFailed('markFailedAction', err);
  }
}

/** Cancels an order that was never paid. The compare-and-set refuses anything but `pending_payment`. */
export async function cancelAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };
    const reason = textOrNull(formData, 'reason', 200) ?? 'Annulée par l’opérateur';

    const updated = await transitionOrder(orderId, 'cancelled', { failureReason: reason });
    if (!updated) return { error: 'Seule une commande en attente de paiement peut être annulée.' };

    await appendEvent({ orderId, type: 'cancelled', actor: 'admin', message: `Annulée : ${reason}`, data: { reason } });
    await recordTransition(order, 'cancelled');
    revalidateOrder(orderId);
    return { ok: true, message: 'Commande annulée.' };
  } catch (err) {
    return writeFailed('cancelAction', err);
  }
}

/** Records a refund the operator made by hand on MonCash / NatCash. */
export async function markRefundedAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };

    const htg = toWholeHtg(text(formData, 'refundHtg'));
    if (htg === null || htg <= 0) return { error: 'Montant remboursé invalide : indiquez des gourdes entières.' };
    const typedWallet = textOrNull(formData, 'refundWallet', 40);
    if (!typedWallet) return { error: 'Indiquez le portefeuille remboursé.' };
    // A wallet is normally a phone number; keep what was typed when it is not one.
    const wallet = normalizePhone(typedWallet) ?? typedWallet;

    const updated = await transitionOrder(orderId, 'refunded', { refundHtg: htg, refundWallet: wallet });
    if (!updated) return { error: ALREADY };

    await appendEvent({
      orderId,
      type: 'refunded',
      actor: 'admin',
      message: `Remboursée : ${formatHtg(htg)} sur ${wallet}`,
      data: { refundHtg: htg, refundWallet: wallet, previousStatus: order.status },
    });
    await recordTransition(order, 'refunded');
    await notifyOrder(updated, 'refunded');
    revalidateOrder(orderId);
    return { ok: true, message: `Remboursement de ${formatHtg(htg)} enregistré.` };
  } catch (err) {
    return writeFailed('markRefundedAction', err);
  }
}

const SETTLE_MESSAGES: Record<SettleStatus, string> = {
  granted: 'Paiement confirmé par le fournisseur : la commande passe à « Payée ».',
  review: 'Paiement confirmé mais à vérifier (montant, délai ou correspondance) : la commande passe à « À vérifier ».',
  already: 'Le paiement était déjà enregistré : rien n’a changé.',
  unpaid: 'Le fournisseur indique que la commande n’est pas payée.',
  pending: 'Le fournisseur ne permet pas de relire ce paiement : attendez le webhook signé.',
  unknown_order: NOT_FOUND,
  not_configured: 'Le fournisseur de cette commande n’est pas configuré sur ce serveur.',
  error: 'La vérification a échoué. Réessayez dans un instant.',
};

/** Asks the provider again about this order, through the same path as the cron. */
export async function recheckAction(orderId: string): Promise<ActionState> {
  await requireAdmin();
  try {
    const result = await settleOrder(orderId, { actor: 'admin', source: 'admin' });
    revalidateOrder(orderId);
    const detail = result.message ? ` (${result.message})` : '';
    const ok = result.status === 'granted' || result.status === 'review' || result.status === 'already';
    return ok
      ? { ok: true, message: SETTLE_MESSAGES[result.status] }
      : { error: `${SETTLE_MESSAGES[result.status]}${detail}` };
  } catch (err) {
    return writeFailed('recheckAction', err);
  }
}

/** The notification that matches each status, for « Renvoyer les notifications ». */
const RESEND_TEMPLATE: Partial<Record<OrderStatus, NotificationTemplate>> = {
  pending_payment: 'created',
  paid: 'paid',
  needs_review: 'needs_review',
  fulfilled: 'fulfilled',
  failed: 'failed',
  expired: 'expired',
  refunded: 'refunded',
};

/**
 * Re-sends the message matching the current status. `force` bypasses the
 * partial unique index and links the new rows to the previous ones through
 * `resend_of`, so the journal shows a resend rather than a duplicate.
 */
export async function resendNotificationsAction(orderId: string): Promise<ActionState> {
  await requireAdmin();
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };
    const template = RESEND_TEMPLATE[order.status];
    if (!template) return { error: `Aucune notification ne correspond au statut « ${statusLabelFr(order.status)} ».` };

    const result = await notifyOrder(order, template, { force: true });
    revalidateOrder(orderId);
    if (result.attempted === 0) {
      return { error: 'Aucun destinataire pour ce message : vérifiez la matrice de notifications dans les paramètres.' };
    }
    if (result.sent === 0) {
      return { error: `Aucun message envoyé (${result.skipped} ignoré(s), ${result.failed} en échec). Voir « Santé ».` };
    }
    return { ok: true, message: `${result.sent} message(s) « ${template} » renvoyé(s).` };
  } catch (err) {
    return writeFailed('resendNotificationsAction', err);
  }
}

/** A free-text note kept on the order and stamped on the timeline. */
export async function addNoteAction(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const note = textOrNull(formData, 'note', 1000);
    if (!note) return { error: 'La note est vide.' };
    const updated = await updateOrder(orderId, { adminNote: note });
    if (!updated) return { error: NOT_FOUND };
    await appendEvent({ orderId, type: 'admin_note', actor: 'admin', message: note });
    revalidateOrder(orderId);
    return { ok: true, message: 'Note enregistrée.' };
  } catch (err) {
    return writeFailed('addNoteAction', err);
  }
}

/**
 * Fixes a mistyped Meru identifier before the dollars leave. Both values are
 * written to the timeline (masked in the message, complete in the data) so
 * the correction can be audited later.
 */
export async function correctMeruAccountAction(
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    const rawType = text(formData, 'meruAccountType');
    if (!(MERU_ACCOUNT_TYPES as readonly string[]).includes(rawType)) return { error: 'Type d’identifiant inconnu.' };
    const type = rawType as MeruAccountType;
    const normalized = normalizeMeruAccount(type, text(formData, 'meruAccount'));
    if (!normalized) {
      return { error: `${meruAccountLabelFr(type)} invalide : vérifiez la valeur copiée depuis Meru.` };
    }

    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };
    if (order.meruAccountType === type && order.meruAccount === normalized) {
      return { error: 'Cet identifiant est déjà celui de la commande.' };
    }
    if (order.status === 'fulfilled') {
      return { error: 'La commande est déjà rechargée : l’identifiant ne peut plus être corrigé.' };
    }

    const updated = await updateOrder(orderId, { meruAccountType: type, meruAccount: normalized });
    if (!updated) return { error: NOT_FOUND };

    await appendEvent({
      orderId,
      type: 'meru_account_corrected',
      actor: 'admin',
      message: `Identifiant Meru corrigé : ${maskMeruAccount(order.meruAccountType, order.meruAccount)} → ${maskMeruAccount(type, normalized)}`,
      data: {
        from: { type: order.meruAccountType, account: order.meruAccount },
        to: { type, account: normalized },
      },
    });
    revalidateOrder(orderId);
    return { ok: true, message: 'Identifiant Meru corrigé.' };
  } catch (err) {
    return writeFailed('correctMeruAccountAction', err);
  }
}

/**
 * Logs the WhatsApp message the operator just sent by hand from the `wa.me`
 * button, so the journal shows that the customer was told even when no
 * WhatsApp API is configured.
 */
export async function recordManualWhatsAppAction(orderId: string, template: NotificationLabel): Promise<ActionState> {
  await requireAdmin();
  try {
    const label = String(template).trim().slice(0, 60);
    if (!label) return { error: 'Modèle de message inconnu.' };
    const order = await getOrderById(orderId);
    if (!order) return { error: NOT_FOUND };
    const row = await recordManualWhatsApp(orderId, order.customerPhone, label, order.locale);
    revalidateOrder(orderId);
    return row
      ? { ok: true, message: 'Envoi WhatsApp manuel enregistré.' }
      : { error: 'Cet envoi manuel était déjà enregistré.' };
  } catch (err) {
    return writeFailed('recordManualWhatsAppAction', err);
  }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/** Zod issues flattened to `path → message`, the shape the form renders under each field. */
function fieldErrorsOf(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** `feeRules` travels as JSON in a hidden input: the editor is a list, not a fixed set of fields. */
function parseFeeRules(raw: string): unknown {
  if (!raw.trim()) return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Validates and stores the operator settings. Only this action touches
 * `updated_at`, which is the quote fingerprint: saving here invalidates every
 * receipt a customer is still looking at, and `createOrder` will answer 409
 * rather than charge an amount nobody saw.
 */
export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requireAdmin();

  const feeRules = parseFeeRules(text(formData, 'feeRules'));
  if (feeRules === null) return { error: 'Les règles de frais n’ont pas pu être lues. Rechargez la page et réessayez.' };

  const minUsdCents = usdToCents(text(formData, 'minUsd'));
  const maxUsdCents = usdToCents(text(formData, 'maxUsd'));
  if (minUsdCents === null || maxUsdCents === null) {
    return { error: 'Montants minimum et maximum invalides : indiquez des dollars, par exemple 5.00.' };
  }

  const candidate = {
    fxRateHtg: toNumber(text(formData, 'fxRateHtg')),
    feeRules,
    amountToleranceHtg: toInt(text(formData, 'amountToleranceHtg')),
    minUsdCents,
    maxUsdCents,
    orderTtlMinutes: toInt(text(formData, 'orderTtlMinutes')),
    adminEmails: toList(text(formData, 'adminEmails')),
    adminWhatsappNumbers: toList(text(formData, 'adminWhatsappNumbers')),
    notifyAdminEvents: formData.getAll('notifyAdminEvents').map(String),
    notifyCustomerEvents: formData.getAll('notifyCustomerEvents').map(String),
    meruAccountTypes: formData.getAll('meruAccountTypes').map(String),
    businessName: text(formData, 'businessName'),
    supportWhatsapp: text(formData, 'supportWhatsapp'),
    supportHours: text(formData, 'supportHours'),
    fulfilmentSlaFr: text(formData, 'fulfilmentSlaFr'),
    fulfilmentSlaHt: text(formData, 'fulfilmentSlaHt'),
    meruHelpFr: text(formData, 'meruHelpFr'),
    meruHelpHt: text(formData, 'meruHelpHt'),
  };

  const parsed = settingsInputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      error: 'Certains champs sont invalides : corrigez ce qui est signalé en rouge.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  try {
    await updateSettings(parsed.data);
  } catch (err) {
    console.error(`[admin/actions] saveSettingsAction failed: ${errorText(err)}`);
    return { error: errorText(err) };
  }

  revalidatePath('/admin/parametres');
  revalidatePath('/admin');
  revalidatePath('/fr');
  revalidatePath('/ht');
  return { ok: true, message: 'Paramètres enregistrés. Les devis en cours chez les clients seront recalculés.' };
}

/* -------------------------------------------------------------------------- */
/* Health checks and the manual sweep                                         */
/* -------------------------------------------------------------------------- */

/** Sends a real email to the first configured admin address. */
export async function sendTestEmailAction(): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const settings = await getSettings();
    const to = settings.adminEmails[0] ?? admin.email;
    if (!to) return { error: 'Aucune adresse admin configurée dans les paramètres.' };
    const result = await sendEmail({
      to,
      subject: `Test — ${settings.businessName}`,
      text: `Ceci est un message de test envoyé depuis ${siteUrl()}/admin/sante le ${formatDateTime(new Date())}.`,
      html: `<p>Ceci est un message de test envoyé depuis <a href="${siteUrl()}/admin/sante">${siteUrl()}/admin/sante</a> le ${formatDateTime(new Date())}.</p>`,
    });
    if (result.sent) return { ok: true, message: `Email envoyé à ${to}${result.id ? ` (id ${result.id})` : ''}.` };
    if (result.skipped) return { error: 'Email non configuré : RESEND_API_KEY et RESEND_FROM sont requis.' };
    return { error: `Échec de l’envoi : ${result.error ?? 'raison inconnue'}.` };
  } catch (err) {
    return writeFailed('sendTestEmailAction', err);
  }
}

/** Sends a real WhatsApp message to the first configured admin number. */
export async function sendTestWhatsAppAction(): Promise<ActionState> {
  await requireAdmin();
  try {
    const settings = await getSettings();
    const to = settings.adminWhatsappNumbers[0];
    if (!to) return { error: 'Aucun numéro WhatsApp admin configuré dans les paramètres.' };
    const body = `Test ${settings.businessName} — ${formatDateTime(new Date())}`;
    const result = await sendWhatsApp({
      to,
      template: 'needs_review',
      locale: 'fr',
      params: [body],
      text: body,
      audience: 'admin',
    });
    if (result.sent) return { ok: true, message: `WhatsApp envoyé à ${to}${result.id ? ` (id ${result.id})` : ''}.` };
    if (result.skipped) return { error: `Message ignoré : ${result.reason ?? 'fournisseur non configuré'}.` };
    return { error: `Échec de l’envoi : ${result.error ?? 'raison inconnue'}.` };
  } catch (err) {
    return writeFailed('sendTestWhatsAppAction', err);
  }
}

/**
 * Asks MonCash about a reference that cannot exist. A « not found » answer
 * means the credentials were accepted, which is exactly what needs testing;
 * an authentication failure names itself. No order is created, so nothing can
 * be charged by pressing this.
 */
export async function probeMoncashAction(): Promise<ActionState> {
  await requireAdmin();
  try {
    if (!moncashConfigured()) {
      return { error: `MonCash n’est pas configuré (${moncashLabel()}).` };
    }
    const probe = `SANTE-${Date.now().toString(36).toUpperCase()}`;
    const result = await retrieveMoncashOrder(probe);
    const provider = moncashProviderId() ?? 'inconnu';
    if (result.ok) {
      return { ok: true, message: `${moncashLabel()} a répondu (fournisseur « ${provider} ») : identifiants acceptés.` };
    }
    const message = result.message;
    if (/^oauth/i.test(message) || /401|403|unauthor/i.test(message)) {
      return { error: `${moncashLabel()} refuse les identifiants : ${message}` };
    }
    return {
      ok: true,
      message: `${moncashLabel()} joignable (fournisseur « ${provider} »). Réponse pour une référence inexistante : ${message}`,
    };
  } catch (err) {
    return writeFailed('probeMoncashAction', err);
  }
}

/**
 * « Tout re-vérifier » on the dashboard: one bounded reconciliation pass
 * (10 orders, 20 seconds) for the operator who cannot wait for the cron —
 * or who runs on a Vercel plan where the cron only fires once a day.
 */
export async function sweepAction(): Promise<SweepState> {
  await requireAdmin();
  try {
    const tally = await reconcile({ now: new Date(), budgetMs: 20_000, limit: 10 });
    revalidatePath('/admin');
    revalidatePath('/admin/commandes');
    const parts = [
      `${tally.checked} vérifiée(s)`,
      `${tally.granted} payée(s)`,
      `${tally.review} à vérifier`,
      `${tally.unpaid} non payée(s)`,
    ];
    if (tally.remaining > 0) parts.push(`${tally.remaining} restante(s)`);
    return { ok: true, message: parts.join(' · '), tally };
  } catch (err) {
    return { ...writeFailed('sweepAction', err), tally: undefined };
  }
}
