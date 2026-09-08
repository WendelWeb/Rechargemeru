import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ChipTone = 'test' | 'neutral' | 'sun';

const TONES: Record<ChipTone, string> = {
  test: 'border border-coral/40 bg-coral-soft text-coral-deep',
  neutral: 'bg-mist text-ink-soft',
  sun: 'bg-sun text-ink',
};

export type ChipProps = {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  /** Adds the flask icon; on by default for the `test` tone. */
  icon?: boolean;
};

/** A small tag. The `test` tone marks sandbox orders everywhere they appear. */
export function Chip({ tone = 'neutral', children, className, icon = tone === 'test' }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon ? <FlaskConical className="size-3.5" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
