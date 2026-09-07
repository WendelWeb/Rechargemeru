import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared field styling; 16px text so iOS never zooms into the form, a
 * 44px minimum height for thumbs, and the ink focus ring from globals.css.
 */
export const inputClasses =
  'block w-full min-h-11 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted transition-colors hover:border-ink-muted focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-mist disabled:text-ink-soft aria-[invalid=true]:border-coral';

export type InputProps = ComponentProps<'input'> & {
  /** Marks the field invalid (red border, `aria-invalid`). */
  invalid?: boolean;
  /** Display font with tabular numerals, for references and amounts. */
  mono?: boolean;
};

export function Input({ className, invalid, mono, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(inputClasses, mono && 'font-display tnum tracking-wide', className)}
      {...props}
    />
  );
}
