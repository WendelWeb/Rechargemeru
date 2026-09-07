import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatHtg, formatRate, formatUsd, formatUsdShort, type FormatLocale } from '@/lib/format';
import type { PaymentMethod } from '@/lib/orders/types';
import { feeLineLabel, type Quote } from '@/lib/pricing/quote';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';

/**
 * The receipt: what the customer receives on Meru, the rate, every fee, and
 * the gourde total — the largest thing on the page, because it is the number
 * the wallet will actually debit.
 *
 * The same component fills itself as the customer types on the home page and
 * shows the frozen receipt stored on an order, so the two can never look
 * different. Its labels live in the `home` namespace (`receipt.*`) whichever
 * page renders it.
 */

const percentFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export type QuoteReceiptProps = {
  /** `null` shows `emptyMessage` instead of the totals. */
  quote: Quote | null;
  locale: FormatLocale;
  method?: PaymentMethod | null;
  /** Shown in place of the amounts when there is no quote yet. */
  emptyMessage?: ReactNode;
  /** Adds the « ce reçu est figé » note (order page, confirmation step). */
  frozen?: boolean;
  tone?: 'mist' | 'paper';
  className?: string;
};

function Row({ label, value, muted }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={cn('text-sm', muted ? 'text-ink-soft' : 'text-ink')}>{label}</dt>
      <dd className="font-display tnum text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export function QuoteReceipt({
  quote,
  locale,
  method,
  emptyMessage,
  frozen = false,
  tone = 'mist',
  className,
}: QuoteReceiptProps) {
  const t = useTranslations('home');

  return (
    <section
      aria-label={t('receipt.title')}
      className={cn(
        'rounded-2xl p-4 sm:p-5',
        tone === 'mist' ? 'bg-mist' : 'border border-line bg-paper shadow-card',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">{t('receipt.title')}</h3>
        {method ? <span className="text-sm text-ink-soft">{METHOD_LABELS[method]}</span> : null}
      </div>

      {quote === null ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{emptyMessage ?? t('receipt.placeholder')}</p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft">{t('receipt.youReceive')}</span>
            <span className="font-display tnum text-xl font-semibold text-ink">
              {formatUsd(quote.usdCents, locale)}
            </span>
          </div>

          <dl className="mt-4 border-t border-line pt-3">
            <Row label={t('receipt.rate')} value={formatRate(quote.fxRateHtg, locale)} muted />
            <Row label={t('receipt.base')} value={formatHtg(quote.baseHtg)} muted />
            {quote.lines.map((line) => {
              // The fee's own name, in the language of the page (an
              // untranslated rule keeps its French label — see feeLineLabel).
              const label = feeLineLabel(line, locale);
              // What the fee IS, next to what it costs today: a percentage,
              // or the flat transfer fee in the dollars it is denominated in
              // — « Frais de transfert · 3 $ US » on the left, the gourdes it
              // converts to at this order's rate on the right. A fee already
              // set in gourdes says the same thing twice, so it gets nothing.
              const detail =
                line.kind === 'percent'
                  ? t('receipt.percentDetail', { value: percentFormatter.format(line.value) })
                  : line.kind === 'fixed_usd'
                    ? formatUsdShort(line.value, locale)
                    : null;
              return (
                <Row
                  key={line.id}
                  muted
                  label={
                    <>
                      {label}
                      {detail ? <span className="ml-1.5 text-ink-muted">· {detail}</span> : null}
                    </>
                  }
                  value={formatHtg(line.amountHtg)}
                />
              );
            })}
          </dl>

          <div className="mt-3 border-t-2 border-dashed border-line pt-4">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium text-ink">{t('receipt.total')}</span>
              <span className="font-display tnum text-3xl leading-none font-bold text-ink sm:text-4xl">
                {formatHtg(quote.totalHtg)}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {t('receipt.effective', { rate: formatRate(quote.effectiveRateHtg, locale) })}
            </p>
          </div>

          {frozen ? <p className="mt-3 text-xs text-ink-muted">{t('receipt.frozen')}</p> : null}
        </>
      )}
    </section>
  );
}
