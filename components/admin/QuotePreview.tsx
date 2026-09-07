'use client';

import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import { formatHtg, formatRate, formatUsdShort } from '@/lib/format';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/orders/types';
import { computeQuote, type QuoteError } from '@/lib/pricing/quote';
import type { FeeRule } from '@/lib/settings/types';

const PREVIEW_USD_CENTS = 2000;

const ERROR_LABELS: Record<QuoteError, string> = {
  bad_amount: 'Taux ou montant invalide.',
  below_minimum: 'Sous le minimum autorisé.',
  above_maximum: 'Au-dessus du maximum autorisé.',
  wallet_limit: 'Dépasse le plafond de 75 000 HTG d’un paiement mobile.',
};

export type QuotePreviewProps = {
  fxRateHtg: number;
  feeRules: FeeRule[];
  minUsdCents: number;
  maxUsdCents: number;
};

/**
 * What the customer will actually see, computed here with the very same pure
 * function the browser and the server use — so a rule that reads well in the
 * form but produces an absurd total is caught before it is saved, not after
 * the first order.
 */
export function QuotePreview({ fxRateHtg, feeRules, minUsdCents, maxUsdCents }: QuotePreviewProps) {
  const usdCents = Math.min(Math.max(PREVIEW_USD_CENTS, minUsdCents), Math.max(maxUsdCents, minUsdCents));
  const settings = { fxRateHtg, feeRules, minUsdCents, maxUsdCents, settingsUpdatedAt: null };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_METHODS.map((method: PaymentMethod) => {
        const result = computeQuote({ usdCents, method, settings });
        return (
          <div key={method} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-sm font-semibold tracking-tight text-ink">{METHOD_LABELS[method]}</p>
              <p className="text-xs text-ink-muted">pour {formatUsdShort(usdCents, 'fr')}</p>
            </div>

            {result.ok ? (
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-soft">Conversion</dt>
                  <dd className="tnum text-ink">{formatHtg(result.quote.baseHtg)}</dd>
                </div>
                {result.quote.lines.map((line) => (
                  <div key={line.id} className="flex justify-between gap-3">
                    <dt className="min-w-0 truncate text-ink-soft">{line.label || 'Frais'}</dt>
                    <dd className="tnum text-ink">{formatHtg(line.amountHtg)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-3 border-t border-line pt-1.5">
                  <dt className="font-semibold text-ink">Total à payer</dt>
                  <dd className="font-display text-base font-semibold tnum text-ink">{formatHtg(result.quote.totalHtg)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Tout compris</dt>
                  <dd className="text-xs text-ink-muted">{formatRate(result.quote.effectiveRateHtg, 'fr')}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-coral-deep">{ERROR_LABELS[result.error]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
