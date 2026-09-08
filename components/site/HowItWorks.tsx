import { BadgeDollarSign, Smartphone, UserRound, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Four plain sentences that answer « qu'est-ce qui va se passer ? » before
 * the customer commits. No numbering: the order of the cards is the order of
 * the steps.
 */
const STEPS = [
  { key: 'amount', Icon: Wallet },
  { key: 'account', Icon: UserRound },
  { key: 'pay', Icon: Smartphone },
  { key: 'receive', Icon: BadgeDollarSign },
] as const;

export type HowItWorksProps = {
  /** Already formatted: « 5 $ US », « 500 $ US », « moins de 2 heures ». */
  min: string;
  max: string;
  sla: string;
  className?: string;
};

export function HowItWorks({ min, max, sla, className }: HowItWorksProps) {
  const t = useTranslations('home');

  return (
    <section className={cn('mx-auto max-w-6xl px-gutter', className)} aria-labelledby="how-it-works">
      <h2 id="how-it-works" className="font-display text-title font-semibold tracking-tight text-ink">
        {t('how.title')}
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ key, Icon }) => (
          <li key={key} className="rounded-card border border-line bg-paper p-card shadow-card">
            <Icon className="size-6 text-sun-ink" aria-hidden="true" />
            <h3 className="mt-3 font-display text-base font-semibold text-ink">{t(`how.steps.${key}.title`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {t(`how.steps.${key}.body`, { min, max, sla })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
