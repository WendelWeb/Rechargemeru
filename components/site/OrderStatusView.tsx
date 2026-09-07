import type { ReactNode } from 'react';
import {
  Ban,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clock,
  Hourglass,
  MessageCircle,
  Search,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatDateTime, formatHtg, formatUsdShort, type FormatLocale } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import type { FullOrder, PublicOrder } from '@/lib/orders/public';
import type { Quote } from '@/lib/pricing/quote';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CopyButton } from '@/components/ui/CopyButton';
import { METHOD_LABELS, MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckingPoller } from './CheckingPoller';
import { QuoteReceipt } from './QuoteReceipt';
import { RecheckButton } from './RecheckButton';
import { TrustLine } from './TrustLine';
import { whatsappLink } from './SiteHeader';

/**
 * The tracking page: one panel that says where the money is and what to do
 * next, then the frozen receipt, then who the dollars are going to.
 *
 * Two rules shape it. While the order is `checking` — the customer just came
 * back from the provider, or the redirect is fresh and no unpaid answer has
 * come in — the page never offers to pay again, whatever the stored status
 * says. And the personal details are masked unless this browser is the one
 * that created the order (`FullOrder`), so a reference alone reveals nothing.
 */
export type OrderStatusViewProps = {
  order: PublicOrder | FullOrder;
  locale: FormatLocale;
  businessName: string;
  supportWhatsapp: string | null;
  supportHours: string;
  /** Announced fulfilment delay, in the reader's language. */
  sla: string;
  /** `?cancelled=1`: the customer came back from the provider without paying. */
  cancelled: boolean;
  /** Request time, passed in so this component stays pure. */
  now: Date;
};

function isFull(order: PublicOrder | FullOrder): order is FullOrder {
  return 'customerName' in order;
}

/** Wallet numbers are stored in E.164 but may be free text on old rows. */
function walletLabel(wallet: string): string {
  return wallet.startsWith('+') ? formatPhone(wallet) : wallet;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-sm font-medium break-words text-ink">{value}</dd>
    </div>
  );
}

const PANEL_ACCENT = {
  waiting: 'border-l-line',
  attention: 'border-l-coral',
  action: 'border-l-sun',
  good: 'border-l-mint',
  neutral: 'border-l-ink',
} as const;

type PanelAccent = keyof typeof PANEL_ACCENT;

export function OrderStatusView({
  order,
  locale,
  businessName,
  supportWhatsapp,
  supportHours,
  sla,
  cancelled,
  now,
}: OrderStatusViewProps) {
  const t = useTranslations('order');
  const c = useTranslations('common');

  const fullOrder = isFull(order) ? order : null;
  const methodLabel = METHOD_LABELS[order.method];
  const support = whatsappLink(supportWhatsapp, t('supportMessage', { reference: order.reference }));

  const quote: Quote = {
    usdCents: order.usdCents,
    fxRateHtg: order.fxRateHtg,
    baseHtg: order.baseHtg,
    lines: order.feeLines,
    totalHtg: order.totalHtg,
    effectiveRateHtg: order.effectiveRateHtg,
    settingsUpdatedAt: null,
  };

  const payUrl =
    !order.checking &&
    fullOrder?.redirectUrl &&
    order.redirectExpiresAt !== null &&
    order.redirectExpiresAt.getTime() > now.getTime()
      ? fullOrder.redirectUrl
      : null;

  const restart = (
    <Link href="/" className={buttonClasses('dark', 'md')}>
      {t('restart')}
    </Link>
  );

  let accent: PanelAccent = 'waiting';
  let Icon = Clock;
  let title = '';
  let body = '';
  let note: string | null = null;
  let extra: ReactNode = null;
  let actions: ReactNode = null;

  if (order.checking) {
    accent = 'action';
    Icon = Search;
    title = t('states.checking.title');
    body = t('states.checking.body', { method: methodLabel });
    note = t('states.checking.note');
    extra = <CheckingPoller reference={order.reference} methodLabel={methodLabel} />;
  } else if (order.status === 'pending_payment' && payUrl) {
    accent = 'action';
    Icon = Clock;
    title = t('states.pending.title');
    body = t('states.pending.body', { method: methodLabel });
    note = order.redirectExpiresAt
      ? t('states.pending.expiresAt', { time: formatDateTime(order.redirectExpiresAt) })
      : null;
    actions = (
      <a href={payUrl} rel="noopener" className={buttonClasses('dark', 'lg')}>
        {t('states.pending.cta', { total: formatHtg(order.totalHtg), method: methodLabel })}
      </a>
    );
    extra = <RecheckButton reference={order.reference} methodLabel={methodLabel} />;
  } else if (order.status === 'pending_payment') {
    accent = 'waiting';
    Icon = Hourglass;
    title = t('states.pending.expiredTitle');
    body = t('states.pending.expiredBody');
    actions = restart;
    extra = <RecheckButton reference={order.reference} methodLabel={methodLabel} />;
  } else if (order.status === 'paid') {
    accent = 'action';
    Icon = CircleCheck;
    title = t('states.paid.title');
    body = t('states.paid.body', { sla, hours: supportHours });
    note = t('states.paid.note');
  } else if (order.status === 'needs_review') {
    accent = 'attention';
    Icon = TriangleAlert;
    title = t('states.needs_review.title');
    body = t('states.needs_review.body');
    note = t('states.needs_review.note');
  } else if (order.status === 'fulfilled') {
    accent = 'good';
    Icon = BadgeCheck;
    title = t('states.fulfilled.title');
    body = t('states.fulfilled.body', {
      usd: formatUsdShort(fullOrder?.fulfilledUsdCents ?? order.usdCents, locale),
    });
    note = t('states.fulfilled.note');
    extra = fullOrder?.meruReference ? (
      <p className="text-sm text-ink-soft">
        {t('states.fulfilled.meruReference', { reference: fullOrder.meruReference })}
      </p>
    ) : null;
  } else if (order.status === 'failed') {
    accent = 'waiting';
    Icon = CircleX;
    title = t('states.failed.title');
    body = t('states.failed.body');
    note = order.failureReason ? t('states.failed.reason', { reason: order.failureReason }) : null;
    actions = restart;
  } else if (order.status === 'expired') {
    accent = 'waiting';
    Icon = Hourglass;
    title = t('states.expired.title');
    body = t('states.expired.body');
    note = t('states.expired.note');
    actions = restart;
  } else if (order.status === 'cancelled') {
    accent = 'waiting';
    Icon = Ban;
    title = t('states.cancelled.title');
    body = t('states.cancelled.body');
    actions = restart;
  } else {
    accent = 'neutral';
    Icon = Undo2;
    title = t('states.refunded.title');
    body =
      fullOrder?.refundHtg !== null && fullOrder?.refundHtg !== undefined && fullOrder.refundWallet
        ? t('states.refunded.body', {
            htg: formatHtg(fullOrder.refundHtg),
            wallet: walletLabel(fullOrder.refundWallet),
          })
        : t('states.refunded.bodyPlain');
    actions = restart;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} label={c(`status.${order.status}`)} />
          <MethodBadge method={order.method} size="sm" />
          {order.mode === 'sandbox' ? <Chip tone="test">{c('test')}</Chip> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            <span className="tnum">{t('heading', { reference: order.reference })}</span>
          </h1>
          <CopyButton value={order.reference} label={c('copy')} copiedLabel={c('copied')} />
        </div>
      </header>

      {cancelled ? <Alert tone="info">{t('alerts.cancelled')}</Alert> : null}
      {order.mode === 'sandbox' ? <Alert tone="warning">{t('alerts.sandbox')}</Alert> : null}

      <Card padding="lg" className={cn('border-l-4', PANEL_ACCENT[accent])}>
        <div className="flex items-start gap-3.5">
          <Icon className="mt-0.5 size-6 shrink-0 text-ink" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-3">
            <CardTitle as="h2" className="text-xl">
              {title}
            </CardTitle>
            <p className="text-[15px] leading-relaxed text-ink-soft">{body}</p>
            {note ? <p className="text-sm leading-relaxed text-ink-soft">{note}</p> : null}
            {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
            {extra}
          </div>
        </div>
      </Card>

      <section aria-label={t('receiptTitle')}>
        <h2 className="sr-only">{t('receiptTitle')}</h2>
        <QuoteReceipt quote={quote} locale={locale} method={order.method} tone="paper" frozen />
      </section>

      <Card>
        <CardTitle>{t('details.title')}</CardTitle>
        <dl className="mt-2 divide-y divide-line">
          <DetailRow label={t('details.name')} value={fullOrder ? fullOrder.customerName : order.firstName} />
          <DetailRow
            label={t('details.phone')}
            value={
              <span className="tnum">{fullOrder ? formatPhone(fullOrder.customerPhone) : order.maskedPhone}</span>
            }
          />
          <DetailRow
            label={t('details.meru')}
            value={<span className="break-all">{fullOrder ? fullOrder.meruAccount : order.maskedMeruAccount}</span>}
          />
          {fullOrder ? (
            <DetailRow label={t('details.email')} value={fullOrder.customerEmail ?? t('details.none')} />
          ) : null}
        </dl>
        {fullOrder ? null : (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <p className="text-sm leading-relaxed text-ink-soft">{t('details.masked')}</p>
            <Link href="/suivi" className={buttonClasses('ghost', 'sm')}>
              <Search className="size-4" aria-hidden="true" />
              {t('details.maskedCta')}
            </Link>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>{t('timeline.title')}</CardTitle>
        <dl className="mt-2 divide-y divide-line">
          <DetailRow label={t('timeline.created')} value={formatDateTime(order.createdAt)} />
          {order.status === 'pending_payment' ? (
            <DetailRow label={t('timeline.expires')} value={formatDateTime(order.expiresAt)} />
          ) : null}
          {order.paidAt ? <DetailRow label={t('timeline.paid')} value={formatDateTime(order.paidAt)} /> : null}
          {order.fulfilledAt ? (
            <DetailRow label={t('timeline.fulfilled')} value={formatDateTime(order.fulfilledAt)} />
          ) : null}
          {order.providerTransactionId ? (
            <DetailRow
              label={t('transaction')}
              value={<span className="tnum break-all">{order.providerTransactionId}</span>}
            />
          ) : null}
        </dl>
      </Card>

      <Card tone="mist">
        <div className="space-y-3">
          <TrustLine kind="verified" />
          <TrustLine kind="tracking" />
          <TrustLine kind="support" />
        </div>
        {support ? (
          <a
            href={support}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('ghost', 'md', 'mt-4 w-full sm:w-auto')}
          >
            <MessageCircle className="size-4 text-mint" aria-hidden="true" />
            {t('support')}
          </a>
        ) : null}
      </Card>

      <p className="text-sm leading-relaxed text-ink-muted">
        {c('footer.notAffiliated', { business: businessName })}
      </p>
    </div>
  );
}
