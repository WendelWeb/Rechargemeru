import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatHtg, formatRate, formatUsdShort, type FormatLocale } from '@/lib/format';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import type { PaymentMethod } from '@/lib/orders/types';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';

/**
 * « Les prix du jour » — the board a transfer counter hangs by its window.
 *
 * Every figure is a real total, computed by the same engine as the receipt:
 * rate and fees included, what the wallet will actually be debited. A price
 * list the customer can read before touching the form answers the first
 * question anyone has about a money service — « combien ça me coûte ? » —
 * and it answers it in gourdes, the currency they are paying in.
 *
 * One column when both wallets cost the same (the usual case), with dotted
 * leaders from the dollars to the gourdes like any price list; a column per
 * wallet the day they differ.
 */
export type PriceRow = {
  usdCents: number;
  totals: Partial<Record<PaymentMethod, number>>;
  /** The total is above what one MonCash or NatCash payment can carry. */
  overLimit?: boolean;
};

export type PriceBoardProps = {
  rows: PriceRow[];
  methods: PaymentMethod[];
  fxRateHtg: number;
  /** When the operator last changed the rate or the fees. */
  updatedAt: Date;
  locale: FormatLocale;
  className?: string;
};

const dayFormatter = (locale: FormatLocale) =>
  new Intl.DateTimeFormat(locale === 'ht' ? 'fr-HT' : 'fr-FR', {
    timeZone: 'America/Port-au-Prince',
    day: 'numeric',
    month: 'long',
  });

/** The mark tying an over-the-ceiling total to its footnote. */
function Star() {
  return (
    <sup className="ml-0.5 font-body text-xs font-semibold text-sun-ink" aria-hidden="true">
      *
    </sup>
  );
}

export function PriceBoard({ rows, methods, fxRateHtg, updatedAt, locale, className }: PriceBoardProps) {
  const t = useTranslations('home');
  if (rows.length === 0 || methods.length === 0) return null;

  const sameEverywhere = rows.every((row) => methods.every((m) => row.totals[m] === row.totals[methods[0]]));
  const updated = Number.isNaN(updatedAt.getTime()) ? null : dayFormatter(locale).format(updatedAt);

  return (
    <section
      aria-labelledby="prices-title"
      className={cn('rounded-[1.75rem] border border-line bg-paper p-card', className)}
    >
      <h2 id="prices-title" className="font-display text-xl font-semibold tracking-tight text-ink">
        {t('prices.title')}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t('prices.sub')}</p>

      {sameEverywhere ? (
        <dl className="mt-4">
          <div className="flex justify-between pb-1 text-xs font-medium text-ink-soft">
            <dt>{t('prices.receive')}</dt>
            <dd>{t('prices.pay')}</dd>
          </div>
          {rows.map((row) => (
            <div key={row.usdCents} className="flex items-baseline gap-3 py-2">
              <dt className="font-display text-lg font-semibold tnum text-ink">
                {formatUsdShort(row.usdCents, locale)}
              </dt>
              <span className="min-w-4 flex-1 translate-y-[-0.3rem] border-b-2 border-dotted border-line" aria-hidden="true" />
              <dd className="font-display text-lg font-semibold tnum text-ink">
                {formatHtg(row.totals[methods[0]] ?? 0)}
                {row.overLimit ? <Star /> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <table className="mt-4 w-full">
          <thead>
            <tr className="text-xs font-medium text-ink-soft">
              <th scope="col" className="pb-1 text-left font-medium">
                {t('prices.receive')}
              </th>
              {methods.map((m) => (
                <th key={m} scope="col" className="pb-1 text-right font-medium">
                  {METHOD_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.usdCents} className="border-t border-dashed border-line">
                <th scope="row" className="py-2 text-left font-display text-lg font-semibold tnum text-ink">
                  {formatUsdShort(row.usdCents, locale)}
                </th>
                {methods.map((m) => (
                  <td key={m} className="py-2 text-right font-display text-base font-semibold tnum text-ink">
                    {row.totals[m] === undefined ? '—' : formatHtg(row.totals[m])}
                    {row.overLimit && (row.totals[m] ?? 0) > HTG_WALLET_MAX ? <Star /> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.some((row) => row.overLimit) ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          <Star />
          {' '}
          {t('prices.overLimit', { limit: formatHtg(HTG_WALLET_MAX) })}
        </p>
      ) : null}

      <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft tnum">
        {t('prices.rate', { rate: formatRate(fxRateHtg, locale) })}
        {updated ? (
          <>
            <br />
            {t('prices.updated', { date: updated })}
          </>
        ) : null}
      </p>
    </section>
  );
}
