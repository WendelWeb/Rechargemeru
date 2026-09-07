import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { TrustLine } from './TrustLine';

/**
 * Why this service can be trusted, in four sentences the operator can
 * actually keep: visible fees, verified payments, tracking, a real person on
 * WhatsApp.
 */
export type TrustStripProps = {
  /** Operator's support hours, e.g. « 8 h – 20 h, 7 j/7 ». */
  supportHours: string;
  className?: string;
};

export function TrustStrip({ supportHours, className }: TrustStripProps) {
  const t = useTranslations('home');

  return (
    <section className={cn('mx-auto max-w-6xl px-4 sm:px-6', className)} aria-labelledby="trust-strip">
      <div className="rounded-card bg-mist p-6 sm:p-8">
        <h2 id="trust-strip" className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {t('trust.title')}
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <TrustLine kind="feesVisible" />
          <TrustLine kind="verified" />
          <TrustLine kind="tracking" />
          <TrustLine kind="support">{t('trust.operator', { hours: supportHours })}</TrustLine>
        </div>
      </div>
    </section>
  );
}
