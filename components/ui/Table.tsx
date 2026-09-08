import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type TableProps = Omit<ComponentProps<'table'>, 'ref'> & {
  /** Wrapper classes (the table itself always fills the wrapper). */
  wrapperClassName?: string;
  /** Minimum width before the wrapper scrolls horizontally. */
  minWidthClassName?: string;
  /**
   * Names the scrolling region, e.g. « Liste des commandes ». Given one, the
   * box becomes a labelled landmark; without a name a `role="region"` would
   * be worse than none, so it stays a plain focusable scroller.
   */
  label?: string;
};

/**
 * A data table that scrolls inside its own box instead of the page.
 *
 * The box is focusable: a read-only table holds nothing tabbable, so without
 * `tabIndex` a keyboard could never reach the columns past the fold
 * (WCAG 2.1.1).
 */
export function Table({
  className,
  wrapperClassName,
  minWidthClassName = 'min-w-[40rem]',
  label,
  children,
  ...props
}: TableProps) {
  return (
    <div
      tabIndex={0}
      role={label ? 'region' : undefined}
      aria-label={label}
      className={cn('overflow-x-auto rounded-card border border-line bg-paper shadow-card', wrapperClassName)}
    >
      <table className={cn('w-full border-collapse text-sm text-ink', minWidthClassName, className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ className, ...props }: Omit<ComponentProps<'thead'>, 'ref'>) {
  return <thead className={cn('bg-mist/70 text-ink-soft', className)} {...props} />;
}

export function Tbody({ className, ...props }: Omit<ComponentProps<'tbody'>, 'ref'>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />;
}

export type CellProps = { numeric?: boolean };

export function Th({ className, numeric, scope = 'col', ...props }: Omit<ComponentProps<'th'>, 'ref'> & CellProps) {
  return (
    <th
      scope={scope}
      className={cn('px-4 py-3 text-left font-medium whitespace-nowrap first:pl-5 last:pr-5', numeric && 'text-right', className)}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: Omit<ComponentProps<'td'>, 'ref'> & CellProps) {
  return (
    <td
      className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', numeric && 'text-right font-display tnum', className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: Omit<ComponentProps<'tr'>, 'ref'>) {
  return <tr className={cn('transition-colors hover:bg-mist/40', className)} {...props} />;
}

export type EmptyRowProps = { colSpan: number; children: ReactNode };

/** The single row shown when a table has nothing to list. */
export function EmptyRow({ colSpan, children }: EmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-ink-soft">
        {children}
      </td>
    </tr>
  );
}
