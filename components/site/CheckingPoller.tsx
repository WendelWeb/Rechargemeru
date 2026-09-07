'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { recheckOrder } from '@/lib/orders/actions';
import { RecheckButton } from './RecheckButton';

/**
 * The « nous vérifions votre paiement » loop.
 *
 * Every five seconds it asks the server to re-check the order, at most
 * twenty-four times (two minutes), then hands over to a manual button. The
 * server action itself throttles provider calls to one per twenty seconds per
 * order, so the page is cheap even when several tabs are open — and the
 * customer is never told to pay again while a payment may still land.
 */
const INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 24;

export type CheckingPollerProps = {
  reference: string;
  methodLabel: string;
};

export function CheckingPoller({ reference, methodLabel }: CheckingPollerProps) {
  const t = useTranslations('order');
  const router = useRouter();
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      attempts += 1;
      const result = await recheckOrder(reference);
      if (cancelled) return;

      if (result.orderStatus !== null && result.orderStatus !== 'pending_payment') {
        router.refresh();
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setExhausted(true);
        return;
      }
      timer = setTimeout(() => void tick(), INTERVAL_MS);
    }

    timer = setTimeout(() => void tick(), INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference, router]);

  if (exhausted) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-soft">{t('recheck.stopped')}</p>
        <RecheckButton reference={reference} methodLabel={methodLabel} />
      </div>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
      <span
        className="size-2 animate-pulse rounded-full bg-sun-deep motion-reduce:animate-none"
        aria-hidden="true"
      />
      {t('recheck.polling', { method: methodLabel })}
    </p>
  );
}
