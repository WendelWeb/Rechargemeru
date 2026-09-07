import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FieldProps = {
  /** Control id; the label points at it and the hint/error ids derive from it. */
  htmlFor: string;
  label: ReactNode;
  /** Small text after the label, e.g. « facultatif ». */
  optional?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function fieldHintId(htmlFor: string): string {
  return `${htmlFor}-hint`;
}

export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

/**
 * Builds the `aria-describedby` value for a control rendered inside a Field:
 * the error first (screen readers read it first), then the hint.
 */
export function fieldDescribedBy(htmlFor: string, opts: { hint?: unknown; error?: unknown }): string | undefined {
  const ids: string[] = [];
  if (opts.error) ids.push(fieldErrorId(htmlFor));
  if (opts.hint) ids.push(fieldHintId(htmlFor));
  return ids.length ? ids.join(' ') : undefined;
}

/** Label, control, hint and error laid out consistently. */
export function Field({ htmlFor, label, optional, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-soft">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} className="text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={fieldHintId(htmlFor)} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
