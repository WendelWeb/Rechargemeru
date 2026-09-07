import type { ReactNode } from 'react';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyRow, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { formatDateTime, formatHtg, formatUsdShort } from '@/lib/format';
import { statusLabelFr } from '@/lib/orders/transitions';
import type { OrderRow } from '@/lib/orders/types';

export type OrdersTableProps = {
  orders: OrderRow[];
  /** Shown in place of the rows when the list is empty. */
  empty?: ReactNode;
  /** Hides the « Créée » column on narrow embeds (the dashboard lists). */
  compact?: boolean;
};

/**
 * The orders list, used by the dashboard and by `/admin/commandes`.
 *
 * A sandbox order always carries the TEST chip next to its reference: it is
 * the one thing that must never be missed while scanning a list, because
 * recharging one would send real dollars for a payment that never happened.
 */
export function OrdersTable({ orders, empty = 'Aucune commande.', compact = false }: OrdersTableProps) {
  const columns = compact ? 5 : 6;
  return (
    <Table minWidthClassName={compact ? 'min-w-[36rem]' : 'min-w-[46rem]'}>
      <Thead>
        <tr>
          <Th>Référence</Th>
          <Th>Client</Th>
          <Th numeric>Montant</Th>
          <Th>Statut</Th>
          <Th>Méthode</Th>
          {compact ? null : <Th>Créée</Th>}
        </tr>
      </Thead>
      <Tbody>
        {orders.length === 0 ? (
          <EmptyRow colSpan={columns}>{empty}</EmptyRow>
        ) : (
          orders.map((order) => (
            <Tr key={order.id}>
              <Td>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/commandes/${order.id}`}
                    className="rounded font-display font-semibold tracking-wide tnum text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                  >
                    {order.reference}
                  </Link>
                  {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
                </div>
              </Td>
              <Td>
                <span className="block max-w-[14rem] truncate">{order.customerName}</span>
                <span className="block max-w-[14rem] truncate text-xs text-ink-muted">{order.meruAccount}</span>
              </Td>
              <Td numeric>
                <span className="block">{formatUsdShort(order.usdCents, 'fr')}</span>
                <span className="block text-xs text-ink-muted">{formatHtg(order.paidHtg ?? order.totalHtg)}</span>
              </Td>
              <Td>
                <StatusPill status={order.status} label={statusLabelFr(order.status)} size="sm" />
              </Td>
              <Td>
                <MethodBadge method={order.method} size="sm" />
              </Td>
              {compact ? null : <Td className="whitespace-nowrap text-ink-soft">{formatDateTime(order.createdAt)}</Td>}
            </Tr>
          ))
        )}
      </Tbody>
    </Table>
  );
}
