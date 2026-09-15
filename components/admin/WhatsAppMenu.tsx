'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { recordManualWhatsAppAction, type ActionState } from '@/lib/admin/actions';
import type { WhatsAppMessage } from '@/lib/admin/whatsapp-messages';

/**
 * Le menu « Écrire au client », à un pouce.
 *
 * WhatsApp est le canal manuel de cette plateforme : le lien `wa.me` ouvre
 * l'application sur le téléphone de l'opérateur avec le texte déjà écrit, il
 * relit, il envoie. Aucune API, aucun document d'entreprise, et le message
 * part de son vrai numéro — ce qui, pour un service qui manipule l'argent de
 * quelqu'un, inspire plus confiance qu'un numéro inconnu.
 *
 * Trois partis pris :
 *
 *   - LE TEXTE EST VISIBLE AVANT L'ENVOI. Chaque message montre son début, et
 *     la vue « lire en entier » déplie le reste. On n'envoie pas à l'aveugle
 *     un texte qui parle d'argent.
 *   - LES MESSAGES CONSEILLÉS D'ABORD, séparés du reste par un titre. L'état
 *     de la commande suggère, il n'enferme pas : la vraie vie déborde toujours
 *     de la machine à états.
 *   - L'ENVOI EST JOURNALISÉ. Ouvrir le lien enregistre une ligne
 *     `whatsapp_manual` : l'historique de la commande reste complet même quand
 *     le message part d'un autre appareil.
 *
 * Le journal est « au mieux » : si l'enregistrement échoue, WhatsApp s'ouvre
 * quand même. Perdre une ligne d'historique est un ennui ; empêcher
 * l'opérateur de répondre à un client qui attend son argent en est un autre.
 */

export type WhatsAppMenuProps = {
  orderId: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  messages: WhatsAppMessage[];
  /** `compact` pour les cartes de liste, `full` pour la fiche de commande. */
  variant?: 'compact' | 'full';
  className?: string;
};

const TONE_RING: Record<WhatsAppMessage['tone'], string> = {
  primary: 'border-mint text-mint-deep',
  caution: 'border-sun-deep text-sun-ink',
  neutral: 'border-line-strong text-ink-soft',
};

function href(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

export function WhatsAppMenu({
  orderId,
  reference,
  customerName,
  customerPhone,
  messages,
  variant = 'full',
  className,
}: WhatsAppMenuProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [, startRecording] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (messages.length === 0) return null;

  const digits = customerPhone.replace(/\D/g, '');
  if (!digits) return null;

  function note(message: WhatsAppMessage) {
    setSent((s) => (s.includes(message.id) ? s : [...s, message.id]));
    startRecording(async () => {
      // Volontairement ignoré : voir l'en-tête, le journal ne bloque pas.
      (await recordManualWhatsAppAction(orderId, message.id)) satisfies ActionState;
    });
  }

  const recommended = messages.filter((m) => m.recommended);
  const others = messages.filter((m) => !m.recommended);

  const trigger =
    variant === 'compact' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Écrire à ${customerName} sur WhatsApp`}
        title="Écrire sur WhatsApp"
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border border-line-strong bg-paper text-mint-deep transition-colors hover:border-mint hover:bg-mint-soft"
      >
        <MessageCircle className="size-5" aria-hidden="true" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-xl border border-mint bg-mint-soft px-4 font-semibold text-mint-deep transition-colors hover:bg-mint hover:text-paper sm:w-auto"
      >
        <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
        Écrire au client sur WhatsApp
      </button>
    );

  return (
    <div className={cn('contents', className)}>
      {trigger}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Messages WhatsApp pour ${reference}`}
            className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-card bg-paper shadow-card sm:rounded-card"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-ink">Écrire à {customerName}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {reference} · le message s’ouvre dans WhatsApp, vous relisez avant d’envoyer
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-mist hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {recommended.length > 0 ? (
                <Section title="Conseillé pour cette commande">
                  {recommended.map((m) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      phone={customerPhone}
                      expanded={expanded === m.id}
                      onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
                      onSend={() => note(m)}
                      alreadySent={sent.includes(m.id)}
                    />
                  ))}
                </Section>
              ) : null}

              {others.length > 0 ? (
                <Section title={recommended.length > 0 ? 'Autres messages' : 'Messages disponibles'}>
                  {others.map((m) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      phone={customerPhone}
                      expanded={expanded === m.id}
                      onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
                      onSend={() => note(m)}
                      alreadySent={sent.includes(m.id)}
                    />
                  ))}
                </Section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 font-display text-xs font-bold tracking-wide text-ink-muted">{title}</h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function MessageRow({
  message,
  phone,
  expanded,
  onToggle,
  onSend,
  alreadySent,
}: {
  message: WhatsAppMessage;
  phone: string;
  expanded: boolean;
  onToggle: () => void;
  onSend: () => void;
  alreadySent: boolean;
}) {
  const preview = message.body.replace(/\s+/g, ' ').trim();

  return (
    <li className={cn('rounded-xl border bg-paper p-3', TONE_RING[message.tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug font-semibold text-ink">
            {message.label}
            {alreadySent ? (
              <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-mint-deep">
                <Check className="size-3.5" aria-hidden="true" />
                ouvert
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{message.hint}</p>
        </div>
      </div>

      <p className={cn('mt-2 text-sm whitespace-pre-line text-ink-soft', expanded ? '' : 'line-clamp-2')}>
        {expanded ? message.body : preview}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={href(phone, message.body)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onSend}
          className="inline-flex min-h-tap flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-opacity hover:opacity-90"
        >
          <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
          Ouvrir dans WhatsApp
        </a>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex min-h-tap items-center rounded-xl border border-line-strong px-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink-muted hover:text-ink"
        >
          {expanded ? 'Replier' : 'Lire en entier'}
        </button>
      </div>
    </li>
  );
}
