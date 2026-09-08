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
 *
 * The call is wrapped because the transport can fail even though the action
 * cannot: a Server Action is a POST, and on an intermittent connection it
 * times out or comes back 502. An unhandled rejection there used to kill the
 * loop silently — no next tick, no « stopped » state — and left somebody who
 * had just paid on a blinking « nous vérifions » for ever. Now a failed
 * attempt backs off (5s, 10s, 20s) and three in a row hand over to the manual
 * button, which is also offered from the start rather than in replacement.
 */
const INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 24;
const MAX_FAILURES = 3;
const MAX_BACKOFF_MS = 20_000;

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
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      attempts += 1;

      let result: Awaited<ReturnType<typeof recheckOrder>> | null = null;
      try {
        result = await recheckOrder(reference);
      } catch {
        result = null;
      }
      if (cancelled) return;

      if (result === null) {
        failures += 1;
        if (failures >= MAX_FAILURES || attempts >= MAX_ATTEMPTS) {
          setExhausted(true);
          return;
        }
        timer = setTimeout(() => void tick(), Math.min(INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS));
        return;
      }

      failures = 0;
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

  return (
    <div className="space-y-3">
      {exhausted ? (
        <p className="text-sm leading-relaxed text-ink-soft">{t('recheck.stopped')}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
          <span
            className="size-2 shrink-0 animate-pulse rounded-full bg-sun-ink motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t('recheck.polling', { method: methodLabel })}
        </p>
      )}
      {/* Present from the first second, not only once the loop gives up: a
          button that is already there costs one line, a dead page costs the
          customer. */}
      <RecheckButton reference={reference} methodLabel={methodLabel} />
    </div>
  );
}
