'use client';

import { useOptimistic, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_DOT_CLASS, STATUS_PLURAL_FR, formatStatusList } from '@/lib/admin/order-status';
import type { OrderStatus } from '@/lib/orders/types';

/**
 * The status filter: one chip per state, ticked on or off, several at once.
 *
 * « Toutes » is not a chip like the others: it is what the list shows when
 * nothing is ticked, and pressing it unticks everything. A count sits in
 * every chip, so the operator reads « Payées 2 » before deciding to look.
 */

export type StatusChipsProps = {
  statuses: readonly OrderStatus[];
  counts: Partial<Record<OrderStatus, number>>;
  selected: readonly OrderStatus[];
  onToggle: (status: OrderStatus) => void;
  onClear: () => void;
  /** Total behind « Toutes » (the sum of the counts when omitted). */
  total?: number;
  className?: string;
};

function chipClass(active: boolean): string {
  return cn(
    'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95',
    active
      ? 'border-ink bg-ink text-paper'
      : 'border-line-strong/60 bg-paper text-ink-soft hover:border-ink hover:text-ink',
  );
}

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        'min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tnum',
        active ? 'bg-paper/15 text-paper' : 'bg-mist text-ink-soft',
      )}
    >
      {value}
    </span>
  );
}

export function StatusChips({ statuses, counts, selected, onToggle, onClear, total, className }: StatusChipsProps) {
  const all = total ?? Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const none = selected.length === 0;

  return (
    // One scrolling line on a phone (seven chips wrapped to four rows there),
    // wrapping freely from `sm` up. The strip bleeds to the screen edges so a
    // chip cut by the edge says « there is more this way ».
    <div
      role="group"
      aria-label="Filtrer par statut"
      className={cn(
        '-mx-4 flex scroll-fade-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:[mask-image:none]',
        className,
      )}
    >
      <button type="button" aria-pressed={none} onClick={onClear} className={chipClass(none)}>
        Toutes
        <Count value={all} active={none} />
      </button>
      {statuses.map((status) => {
        const active = selected.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(status)}
            className={chipClass(active)}
          >
            {active ? (
              <Check className="size-3.5 animate-pop" strokeWidth={3} aria-hidden="true" />
            ) : (
              <span className={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])} aria-hidden="true" />
            )}
            {STATUS_PLURAL_FR[status]}
            <Count value={counts[status] ?? 0} active={active} />
          </button>
        );
      })}
    </div>
  );
}

export type UrlStatusFilterProps = {
  statuses: readonly OrderStatus[];
  counts: Partial<Record<OrderStatus, number>>;
  selected: readonly OrderStatus[];
  total: number;
  children: ReactNode;
};

/**
 * The same chips on `/admin/commandes`, where the filter lives in the URL
 * (bookmarkable, shareable, reloadable). A tap ticks the chip at once — the
 * optimistic state — and the list below dims while the server answers, so
 * the page never looks frozen between the tap and the new rows.
 */
export function UrlStatusFilter({ statuses, counts, selected, total, children }: UrlStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic<readonly OrderStatus[]>(selected);

  function navigate(next: readonly OrderStatus[]) {
    const params = new URLSearchParams(searchParams.toString());
    const value = formatStatusList(next);
    if (value) params.set('status', value);
    else params.delete('status');
    params.delete('page');
    const query = params.toString();
    startTransition(() => {
      setOptimistic(next);
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <>
      <StatusChips
        statuses={statuses}
        counts={counts}
        selected={optimistic}
        total={total}
        onToggle={(status) =>
          navigate(optimistic.includes(status) ? optimistic.filter((s) => s !== status) : [...optimistic, status])
        }
        onClear={() => navigate([])}
      />
      <div
        aria-busy={pending || undefined}
        className={cn('mt-4 transition-opacity duration-200', pending && 'pointer-events-none opacity-55')}
      >
        {children}
      </div>
    </>
  );
}
