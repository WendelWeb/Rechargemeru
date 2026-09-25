'use client';

import { useActionState, useState, useTransition } from 'react';
import { CircleCheck, MessageCircle, TriangleAlert } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { markFulfilledAction, recordManualWhatsAppAction, type ActionState } from '@/lib/admin/actions';
import { formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import { meruAccountLabelFr } from '@/lib/orders/meru-account';
import type { GatewayMode, MeruAccountType, OrderStatus } from '@/lib/orders/types';
import { formatPhone } from '@/lib/phone';

/** « 20.00 » — what gets pasted into Meru's amount field, from integer cents. */
function usdPlain(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

export type FulfilPanelProps = {
  orderId: string;
  reference: string;
  status: OrderStatus;
  mode: GatewayMode;
  customerName: string;
  customerPhone: string;
  meruAccount: string;
  meruAccountType: MeruAccountType;
  usdCents: number;
  totalHtg: number;
  paidHtg: number | null;
  meruReference: string | null;
  fulfilledUsdCents: number | null;
  fulfilledAt: Date | null;
  /** Prefilled `wa.me` link telling the customer the dollars are on the way. */
  whatsappHref: string | null;
};

/**
 * The panel the operator uses with one thumb, at the top of the order page on
 * a phone.
 *
 * It is built around the single irreversible act of this product: sending
 * dollars from the operator's own Meru account. So it shows, in this order,
 * (1) the customer's name as it must appear in Meru, (2) the identifier and
 * the amount as copiable chips — typing either by hand is how money goes to a
 * stranger — and only then (3) the « Marquer rechargée » button, behind an
 * explicit confirmation. A sandbox order shows a red banner instead of the
 * chips: there is nothing to send.
 *
 * Nothing here is ever truncated. A Meru identifier is usually an email
 * address — one unbreakable 30-character word — and the two places it used to
 * be cut short, the copy row and the confirmation, are precisely the two
 * places where the operator is checking that the dollars are about to leave
 * for the right person.
 */
export function FulfilPanel(props: FulfilPanelProps) {
  const {
    orderId,
    reference,
    status,
    mode,
    customerName,
    customerPhone,
    meruAccount,
    meruAccountType,
    usdCents,
    totalHtg,
    paidHtg,
    meruReference,
    fulfilledUsdCents,
    fulfilledAt,
    whatsappHref,
  } = props;

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    markFulfilledAction.bind(null, orderId),
    {},
  );
  const [confirming, setConfirming] = useState(false);
  const [manual, setManual] = useState<ActionState>({});
  const [recording, startRecording] = useTransition();

  const sandbox = mode === 'sandbox';
  const done = status === 'fulfilled';
  const amountPlain = usdPlain(usdCents);
  // Controlled, so the confirmation below can name the amount that is really
  // about to be recorded rather than the one this field started with.
  const [sentUsd, setSentUsd] = useState(amountPlain);

  function noteManualWhatsApp() {
    startRecording(async () => {
      setManual(await recordManualWhatsAppAction(orderId, done ? 'fulfilled' : 'paid'));
    });
  }

  const whatsappButton = whatsappHref ? (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={noteManualWhatsApp}
      aria-busy={recording || undefined}
      className={buttonClasses('ghost', 'md', 'w-full sm:w-auto')}
    >
      <MessageCircle className="size-4 text-mint" aria-hidden="true" />
      Prévenir sur WhatsApp
    </a>
  ) : null;

  if (done) {
    return (
      <section
        aria-labelledby="fulfil-title"
        className="rounded-card border border-mint/40 bg-mint-soft p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-mint" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="fulfil-title" className="font-display text-lg font-semibold tracking-tight text-ink">
              Dollars envoyés
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-ink-soft">
              {formatUsd(fulfilledUsdCents ?? usdCents, 'fr')} envoyés à{' '}
              <span className="font-medium break-all text-ink">{meruAccount}</span>
              {meruReference ? (
                <>
                  {' — référence Meru '}
                  <span className="break-all">{meruReference}</span>
                </>
              ) : null}
              {fulfilledAt ? `, le ${formatDateTime(fulfilledAt)}` : ''}.
            </p>
            {whatsappButton ? <div className="mt-4">{whatsappButton}</div> : null}
            {manual.message ? <p className="mt-2 text-sm text-mint-deep">{manual.message}</p> : null}
            {manual.error ? <p className="mt-2 text-sm text-ink-soft">{manual.error}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="fulfil-title"
      className="rounded-[1.75rem] border-2 border-sun bg-paper p-4 shadow-lift sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fulfil-title" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-ink">
          <span className="size-2.5 shrink-0 animate-beat rounded-full bg-sun-deep" aria-hidden="true" />
          {status === 'needs_review' ? 'Vérifier, puis recharger' : 'Recharger cette commande'}
        </h2>
        <span className="font-display text-sm tracking-wide tnum text-ink-muted">{reference}</span>
      </div>

      {sandbox ? (
        <Alert tone="danger" className="mt-4" title="Commande de test — ne rien envoyer">
          Ce paiement vient d’un rail en bac à sable : aucune gourde n’a été reçue. Envoyer des dollars pour cette
          commande serait une perte sèche. Marquez-la rechargée uniquement pour solder un essai.
        </Alert>
      ) : null}

      <p className="mt-4 text-xs font-medium text-ink-soft">Nom du client, tel qu’il doit apparaître dans Meru</p>
      <p className="font-display text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-3xl">
        {customerName}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {formatPhone(customerPhone)} · payé {formatHtg(paidHtg ?? totalHtg)}
        {paidHtg !== null && paidHtg !== totalHtg ? ` (devis ${formatHtg(totalHtg)})` : ''}
      </p>

      {sandbox ? null : (
        <div className="mt-4 space-y-2">
          <CopyRow
            label={meruAccountLabelFr(meruAccountType)}
            value={meruAccount}
            copyLabel="Copier l’identifiant"
          />
          <CopyRow
            label="Montant à envoyer"
            value={amountPlain}
            suffix={formatUsd(usdCents, 'fr')}
            copyLabel="Copier le montant"
          />
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="fulfilledUsd" className="mb-1 block text-sm font-medium text-ink">
              Montant réellement envoyé
            </label>
            <Input
              id="fulfilledUsd"
              name="fulfilledUsd"
              inputMode="decimal"
              value={sentUsd}
              onChange={(event) => setSentUsd(event.target.value)}
              mono
              aria-describedby="fulfilledUsd-hint"
            />
            <p id="fulfilledUsd-hint" className="mt-1 text-xs text-ink-muted">
              En dollars. Ne changez que si vous avez envoyé un autre montant.
            </p>
          </div>
          <div>
            <label htmlFor="meruReference" className="mb-1 block text-sm font-medium text-ink">
              Référence Meru <span className="font-normal text-ink-soft">facultatif</span>
            </label>
            <Input id="meruReference" name="meruReference" defaultValue={meruReference ?? ''} autoComplete="off" />
            <p className="mt-1 text-xs text-ink-muted">Le numéro du transfert dans l’application Meru.</p>
          </div>
        </div>

        {confirming ? (
          <div className="rounded-xl border border-sun bg-sun-soft p-4">
            <p className="flex items-start gap-2 text-[15px] leading-snug text-ink">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-sun-ink" aria-hidden="true" />
              <span className="min-w-0">
                Confirmez que les dollars sont <strong>déjà partis</strong>. Un envoi vers un mauvais compte ne peut
                pas être annulé.
              </span>
            </p>

            {/* The two facts being confirmed, on their own lines and whole.
                Buried in a sentence, a 30-character address ran off the edge
                of the screen — unreadable exactly where it matters most. */}
            <dl className="mt-3 rounded-lg bg-paper/70 p-3">
              <dt className="text-xs font-medium text-ink-soft">Vers</dt>
              <dd className="font-display text-base leading-snug font-semibold break-all text-ink">{meruAccount}</dd>
              <dt className="mt-2 text-xs font-medium text-ink-soft">Pour</dt>
              <dd className="text-[15px] leading-snug break-words text-ink">{customerName}</dd>
              <dt className="mt-2 text-xs font-medium text-ink-soft">Montant enregistré</dt>
              <dd className="font-display text-base font-semibold tnum text-ink">{sentUsd} $ US</dd>
            </dl>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="submit" size="lg" loading={pending} loadingLabel="Enregistrement…" className="sm:flex-1">
                Oui, c’est envoyé
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setConfirming(false)}>
                Revenir
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="lg" onClick={() => setConfirming(true)} className="w-full sm:w-auto">
            Marquer rechargée
          </Button>
        )}

        {state.error ? (
          <Alert tone="danger">{state.error}</Alert>
        ) : state.message ? (
          <Alert tone="success">{state.message}</Alert>
        ) : null}
      </form>

      {whatsappButton ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs text-ink-soft">
            Message prérempli au client ; l’envoi est journalisé comme « WhatsApp manuel ».
          </p>
          {whatsappButton}
          {manual.message ? <p className="mt-2 text-sm text-mint-deep">{manual.message}</p> : null}
          {manual.error ? <p className="mt-2 text-sm text-ink-soft">{manual.error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One value to carry into the Meru app, with the button that copies it.
 *
 * On a phone the value takes the full width and the button sits under it, at
 * full width too: an email address may break anywhere it must, and the thing
 * the thumb has to hit is a bar, not a 100px chip in the corner.
 */
function CopyRow({
  label,
  value,
  suffix,
  copyLabel,
}: {
  label: string;
  value: string;
  suffix?: string;
  copyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-mist px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="font-display text-lg leading-snug font-semibold tracking-tight break-all tnum text-ink">
          {value}
          {suffix ? <span className="ml-2 text-sm font-normal text-ink-muted">{suffix}</span> : null}
        </p>
      </div>
      <CopyButton
        value={value}
        label={copyLabel}
        copiedLabel="Copié"
        size="md"
        variant="ghost"
        className="w-full sm:w-auto"
      />
    </div>
  );
}
