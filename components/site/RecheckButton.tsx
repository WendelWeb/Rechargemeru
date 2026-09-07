'use client';

import { useActionState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { recheckOrder, type RecheckResult } from '@/lib/orders/actions';
import { Button } from '@/components/ui/Button';

/**
 * « Vérifier à nouveau » — one provider call, on demand.
 *
 * The server action is rate-limited per IP and throttled to one provider call
 * every 20 s per order, so a customer hammering the button costs nothing; the
 * answer is turned into a sentence that says what to do next, and the page is
 * refreshed as soon as the status has actually moved.
 */
export type RecheckButtonProps = {
  reference: string;
  /** « MonCash » / « NatCash », named in the answer. */
  methodLabel: string;
  className?: string;
};

type RecheckState = { status: RecheckResult['status'] | null };

const INITIAL: RecheckState = { status: null };

export function RecheckButton({ reference, methodLabel, className }: RecheckButtonProps) {
  const t = useTranslations('order');
  const router = useRouter();

  const [state, formAction, pending] = useActionState<RecheckState, FormData>(async () => {
    const result = await recheckOrder(reference);
    if (result.orderStatus !== null && result.orderStatus !== 'pending_payment') router.refresh();
    return { status: result.status };
  }, INITIAL);

  function answer(status: RecheckResult['status']): string {
    switch (status) {
      case 'granted':
      case 'review':
      case 'already':
        return t('recheck.updated');
      case 'throttled':
        return t('recheck.throttled');
      case 'unpaid':
      case 'pending':
        return t('recheck.unpaid', { method: methodLabel });
      case 'rate_limited':
        return t('recheck.throttled');
      default:
        return t('recheck.error');
    }
  }

  return (
    <form action={formAction} className={cn('space-y-2', className)}>
      <Button type="submit" variant="ghost" loading={pending} loadingLabel={t('recheck.busy')}>
        <RefreshCw className="size-4" aria-hidden="true" />
        {t('recheck.cta')}
      </Button>
      <p className="text-sm text-ink-soft" role="status">
        {state.status ? answer(state.status) : ''}
      </p>
    </form>
  );
}
