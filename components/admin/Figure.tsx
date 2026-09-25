import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FigureProps = {
  label: string;
  /** Already formatted: this component never formats money. */
  value: ReactNode;
  /** One short line under the value: « 3 paiements », « +2 par rapport à hier ». */
  note?: ReactNode;
  tone?: 'ink' | 'good' | 'action';
  size?: 'md' | 'lg';
  className?: string;
};

const TONES = { ink: 'text-ink', good: 'text-mint-deep', action: 'text-sun-ink' } as const;

/**
 * One figure inside a panel: the label above, the value in the display face
 * with tabular numerals (so a row of them lines up), a note underneath. No
 * card of its own — figures that belong together share one panel, and the
 * panel is what carries the border.
 */
export function Figure({ label, value, note, tone = 'ink', size = 'md', className }: FigureProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs leading-snug font-medium text-ink-soft sm:text-sm">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-display leading-none font-bold tracking-tight tnum',
          size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
          TONES[tone],
        )}
      >
        {value}
      </dd>
      {note ? <dd className="mt-1.5 text-xs leading-snug text-ink-muted">{note}</dd> : null}
    </div>
  );
}

/**
 * « +3 par rapport à hier » in mint, « −2 … » in coral, nothing for zero
 * change — a figure that did not move needs no colour.
 */
export function Delta({ current, previous, against }: { current: number; previous: number; against: string }) {
  const diff = current - previous;
  if (diff === 0) return <span>Comme {against}</span>;
  const up = diff > 0;
  return (
    <span className={up ? 'text-mint-deep' : 'text-coral-deep'}>
      {up ? '+' : '−'}
      {Math.abs(diff)} par rapport à {against}
    </span>
  );
}
