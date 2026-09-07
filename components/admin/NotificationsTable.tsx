import type { ReactNode } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { EmptyRow, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { NotificationListItem } from '@/lib/admin/queries';
import type { NotificationChannel, NotificationStatus, NotificationTemplate } from '@/lib/orders/types';

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  created: 'Commande créée',
  paid: 'Paiement reçu',
  fulfilled: 'Dollars envoyés',
  failed: 'Échec',
  expired: 'Expirée',
  needs_review: 'À vérifier',
  refunded: 'Remboursement',
  reminder_24h: 'Rappel 24 h',
};

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

export type NotificationsTableProps = {
  rows: NotificationListItem[];
  /** Adds the order column; off on the order page, where every row is that order. */
  showOrder?: boolean;
  empty?: ReactNode;
};

/** The notification journal: who was told what, on which channel, and whether it worked. */
export function NotificationsTable({ rows, showOrder = false, empty = 'Aucune notification.' }: NotificationsTableProps) {
  const columns = showOrder ? 6 : 5;
  return (
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
                <span className="block">{TEMPLATE_LABELS[row.template] ?? row.template}</span>
                <span className="block text-xs text-ink-muted">
                  {row.audience === 'admin' ? 'opérateur' : 'client'}
                  {row.resendOf ? ' · renvoi' : ''}
                  {row.locale === 'ht' ? ' · kreyòl' : ''}
                </span>
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
                {row.error ? <span className="mt-0.5 block max-w-[18rem] truncate text-xs text-ink-muted">{row.error}</span> : null}
              </Td>
              <Td className="whitespace-nowrap text-ink-soft">{formatDateTime(row.createdAt)}</Td>
            </Tr>
          ))
        )}
      </Tbody>
    </Table>
  );
}
