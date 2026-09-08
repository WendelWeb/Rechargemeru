import { ChevronDown } from 'lucide-react';
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

/** How many of the most recent events stay unfolded. */
const RECENT_COUNT = 5;

function labelOf(type: string): string {
  return EVENT_LABELS[type as OrderEventType] ?? type;
}

function dotClass(type: string): string {
  if (ALERT_EVENTS.has(type)) return 'bg-coral';
  if (GOOD_EVENTS.has(type)) return 'bg-mint';
  return 'bg-ink-muted';
}

function Event({ event }: { event: OrderEventRow }) {
  const data = event.data && Object.keys(event.data).length > 0 ? event.data : null;
  return (
    <li className="relative">
      {/* Centred on the rail: the list has 1.25rem of padding and the dot is
          0.625rem wide, so its own left edge sits at −(1.25 + 0.3125)rem. */}
      <span
        className={cn(
          'absolute top-1.5 -left-6.25 size-2.5 rounded-full ring-4 ring-paper',
          dotClass(event.type),
        )}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-ink">{labelOf(event.type)}</span>
        <span className="text-xs text-ink-muted tnum">{formatDateTime(event.createdAt)}</span>
        <span className="text-xs text-ink-muted">· {ACTOR_LABELS[event.actor] ?? event.actor}</span>
      </div>
      {event.message ? <p className="mt-0.5 text-sm leading-snug break-words text-ink-soft">{event.message}</p> : null}
      {data ? (
        <details className="mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 py-1 text-xs text-ink-soft [&::-webkit-details-marker]:hidden">
            Détails
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-mist p-2.5 text-xs leading-relaxed text-ink-soft">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      ) : null}
    </li>
  );
}

export type OrderTimelineProps = { events: OrderEventRow[] };

/**
 * The complete history of an order, oldest first — the record that answers
 * « pourquoi cette commande est-elle dans cet état ? » without opening a
 * database client. Each entry keeps its raw `data` one tap away.
 *
 * Only the five most recent stay unfolded. An order verified a few times
 * gathers twenty to forty events, and unfolded they were several thousand
 * pixels of thumb-scrolling between the actions above and the notifications
 * below — on the page where the operator is trying to move money. The order
 * stays chronological: what happened last is the last line, right under the
 * thumb, and everything before it is one tap away.
 */
export function OrderTimeline({ events }: OrderTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-soft">Aucun événement enregistré.</p>;
  }

  const foldCount = Math.max(0, events.length - RECENT_COUNT);
  const older = events.slice(0, foldCount);
  const recent = events.slice(foldCount);

  return (
    <div className="space-y-3">
      {older.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink underline decoration-line underline-offset-4 [&::-webkit-details-marker]:hidden hover:decoration-ink">
            Voir les {older.length} événement{older.length > 1 ? 's' : ''} précédent{older.length > 1 ? 's' : ''}
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="relative mt-3 space-y-4 border-l border-line pl-5">
            {older.map((event) => (
              <Event key={event.id} event={event} />
            ))}
          </ol>
        </details>
      ) : null}

      <ol className="relative space-y-4 border-l border-line pl-5">
        {recent.map((event) => (
          <Event key={event.id} event={event} />
        ))}
      </ol>
    </div>
  );
}
