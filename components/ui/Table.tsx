import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type TableProps = Omit<ComponentProps<'table'>, 'ref'> & {
  /** Wrapper classes (the table itself always fills the wrapper). */
  wrapperClassName?: string;
  /** Minimum width before the wrapper scrolls horizontally. */
  minWidthClassName?: string;
};

/** A data table that scrolls inside its own box instead of the page. */
export function Table({ className, wrapperClassName, minWidthClassName = 'min-w-[40rem]', children, ...props }: TableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-paper shadow-card', wrapperClassName)}>
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
