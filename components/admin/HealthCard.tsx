'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { CircleCheck, CircleX, Mail, MessageCircle, PlugZap, TriangleAlert } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { probeMoncashAction, sendTestEmailAction, sendTestWhatsAppAction, type ActionState } from '@/lib/admin/actions';
import type { HealthState, IntegrationStatus } from '@/lib/admin/health';

const STATE_STYLES: Record<HealthState, { dot: string; label: string; text: string }> = {
  ok: { dot: 'bg-mint', label: 'Prêt', text: 'text-mint-deep' },
  warn: { dot: 'bg-sun-deep', label: 'À surveiller', text: 'text-sun-deep' },
  off: { dot: 'bg-coral', label: 'Non configuré', text: 'text-coral-deep' },
};

const STATE_ICONS: Record<HealthState, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  off: CircleX,
};

export type HealthCardProps = { status: IntegrationStatus };

/** One integration: what it is, what it is doing right now, and what to change. */
export function HealthCard({ status }: HealthCardProps) {
  const style = STATE_STYLES[status.state];
  const Icon = STATE_ICONS[status.state];
  return (
    <article className="rounded-card border border-line bg-paper p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 size-5 shrink-0', style.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-display text-base font-semibold tracking-tight text-ink">{status.label}</h3>
            <span className={cn('text-xs font-semibold', style.text)}>{style.label}</span>
          </div>
          <p className="mt-1 text-sm leading-snug text-ink-soft">{status.detail}</p>
          {status.hint ? <p className="mt-1.5 text-sm leading-snug text-ink-muted">{status.hint}</p> : null}
        </div>
      </div>
    </article>
  );
}

function TestButton({
  label,
  busyLabel,
  icon,
  disabled,
  disabledHint,
  run,
}: {
  label: string;
  busyLabel: string;
  icon: ReactNode;
  disabled: boolean;
  disabledHint: string;
  run: () => Promise<ActionState>;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="min-w-0 flex-1">
      <Button
        variant="ghost"
        className="w-full"
        disabled={disabled}
        loading={pending}
        loadingLabel={busyLabel}
        onClick={() => startTransition(async () => setState(await run()))}
      >
        {icon}
        {label}
      </Button>
      {disabled ? <p className="mt-2 text-xs text-ink-muted">{disabledHint}</p> : null}
      {state.error ? <Alert tone="danger" className="mt-2">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success" className="mt-2">{state.message}</Alert> : null}
    </div>
  );
}

export type HealthTestsProps = {
  emailReady: boolean;
  whatsappReady: boolean;
  moncashReady: boolean;
};

/**
 * Real sends, not simulations: the email and the WhatsApp message actually
 * leave, because the only way to know an alert will arrive at 2 a.m. is to
 * have received one. The MonCash probe asks about a reference that cannot
 * exist, so it proves the credentials without creating a payment.
 */
export function HealthTests({ emailReady, whatsappReady, moncashReady }: HealthTestsProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <TestButton
        label="Envoyer un email de test"
        busyLabel="Envoi…"
        icon={<Mail className="size-4" aria-hidden="true" />}
        disabled={!emailReady}
        disabledHint="Configurez RESEND_API_KEY, RESEND_FROM et au moins une adresse admin."
        run={sendTestEmailAction}
      />
      <TestButton
        label="Envoyer un WhatsApp de test"
        busyLabel="Envoi…"
        icon={<MessageCircle className="size-4" aria-hidden="true" />}
        disabled={!whatsappReady}
        disabledHint="Configurez un fournisseur WhatsApp et au moins un numéro admin."
        run={sendTestWhatsAppAction}
      />
      <TestButton
        label="Tester la connexion MonCash"
        busyLabel="Interrogation…"
        icon={<PlugZap className="size-4" aria-hidden="true" />}
        disabled={!moncashReady}
        disabledHint="Aucun fournisseur MonCash configuré."
        run={probeMoncashAction}
      />
    </div>
  );
}
