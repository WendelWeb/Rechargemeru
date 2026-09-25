import type { ReactNode } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { EmptyRow, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { NotificationListItem } from '@/lib/admin/queries';
import { manualMessageLabel } from '@/lib/whatsapp/catalogue';
import type { NotificationChannel, NotificationStatus, NotificationTemplate } from '@/lib/orders/types';

/** Les huit étapes envoyées automatiquement. */
const AUTOMATIC_LABELS: Record<NotificationTemplate, string> = {
  created: 'Commande créée',
  paid: 'Paiement reçu',
  fulfilled: 'Dollars envoyés',
  failed: 'Échec',
  expired: 'Expirée',
  needs_review: 'À vérifier',
  refunded: 'Remboursement',
  reminder_24h: 'Rappel 24 h',
};

/**
 * What a line of the journal says. The eight automatic steps have their own
 * names; a manual WhatsApp send is named by the catalogue it came from
 * (« Rappel de paiement (Fun) »). A label nobody knows is shown as it is:
 * knowing what was really said to a customer beats filing it under the
 * nearest box.
 */
function templateLabel(template: string): string {
  return AUTOMATIC_LABELS[template as NotificationTemplate] ?? manualMessageLabel(template) ?? template;
}

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  whatsapp_manual: 'WhatsApp manuel',
};

const STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: 'En cours',
  sent: 'Envoyée',
  failed: 'Échec',
  skipped: 'Ignorée',
};

const STATUS_STYLES: Record<NotificationStatus, string> = {
  pending: 'bg-mist text-ink-soft',
  sent: 'bg-mint-soft text-mint-deep',
  failed: 'bg-coral-soft text-coral-deep',
  skipped: 'bg-mist text-ink-muted',
};

/** Who the message was for, and what makes this line different from the one above it. */
function subtitleOf(row: NotificationListItem): string {
  return [
    row.audience === 'admin' ? 'opérateur' : 'client',
    row.resendOf ? 'renvoi' : null,
    row.locale === 'ht' ? 'kreyòl' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export type NotificationsTableProps = {
  rows: NotificationListItem[];
  /** Adds the order column; off on the order page, where every row is that order. */
  showOrder?: boolean;
  empty?: ReactNode;
};

/**
 * One notification as a card, for the phone.
 *
 * The status sits alone at the top right because the question this page
 * answers is « mon alerte est-elle partie ? » — and in the table that answer
 * is the fifth column, off screen at 360 px. The recipient may break
 * anywhere: an email address is a single unbreakable word, and it is what
 * pushes the whole page sideways otherwise.
 */
function NotificationCard({ row, showOrder }: { row: NotificationListItem; showOrder: boolean }) {
  const linked = showOrder && row.orderId && row.reference;
  return (
    <li className="rounded-card border border-line bg-paper p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug font-semibold text-ink">
            {templateLabel(row.template)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{subtitleOf(row)}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
            STATUS_STYLES[row.status] ?? 'bg-mist text-ink-soft',
          )}
        >
          {STATUS_LABELS[row.status] ?? row.status}
        </span>
      </div>

      <p className="mt-2 text-sm leading-snug text-ink-soft">
        <span className="font-medium text-ink">{CHANNEL_LABELS[row.channel] ?? row.channel}</span>
        <span aria-hidden="true"> · </span>
        <span className="break-all">{row.recipient}</span>
      </p>

      {row.error ? <p className="mt-1 text-sm leading-snug break-words text-coral-deep">{row.error}</p> : null}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-muted">
        <span className="tnum">{formatDateTime(row.createdAt)}</span>
        {linked ? (
          <span className="inline-flex shrink-0 items-center gap-2">
            <Link
              href={`/admin/commandes/${row.orderId}`}
              className="inline-flex min-h-9 items-center rounded font-display tracking-wide tnum text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            >
              {row.reference}
            </Link>
            {row.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The notification journal: who was told what, on which channel, and whether
 * it worked. Cards below `sm`, the table from `sm` up — only one of the two is
 * ever in the accessibility tree, the other is `display: none`.
 */
export function NotificationsTable({ rows, showOrder = false, empty = 'Aucune notification.' }: NotificationsTableProps) {
  const columns = showOrder ? 6 : 5;
  return (
    <>
      <div className="sm:hidden">
        {rows.length === 0 ? (
          <p className="rounded-card border border-line bg-paper px-5 py-8 text-center text-ink-soft shadow-card">
            {empty}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <NotificationCard key={row.id} row={row} showOrder={showOrder} />
            ))}
          </ul>
        )}
      </div>

      <div className="hidden sm:block">
        <Table minWidthClassName={showOrder ? 'min-w-[48rem]' : 'min-w-[40rem]'}>
          <Thead>
            <tr>
              {showOrder ? <Th>Commande</Th> : null}
              <Th>Message</Th>
              <Th>Canal</Th>
              <Th>Destinataire</Th>
              <Th>Statut</Th>
              <Th>Date</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={columns}>{empty}</EmptyRow>
            ) : (
              rows.map((row) => (
                <Tr key={row.id}>
                  {showOrder ? (
                    <Td>
                      {row.orderId && row.reference ? (
                        <span className="flex items-center gap-2">
                          <Link
                            href={`/admin/commandes/${row.orderId}`}
                            className="rounded font-display tracking-wide tnum text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                          >
                            {row.reference}
                          </Link>
                          {row.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </Td>
                  ) : null}
                  <Td>
                    <span className="block">{templateLabel(row.template)}</span>
                    <span className="block text-xs text-ink-muted">{subtitleOf(row)}</span>
                  </Td>
                  <Td>{CHANNEL_LABELS[row.channel] ?? row.channel}</Td>
                  <Td>
                    <span className="block max-w-[16rem] truncate">{row.recipient}</span>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold',
                        STATUS_STYLES[row.status] ?? 'bg-mist text-ink-soft',
                      )}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    {row.error ? (
                      <span className="mt-0.5 block max-w-[18rem] truncate text-xs text-ink-muted">{row.error}</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-soft">{formatDateTime(row.createdAt)}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </div>
    </>
  );
}
