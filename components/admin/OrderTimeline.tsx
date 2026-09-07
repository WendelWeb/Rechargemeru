import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { OrderEventType } from '@/lib/orders/events';
import type { Actor, OrderEventRow } from '@/lib/orders/types';

/** French label for every event the service layer writes. */
const EVENT_LABELS: Record<OrderEventType, string> = {
  created: 'Commande créée',
  redirect_issued: 'Redirection vers le fournisseur',
  provider_error: 'Erreur du fournisseur',
  callback_received: 'Retour du fournisseur reçu',
  verified_paid: 'Paiement confirmé',
  verified_unpaid: 'Non payée d’après le fournisseur',
  verification_failed: 'Vérification impossible',
  amount_mismatch: 'Montant différent du devis',
  amount_unreported: 'Montant non communiqué',
  paid_after_expiry: 'Payée après l’échéance',
  paid_after_refund: 'Payée après remboursement',
  status_changed: 'Changement de statut',
  notification_sent: 'Notification envoyée',
  notification_failed: 'Notification en échec',
  notification_skipped: 'Notification non envoyée',
  admin_note: 'Note de l’opérateur',
  meru_account_corrected: 'Identifiant Meru corrigé',
  fulfilled: 'Dollars envoyés',
  marked_failed: 'Marquée échouée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  expired: 'Expirée',
  review_flagged: 'Placée en vérification',
  reconcile_gave_up: 'Réconciliation abandonnée',
};

/** Events that mean « look at this »: they get the coral dot. */
const ALERT_EVENTS = new Set<string>([
  'provider_error',
  'verification_failed',
  'amount_mismatch',
  'amount_unreported',
  'paid_after_expiry',
  'paid_after_refund',
  'notification_failed',
  'marked_failed',
  'review_flagged',
  'reconcile_gave_up',
]);

/** Events that mean « this went well »: mint dot. */
const GOOD_EVENTS = new Set<string>(['verified_paid', 'fulfilled', 'notification_sent', 'redirect_issued']);

const ACTOR_LABELS: Record<Actor, string> = {
  system: 'système',
  customer: 'client',
  admin: 'opérateur',
  provider: 'fournisseur',
};

function labelOf(type: string): string {
  return EVENT_LABELS[type as OrderEventType] ?? type;
}

function dotClass(type: string): string {
  if (ALERT_EVENTS.has(type)) return 'bg-coral';
  if (GOOD_EVENTS.has(type)) return 'bg-mint';
  return 'bg-ink-muted';
}

export type OrderTimelineProps = { events: OrderEventRow[] };

/**
 * The complete history of an order, oldest first — the record that answers
 * « pourquoi cette commande est-elle dans cet état ? » without opening a
 * database client. Each entry keeps its raw `data` one tap away.
 */
export function OrderTimeline({ events }: OrderTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-soft">Aucun événement enregistré.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((event) => {
        const data = event.data && Object.keys(event.data).length > 0 ? event.data : null;
        return (
          <li key={event.id} className="relative">
            <span
              className={cn('absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full ring-4 ring-paper', dotClass(event.type))}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-ink">{labelOf(event.type)}</span>
              <span className="text-xs text-ink-muted tnum">{formatDateTime(event.createdAt)}</span>
              <span className="text-xs text-ink-muted">· {ACTOR_LABELS[event.actor] ?? event.actor}</span>
            </div>
            {event.message ? <p className="mt-0.5 text-sm leading-snug text-ink-soft">{event.message}</p> : null}
            {data ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-ink-muted">Détails</summary>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-mist p-2.5 text-xs leading-relaxed text-ink-soft">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
