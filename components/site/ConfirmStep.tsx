import { Fragment, type ReactNode } from 'react';
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

/**
 * The identifier with a break opportunity after each of its own separators.
 *
 * An email carries none: « jeanbaptiste.pierrelouis@example.com » is one
 * 36-character word, and in the 232px this Alert has on a 360px phone it can
 * only be chopped mid-syllable. Offered the « @ », the browser breaks there
 * instead — « jeanbaptiste.pierrelouis@ » / « example.com » — which is the
 * shape the reader recognises. `<wbr>` contributes no character, so the value
 * is unchanged when read aloud or copied.
 */
function withBreakPoints(value: string): ReactNode {
  const parts = value.split(/(?<=[@._-])/);
  if (parts.length === 1) return value;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
      <dt className="min-w-0 text-sm text-ink-soft">{label}</dt>
      <dd className="text-right text-sm font-medium break-anywhere text-ink">{value}</dd>
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

      {/*
        The one thing on this page that cannot be undone, laid out to be
        proofread. The identifier used to run inside the sentence with
        `break-all`, which on a 360px phone shredded it across three lines
        ending « …example.co / m, au nom de » — the customer was asked to
        check, character by character, a string the layout had broken. It now
        stands on its own line under its own label, at the size of a value
        rather than of prose, and the reasons to look at it follow.
      */}
      <Alert tone="warning" title={t('confirm.warningTitle')}>
        <p className="text-caption font-medium text-ink-soft">{meruAccountLabel}</p>
        <p className="font-display text-base font-semibold break-anywhere text-ink">
          {withBreakPoints(meruAccount)}
        </p>
        <p className="mt-2">{t('confirm.warningBody', { name: customerName })}</p>
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
