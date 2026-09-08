import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export type StatTone = 'neutral' | 'action' | 'good' | 'attention';

const VALUE_TONES: Record<StatTone, string> = {
  neutral: 'text-ink',
  action: 'text-sun-deep',
  good: 'text-mint-deep',
  attention: 'text-coral-deep',
};

export type StatCardProps = {
  label: string;
  /** Already formatted (« 2 985 HTG », « 20,00 $ US »): this component never formats money. */
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  /** Makes the whole card a link to the list it summarises. */
  href?: string;
  className?: string;
};

/**
 * One figure, its label and what it counts. Amounts use the display font with
 * tabular numerals so a column of cards lines up.
 *
 * The card is denser on a phone, where these sit two per row, and the hint
 * only appears from `sm` up: it explains a figure the operator is scanning,
 * never one they act on, and four hints stacked are 200px of scrolling
 * between them and the orders below.
 */
export function StatCard({ label, value, hint, tone = 'neutral', href, className }: StatCardProps) {
  const body = (
    <>
      <p className="text-xs leading-snug font-medium text-ink-soft sm:text-sm">{label}</p>
      <p className={cn('mt-1 font-display text-xl font-semibold tracking-tight tnum sm:text-2xl', VALUE_TONES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 hidden text-xs leading-snug text-ink-muted sm:block">{hint}</p> : null}
    </>
  );

  const shell = cn('rounded-card border border-line bg-paper p-3 shadow-card sm:p-4', className);

  return href ? (
    <Link href={href} className={cn(shell, 'block transition-colors hover:border-ink-muted')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
