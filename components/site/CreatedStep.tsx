'use client';

import { useState } from 'react';
import { CircleCheck, ExternalLink, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatDateTime, formatHtg } from '@/lib/format';
import type { PaymentMethod } from '@/lib/orders/types';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import { whatsappLink } from './SiteHeader';

/**
 * « Commande créée » — still on our site, on purpose: the customer leaves
 * with the reference in hand (and copied) before the provider takes over.
 * One big button starts the redirection; everything else is a way back to us.
 */
export type CreatedStepProps = {
  reference: string;
  redirectUrl: string;
  totalHtg: number;
  method: PaymentMethod;
  expiresAt: Date | null;
  supportWhatsapp: string | null;
  sandbox: boolean;
  copyLabel: string;
  copiedLabel: string;
};

export function CreatedStep({
  reference,
  redirectUrl,
  totalHtg,
  method,
  expiresAt,
  supportWhatsapp,
  sandbox,
  copyLabel,
  copiedLabel,
}: CreatedStepProps) {
  const t = useTranslations('home');
  const [redirecting, setRedirecting] = useState(false);
  const methodLabel = METHOD_LABELS[method];
  const support = whatsappLink(supportWhatsapp, t('created.supportMessage', { reference }));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-mint" aria-hidden="true" />
        <div>
          <CardTitle as="h2">{t('created.title')}</CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t('created.keep')}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-mist p-4 sm:p-5">
        <p className="text-sm text-ink-soft">{t('created.reference')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="font-display tnum text-2xl font-bold tracking-wide text-ink sm:text-3xl">{reference}</p>
          <CopyButton
            value={reference}
            label={copyLabel}
            copiedLabel={copiedLabel}
            size="md"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      {sandbox ? <Alert tone="warning">{t('created.sandbox')}</Alert> : null}

      <Button
        variant="dark"
        size="lg"
        className="w-full"
        loading={redirecting}
        loadingLabel={t('created.redirecting', { method: methodLabel })}
        onClick={() => {
          setRedirecting(true);
          window.location.assign(redirectUrl);
        }}
      >
        {/* « Payer 3 360 HTG » on its own line and the rail underneath: the
            total is the information, and at 360px a single 29-character line
            had nowhere to go. */}
        <span className="flex flex-col items-center leading-tight">
          <span>{t('created.pay', { total: formatHtg(totalHtg) })}</span>
          <span className="text-caption font-normal opacity-80">
            {t('created.payWith', { method: methodLabel })}
          </span>
        </span>
      </Button>

      {expiresAt ? (
        <p className="text-sm text-ink-soft">{t('created.expires', { time: formatDateTime(expiresAt) })}</p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <Link href={`/commande/${reference}`} className={buttonClasses('ghost', 'md', 'w-full sm:w-auto')}>
          <ExternalLink className="size-4" aria-hidden="true" />
          {t('created.track')}
        </Link>
        {support ? (
          <a
            href={support}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('ghost', 'md', 'w-full sm:w-auto')}
          >
            <MessageCircle className="size-4 text-mint" aria-hidden="true" />
            {t('created.support')}
          </a>
        ) : null}
      </div>

      <p className="sr-only" role="status">
        {t('created.title')} {reference}
      </p>
    </div>
  );
}
