import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Chip } from '@/components/ui/Chip';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { WhatsAppMenu } from '@/components/admin/WhatsAppMenu';
import type { WhatsAppMessage } from '@/lib/admin/whatsapp-messages';
import { formatHtg, formatUsd } from '@/lib/format';
import type { OrderRow } from '@/lib/orders/types';

export type OrderCardProps = {
  order: OrderRow;
  /** « Payée il y a 5 min » — computed by the page, which owns the clock. */
  moment: string;
  /**
   * Les messages WhatsApp proposés pour cette commande. Fournis, ils ajoutent
   * un bouton qui écrit au client sans quitter le tableau de bord. Absents ou
   * vides (commande de test), la carte reste un simple lien.
   */
  whatsappMessages?: WhatsAppMessage[];
};

/**
 * A paid order, as the operator's next job: the dollars to send in large
 * type, where they go (the Meru identifier, whole — it is what gets typed
 * into Meru), and one button that says what happens next.
 *
 * The whole card is the link. It lifts under the pointer and its button
 * darkens, so it reads as clickable before anything is clicked; a mis-tap
 * anywhere on it still opens the right order.
 */
export function OrderCard({ order, moment, whatsappMessages = [] }: OrderCardProps) {
  const review = order.status === 'needs_review';
  const hasWhatsapp = whatsappMessages.length > 0;

  return (
    <li className="relative">
      <Link
        href={`/admin/commandes/${order.id}`}
        className="group block h-full rounded-card border border-line bg-paper p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong/60 hover:shadow-hover sm:p-5"
      >
        <div className={cn('flex items-center gap-2', hasWhatsapp && 'pr-12')}>
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              review ? 'bg-coral' : 'bg-sun-deep',
              order.mode === 'live' && 'animate-beat',
            )}
          />
          <span className="font-display text-sm font-semibold tracking-wide tnum text-ink">{order.reference}</span>
          {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
        </div>
        <p className="mt-0.5 pl-4 text-xs text-ink-muted">{review ? `À vérifier · ${moment.toLowerCase()}` : moment}</p>

        <p className="mt-4 font-display text-[2rem] leading-none font-bold tracking-tight tnum text-ink">
          {formatUsd(order.usdCents, 'fr')}
        </p>
        <p className="mt-2 text-xs text-ink-soft">vers</p>
        <p className="font-display text-base leading-snug font-semibold break-all text-ink">{order.meruAccount}</p>

        <p className="mt-3 truncate text-sm font-medium text-ink">{order.customerName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
          <MethodBadge method={order.method} size="sm" className="font-medium" />
          <span aria-hidden="true">·</span>
          <span className="tnum">
            {order.paidHtg === null ? 'montant non communiqué' : `${formatHtg(order.paidHtg)} reçues`}
          </span>
        </p>

        {order.failureReason ? (
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-coral-deep">{order.failureReason}</p>
        ) : null}

        <span
          className={cn(
            'mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-colors duration-200',
            review ? 'bg-ink text-paper group-hover:bg-ink-hover' : 'bg-sun text-ink group-hover:bg-sun-deep',
          )}
        >
          {review ? 'Vérifier' : 'Recharger'}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>

      {hasWhatsapp ? (
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
          <WhatsAppMenu
            orderId={order.id}
            reference={order.reference}
            customerName={order.customerName}
            customerPhone={order.customerPhone}
            messages={whatsappMessages}
            variant="compact"
          />
        </div>
      ) : null}
    </li>
  );
}
