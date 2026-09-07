import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatDateTime, formatHtg, formatUsdShort, type FormatLocale } from '@/lib/format';
import type { GatewayMode, OrderStatus, PaymentMethod } from '@/lib/orders/types';
import { buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';

/**
 * An account's history: one card per order, newest first, each card a link to
 * the tracking page — which already knows how to tell the whole story and is
 * the only place the personal details belong.
 *
 * So this list carries nothing but reference, date, rail, amounts and status:
 * the Meru identifier and the phone number stay one click away, behind the
 * page that checks who is asking.
 */

export type MyOrderSummary = {
  reference: string;
  createdAt: Date;
  status: OrderStatus;
  method: PaymentMethod;
  mode: GatewayMode;
  usdCents: number;
  totalHtg: number;
};

export type MyOrdersListProps = {
  orders: MyOrderSummary[];
  locale: FormatLocale;
};

export function MyOrdersList({ orders, locale }: MyOrdersListProps) {
  const t = useTranslations('account');
  const c = useTranslations('common');

  if (orders.length === 0) {
    return (
      <Card tone="mist" padding="lg" className="text-center">
        <h2 className="font-display text-lg font-semibold text-ink">{t('empty.title')}</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">{t('empty.body')}</p>
        <Link href="/" className={buttonClasses('dark', 'md', 'mt-5')}>
          {t('empty.cta')}
        </Link>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.reference}>
          <Link
            href={`/commande/${order.reference}`}
            className="block rounded-card border border-line bg-paper p-4 shadow-card transition-colors hover:border-ink-muted hover:bg-mist/40 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="font-display tnum text-base font-semibold text-ink">{order.reference}</span>
              <span className="flex items-center gap-2">
                {order.mode === 'sandbox' ? <Chip tone="test">{c('test')}</Chip> : null}
                <StatusPill status={order.status} label={c(`status.${order.status}`)} size="sm" />
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <MethodBadge method={order.method} size="sm" />
                <p className="tnum text-sm text-ink-soft">{formatDateTime(order.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-display tnum text-lg font-semibold text-ink">{formatHtg(order.totalHtg)}</p>
                <p className="tnum text-sm text-ink-soft">
                  {t('list.receives', { amount: formatUsdShort(order.usdCents, locale) })}
                </p>
              </div>
            </div>

            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ink">
              {t('list.view')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
