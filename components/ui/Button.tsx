import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/*
 * No `whitespace-nowrap` here, on purpose. Every button that takes money
 * carries an interpolated label — « Payer 3 360 HTG avec MonCash » — whose
 * length is decided at runtime by the amount. Forbidding a line break made
 * that label spill out of its pill and pushed the whole document sideways on
 * a 360px screen. It wraps now, centred and balanced; a toolbar button that
 * really must stay on one line asks for it with `nowrap`.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl text-center font-semibold text-pretty select-none transition-[background-color,border-color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0';

/*
 * `sm` is 44px under the thumb and 36px under a mouse: the visual density of
 * an admin toolbar survives, the tap target does not shrink on a phone.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-tap px-3.5 text-sm sm:min-h-9',
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-13 px-5 text-base sm:px-7',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sun text-ink hover:bg-sun-deep',
  dark: 'bg-ink text-paper hover:bg-ink-hover',
  secondary: 'bg-mist text-ink hover:bg-line',
  ghost: 'border border-line-strong bg-paper text-ink hover:border-ink hover:bg-mist/60',
  danger: 'bg-coral text-paper hover:bg-coral-deep',
};

/** Class list for anything that should look like a button (links included). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and swaps the label for `loadingLabel` when given. */
  loading?: boolean;
  loadingLabel?: string;
  /** Keeps the label on one line (short, fixed labels only). */
  nowrap?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  loadingLabel,
  nowrap = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cn(nowrap && 'whitespace-nowrap', className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
