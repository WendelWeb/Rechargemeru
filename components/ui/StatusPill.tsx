import type { OrderStatus } from '@/lib/orders/types';
import { cn } from '@/lib/cn';

/**
 * How a status reads at a glance:
 * - `waiting`  — nothing to do yet (pending payment)
 * - `action`   — the operator must act (paid: send the dollars)
 * - `attention`— a human must look (manual review)
 * - `good`     — done and well (fulfilled)
 * - `muted`    — closed without money moving (failed, expired, cancelled)
 * - `neutral`  — closed with money returned (refunded)
 */
export type StatusTone = 'waiting' | 'action' | 'attention' | 'good' | 'muted' | 'neutral';

const TONE_BY_STATUS: Record<OrderStatus, StatusTone> = {
  pending_payment: 'waiting',
  paid: 'action',
  needs_review: 'attention',
  fulfilled: 'good',
  failed: 'muted',
  expired: 'muted',
  cancelled: 'muted',
  refunded: 'neutral',
};

const PILL: Record<StatusTone, string> = {
  waiting: 'bg-mist text-ink-soft',
  action: 'bg-sun-soft text-ink',
  attention: 'bg-coral-soft text-coral-deep',
  good: 'bg-mint-soft text-mint-deep',
  muted: 'bg-mist text-ink-muted',
  neutral: 'bg-ink text-paper',
};

const DOT: Record<StatusTone, string> = {
  waiting: 'bg-ink-muted',
  action: 'bg-sun-deep',
  attention: 'bg-coral',
  good: 'bg-mint',
  muted: 'bg-line',
  neutral: 'bg-paper',
};

export function statusTone(status: OrderStatus): StatusTone {
  return TONE_BY_STATUS[status];
}

export type StatusPillProps = {
  status: OrderStatus;
  /** Human label in the reader's language (the pill never translates itself). */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function StatusPill({ status, label, size = 'md', className }: StatusPillProps) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        PILL[tone],
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}
