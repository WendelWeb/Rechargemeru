import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export type Bar = {
  key: string;
  value: number;
  /** Shown in the bubble on hover and read by screen readers: « 25 sept. : 14 visites ». */
  title: string;
  /** Today, usually: the one bar in the accent colour. */
  highlight?: boolean;
};

export type BarChartProps = {
  bars: Bar[];
  /** Accessible summary of the whole chart. */
  label: string;
  /** Captions under the first and last bars. */
  startLabel?: string;
  endLabel?: string;
  className?: string;
  heightClassName?: string;
};

/**
 * Days as bars, no library: a row of flex children whose heights are
 * percentages of the busiest day. They grow from the baseline once, one
 * after the other, when the chart first appears; hovering a bar shows its
 * day and count. An empty day keeps a 2px stub so the rhythm of the days
 * stays readable.
 */
export function BarChart({ bars, label, startLabel, endLabel, className, heightClassName = 'h-24' }: BarChartProps) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <figure className={className}>
      <ul className={cn('flex items-end gap-[3px] sm:gap-1', heightClassName)} aria-label={label}>
        {bars.map((bar, index) => {
          const height = bar.value === 0 ? 0 : Math.max(6, Math.round((bar.value / max) * 100));
          return (
            <li key={bar.key} className="group relative flex h-full min-w-0 flex-1 items-end">
              <span className="sr-only">{bar.title}</span>
              {bar.value === 0 ? (
                <span aria-hidden="true" className="block h-0.5 w-full rounded-full bg-line" />
              ) : (
                <span
                  aria-hidden="true"
                  style={{ height: `${height}%`, '--i': Math.min(index, 30) } as CSSProperties}
                  className={cn(
                    'block w-full origin-bottom animate-grow-y rounded-t-[5px] rounded-b-[2px] stagger transition-colors duration-150',
                    bar.highlight ? 'bg-sun-deep' : 'bg-ink/75 group-hover:bg-ink',
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute bottom-full z-10 mb-1.5 translate-y-1 rounded-lg bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-paper opacity-0 shadow-lift transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100',
                  // The bubbles of the edge bars open inwards, so they never
                  // hang out of the panel.
                  index < 2 ? 'left-0' : index >= bars.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                )}
              >
                {bar.title}
              </span>
            </li>
          );
        })}
      </ul>
      {startLabel || endLabel ? (
        <figcaption className="mt-2 flex justify-between text-[11px] text-ink-muted" aria-hidden="true">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
