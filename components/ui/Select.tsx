import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { inputClasses } from './Input';

export type SelectProps = ComponentProps<'select'> & {
  invalid?: boolean;
  /** Classes for the positioning wrapper (the chevron rides on it). */
  wrapperClassName?: string;
};

/**
 * Native select (works everywhere, no JS) with a consistent chevron.
 *
 * `className` reaches the `<select>` itself — the control is what callers
 * ever want to adjust; the wrapper has `wrapperClassName`.
 */
export function Select({ className, wrapperClassName, invalid, children, ...props }: SelectProps) {
  return (
    <span className={cn('relative block', wrapperClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(inputClasses, 'appearance-none pr-10', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-soft"
        aria-hidden="true"
      />
    </span>
  );
}
