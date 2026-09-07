import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { formatUsd, type FormatLocale } from '@/lib/format';
import type { PaymentMethod } from '@/lib/orders/types';
import type { Quote } from '@/lib/pricing/quote';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import { QuoteReceipt } from './QuoteReceipt';

/**
 * The last screen before money moves. It repeats the Meru identifier in full
 * — a transfer to the wrong account cannot be recalled — next to the frozen
 * receipt, and offers exactly two ways out: correct, or confirm.
 *
 * Rendered only from RechargeWidget (a client component), so its callbacks
 * are plain functions.
 */
export type ConfirmStepProps = {
  locale: FormatLocale;
  quote: Quote;
  method: PaymentMethod;
  customerName: string;
  meruAccount: string;
  meruAccountLabel: string;
  /** Already formatted, e.g. « +509 3700 1234 ». */
  phone: string;
  email: string | null;
  sandbox: boolean;
  submitting: boolean;
  /** The quote came back different from the server: show the new receipt first. */
  changed: boolean;
  /** Server error or « le taux a changé » notice. */
  notice?: ReactNode;
  onEdit: () => void;
  onSubmit: () => void;
};

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-right text-sm font-medium break-words text-ink">{value}</dd>
    </div>
  );
}

export function ConfirmStep({
  locale,
  quote,
  method,
  customerName,
  meruAccount,
  meruAccountLabel,
  phone,
  email,
  sandbox,
  submitting,
  changed,
  notice,
  onEdit,
  onSubmit,
}: ConfirmStepProps) {
  const t = useTranslations('home');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h2">{t('confirm.title')}</CardTitle>
        {sandbox ? <Chip tone="test">{t('created.sandbox')}</Chip> : null}
      </div>

      <Alert tone="warning" title={meruAccountLabel}>
        {t.rich('confirm.warning', {
          account: meruAccount,
          name: customerName,
          strong: (chunks) => <strong className="font-semibold break-all">{chunks}</strong>,
        })}
      </Alert>

      {changed ? (
        <Alert tone="info" title={t('confirm.changed.title')}>
          {t('confirm.changed.body')}
        </Alert>
      ) : null}

      <QuoteReceipt quote={quote} locale={locale} method={method} frozen />

      <dl className="divide-y divide-line">
        <SummaryRow label={t('confirm.amount')} value={formatUsd(quote.usdCents, locale)} />
        <SummaryRow label={t('confirm.method')} value={METHOD_LABELS[method]} />
        <SummaryRow label={t('confirm.whatsapp')} value={<span className="tnum">{phone}</span>} />
        {email ? <SummaryRow label={t('confirm.email')} value={email} /> : null}
      </dl>

      {notice}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          variant="dark"
          size="lg"
          className="w-full sm:flex-1"
          onClick={onSubmit}
          loading={submitting}
          loadingLabel={t('confirm.submitting')}
        >
          {changed ? t('confirm.changed.submit') : t('confirm.submit')}
        </Button>
        <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={onEdit} disabled={submitting}>
          {t('confirm.edit')}
        </Button>
      </div>
    </div>
  );
}
