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
 */
export function StatCard({ label, value, hint, tone = 'neutral', href, className }: StatCardProps) {
  const body = (
    <>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-semibold tracking-tight tnum', VALUE_TONES[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-snug text-ink-muted">{hint}</p> : null}
    </>
  );

  const shell = cn('rounded-card border border-line bg-paper p-4 shadow-card', className);

  return href ? (
    <Link href={href} className={cn(shell, 'block transition-colors hover:border-ink-muted')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
