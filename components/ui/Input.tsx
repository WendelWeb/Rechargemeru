import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared field styling; 16px text so iOS never zooms into the form, a
 * 44px minimum height for thumbs, and the ink focus ring from globals.css.
 *
 * The border is `line-strong`, not `line`: a control's boundary has to clear
 * 3:1 (WCAG 1.4.11) or it simply does not exist on a cheap screen outdoors —
 * and this is the border of every field on the way to a payment.
 */
export const inputClasses =
  'block w-full min-h-tap rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted transition-colors hover:border-ink focus-visible:border-ink disabled:cursor-not-allowed disabled:border-line disabled:bg-mist disabled:text-ink-soft aria-[invalid=true]:border-coral-deep';

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
