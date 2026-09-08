'use client';

import { useActionState, useState, useTransition, type ReactNode } from 'react';
import { Ban, BellRing, ChevronDown, NotebookPen, RefreshCw, RotateCcw, UserRoundCog, XCircle } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  addNoteAction,
  cancelAction,
  correctMeruAccountAction,
  markFailedAction,
  markRefundedAction,
  recheckAction,
  resendNotificationsAction,
  type ActionState,
} from '@/lib/admin/actions';
import { meruAccountLabelFr } from '@/lib/orders/meru-account';
import { canTransition } from '@/lib/orders/transitions';
import { MERU_ACCOUNT_TYPES, type MeruAccountType, type OrderStatus } from '@/lib/orders/types';

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert tone="danger" className="mt-3">{state.error}</Alert>;
  if (state.message) return <Alert tone="success" className="mt-3">{state.message}</Alert>;
  return null;
}

/** A button that runs a parameterless action and reports its answer. */
function ActionButton({
  label,
  busyLabel,
  icon,
  run,
}: {
  label: string;
  busyLabel: string;
  icon: ReactNode;
  run: () => Promise<ActionState>;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="min-w-0 flex-1">
      <Button
        variant="ghost"
        className="w-full"
        loading={pending}
        loadingLabel={busyLabel}
        onClick={() => startTransition(async () => setState(await run()))}
      >
        {icon}
        {label}
      </Button>
      <Feedback state={state} />
    </div>
  );
}

/** A folded form: the operator opens it deliberately, then confirms with a named button. */
function ActionForm({
  title,
  icon,
  description,
  action,
  submitLabel,
  danger,
  children,
}: {
  title: string;
  icon: ReactNode;
  description: string;
  action: FormAction;
  submitLabel: string;
  danger?: boolean;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <details className="group rounded-xl border border-line bg-paper open:bg-mist/30">
      {/* `list-none` alone leaves the default triangle on older WebKit — still
          the browser on many of the phones this is used from. */}
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-4 py-4">
        <p className="mb-3 text-sm leading-snug text-ink-soft">{description}</p>
        <form action={formAction} className="space-y-3">
          {children}
          <Button
            type="submit"
            variant={danger ? 'danger' : 'dark'}
            loading={pending}
            loadingLabel="Enregistrement…"
            className="w-full sm:w-auto"
          >
            {submitLabel}
          </Button>
        </form>
        <Feedback state={state} />
      </div>
    </details>
  );
}

export type OrderActionsProps = {
  orderId: string;
  status: OrderStatus;
  meruAccountType: MeruAccountType;
  meruAccount: string;
  adminNote: string | null;
  /** Prefilled refund amount (what the provider says it received) and wallet. */
  suggestedRefundHtg: number;
  suggestedRefundWallet: string;
};

/**
 * Everything the operator can do to an order besides recharging it. Each
 * action is a compare-and-set on the server, so opening two of these in two
 * tabs cannot produce two different truths: the second one answers
 * « déjà traitée ».
 */
export function OrderActions({
  orderId,
  status,
  meruAccountType,
  meruAccount,
  adminNote,
  suggestedRefundHtg,
  suggestedRefundWallet,
}: OrderActionsProps) {
  const labelClass = 'mb-1 block text-sm font-medium text-ink';
  const canFail = canTransition(status, 'failed');
  const canCancel = canTransition(status, 'cancelled');
  const canRefund = canTransition(status, 'refunded');
  const canCorrect = status !== 'fulfilled';

  return (
    <section aria-labelledby="actions-title" className="rounded-card border border-line bg-paper p-4 shadow-card sm:p-6">
      <CardTitle as="h2" className="mb-4">
        <span id="actions-title">Actions</span>
      </CardTitle>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ActionButton
          label="Re-vérifier le paiement"
          busyLabel="Vérification…"
          icon={<RefreshCw className="size-4" aria-hidden="true" />}
          run={() => recheckAction(orderId)}
        />
        <ActionButton
          label="Renvoyer les notifications"
          busyLabel="Envoi…"
          icon={<BellRing className="size-4" aria-hidden="true" />}
          run={() => resendNotificationsAction(orderId)}
        />
      </div>

      <div className="mt-4 space-y-2">
        {canCorrect ? (
          <ActionForm
            title="Corriger l’identifiant Meru"
            icon={<UserRoundCog className="size-4 text-ink-soft" aria-hidden="true" />}
            description="À faire avant d’envoyer les dollars. L’ancienne et la nouvelle valeur restent dans la chronologie."
            action={correctMeruAccountAction.bind(null, orderId)}
            submitLabel="Enregistrer l’identifiant"
          >
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div>
                <label className={labelClass} htmlFor="correct-type">
                  Type
                </label>
                <Select id="correct-type" name="meruAccountType" defaultValue={meruAccountType}>
                  {MERU_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {meruAccountLabelFr(type)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass} htmlFor="correct-account">
                  Identifiant
                </label>
                <Input id="correct-account" name="meruAccount" defaultValue={meruAccount} autoComplete="off" />
              </div>
            </div>
          </ActionForm>
        ) : null}

        <ActionForm
          title="Ajouter une note"
          icon={<NotebookPen className="size-4 text-ink-soft" aria-hidden="true" />}
          description="Visible uniquement ici. La note remplace la précédente ; la chronologie garde toutes les versions."
          action={addNoteAction.bind(null, orderId)}
          submitLabel="Enregistrer la note"
        >
          <div>
            <label className={labelClass} htmlFor="note">
              Note
            </label>
            <textarea
              id="note"
              name="note"
              rows={3}
              defaultValue={adminNote ?? ''}
              className="block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted transition-colors hover:border-ink focus-visible:border-ink"
            />
          </div>
        </ActionForm>

        {canRefund ? (
          <ActionForm
            title="Marquer remboursée"
            icon={<RotateCcw className="size-4 text-ink-soft" aria-hidden="true" />}
            description="À enregistrer après avoir renvoyé les gourdes depuis MonCash ou NatCash. Le client est prévenu."
            action={markRefundedAction.bind(null, orderId)}
            submitLabel="Enregistrer le remboursement"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="refundHtg">
                  Montant remboursé (gourdes)
                </label>
                <Input id="refundHtg" name="refundHtg" inputMode="numeric" defaultValue={String(suggestedRefundHtg)} mono />
              </div>
              <div>
                <label className={labelClass} htmlFor="refundWallet">
                  Portefeuille remboursé
                </label>
                <Input id="refundWallet" name="refundWallet" defaultValue={suggestedRefundWallet} autoComplete="off" />
              </div>
            </div>
          </ActionForm>
        ) : null}

        {canFail ? (
          <ActionForm
            title="Marquer échouée"
            icon={<XCircle className="size-4 text-coral" aria-hidden="true" />}
            description="Ferme la commande. La raison est envoyée au client : écrivez-la comme il la lira."
            action={markFailedAction.bind(null, orderId)}
            submitLabel="Confirmer l’échec"
            danger
          >
            <div>
              <label className={labelClass} htmlFor="failure-reason">
                Raison
              </label>
              <Input
                id="failure-reason"
                name="reason"
                required
                maxLength={200}
                placeholder="Paiement jamais reçu malgré plusieurs vérifications"
              />
            </div>
          </ActionForm>
        ) : null}

        {canCancel ? (
          <ActionForm
            title="Annuler la commande"
            icon={<Ban className="size-4 text-ink-soft" aria-hidden="true" />}
            description="Possible uniquement tant que rien n’a été payé. Le client pourra en créer une nouvelle."
            action={cancelAction.bind(null, orderId)}
            submitLabel="Annuler la commande"
            danger
          >
            <div>
              <label className={labelClass} htmlFor="cancel-reason">
                Raison <span className="font-normal text-ink-soft">facultatif</span>
              </label>
              <Input id="cancel-reason" name="reason" maxLength={200} placeholder="Demande du client" />
            </div>
          </ActionForm>
        ) : null}
      </div>
    </section>
  );
}
