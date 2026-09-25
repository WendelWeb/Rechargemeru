'use client';

import { useState, useTransition } from 'react';
import { Check, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/cn';
import { recordManualWhatsAppAction } from '@/lib/admin/actions';

export type QuickWhatsAppProps = {
  orderId: string;
  /** The ready `wa.me` link, text included. */
  href: string;
  /** What the order history records, `id@tone`. */
  journalLabel: string;
  label: string;
  className?: string;
};

/**
 * One tap, one message: the operator's most frequent follow-up, opened in
 * WhatsApp already written, in his default tone and the customer's language.
 * The send is journaled (best effort) and the page refreshes itself, so the
 * order moves to « Déjà relancées » without reloading anything.
 */
export function QuickWhatsApp({ orderId, href, journalLabel, label, className }: QuickWhatsAppProps) {
  const [opened, setOpened] = useState(false);
  const [, startRecording] = useTransition();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setOpened(true);
        startRecording(async () => {
          await recordManualWhatsAppAction(orderId, journalLabel);
        });
      }}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mint-deep px-4 text-sm font-semibold text-paper transition-[background-color,transform] duration-150 hover:bg-[#0b6644] active:translate-y-px',
        className,
      )}
    >
      {opened ? (
        <Check className="size-4 shrink-0 animate-pop" aria-hidden="true" />
      ) : (
        <MessageCircleQuestion className="size-4 shrink-0" aria-hidden="true" />
      )}
      {label}
    </a>
  );
}
