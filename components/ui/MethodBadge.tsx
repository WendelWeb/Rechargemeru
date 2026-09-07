import type { PaymentMethod } from '@/lib/orders/types';
import { cn } from '@/lib/cn';

/** Brand names are the same in every language. */
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  moncash: 'MonCash',
  natcash: 'NatCash',
};

const MARK: Record<PaymentMethod, string> = {
  moncash: 'bg-moncash',
  natcash: 'bg-natcash',
};

export type MethodBadgeProps = {
  method: PaymentMethod;
  /** Overrides the brand name (rarely needed). */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/** The rail's brand colour as a small mark, next to its name. */
export function MethodBadge({ method, label, size = 'md', className }: MethodBadgeProps) {
  const name = label ?? METHOD_LABELS[method];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold text-ink',
        size === 'sm' && 'text-sm',
        size === 'md' && 'text-[15px]',
        size === 'lg' && 'text-lg',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold text-paper',
          size === 'sm' && 'size-5 text-[11px]',
          size === 'md' && 'size-6 text-xs',
          size === 'lg' && 'size-8 text-sm',
          MARK[method],
        )}
        aria-hidden="true"
      >
        {name.charAt(0)}
      </span>
      {name}
    </span>
  );
}
