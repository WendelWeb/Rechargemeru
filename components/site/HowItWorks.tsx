import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Three steps, and they really are a sequence — so they are numbered, and a
 * dashed line runs from one to the next: down the page on a phone, across it
 * on a desk. The last number is the only yellow one, because it is the only
 * step that is not the customer's to do.
 */
const STEPS = ['amount', 'pay', 'receive'] as const;

export type HowItWorksProps = {
  /** Already formatted: « moins de 2 heures ». */
  sla: string;
  className?: string;
};

export function HowItWorks({ sla, className }: HowItWorksProps) {
  const t = useTranslations('home');

  return (
    <section className={cn('mx-auto max-w-6xl px-gutter', className)} aria-labelledby="how-it-works">
      <h2 id="how-it-works" className="font-display text-title font-semibold tracking-tight text-ink">
        {t('how.title')}
      </h2>
      <ol className="mt-7 grid gap-7 md:grid-cols-3 md:gap-8">
        {STEPS.map((key, index) => {
          const last = index === STEPS.length - 1;
          return (
            <li
              key={key}
              className={cn(
                'relative flex gap-4 md:block',
                // The rail to the next step: vertical under the number on a
                // phone, horizontal after it on a desk.
                !last &&
                  'after:absolute after:top-12 after:-bottom-6 after:left-5 after:border-l-2 after:border-dashed after:border-line md:after:top-5 md:after:-right-6 md:after:bottom-auto md:after:left-14 md:after:border-t-2 md:after:border-l-0',
              )}
            >
              <span
                className={cn(
                  'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold',
                  last ? 'bg-sun text-ink' : 'bg-ink text-paper',
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 pt-1.5 md:mt-4 md:pt-0">
                <h3 className="font-display text-lg leading-snug font-semibold text-ink">
                  {t(`how.steps.${key}.title`)}
                </h3>
                <p className="mt-1 max-w-xs text-[15px] leading-relaxed text-ink-soft">
                  {t(`how.steps.${key}.body`, { sla })}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
