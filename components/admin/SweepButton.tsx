'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { sweepAction, type SweepState } from '@/lib/admin/actions';

export type SweepButtonProps = {
  /** How many orders are waiting; the button says so and disables itself at zero. */
  pending: number;
};

/**
 * « Tout re-vérifier » — one bounded reconciliation pass (10 orders, 20 s)
 * the operator can trigger by hand.
 *
 * It exists because the hourly cron is a Vercel Pro feature: on the free plan
 * it fires once a day, and this button is then the way a lost callback gets
 * noticed the same morning.
 */
export function SweepButton({ pending }: SweepButtonProps) {
  const [state, setState] = useState<SweepState>({});
  const [running, startTransition] = useTransition();

  return (
    <div>
      <Button
        variant="ghost"
        disabled={pending === 0}
        loading={running}
        loadingLabel="Vérification en cours…"
        onClick={() => startTransition(async () => setState(await sweepAction()))}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {pending === 0 ? 'Rien à re-vérifier' : `Re-vérifier ${Math.min(pending, 10)} commande(s)`}
      </Button>
      {state.error ? <Alert tone="danger" className="mt-3">{state.error}</Alert> : null}
      {state.message ? <Alert tone="info" className="mt-3">{state.message}</Alert> : null}
    </div>
  );
}
