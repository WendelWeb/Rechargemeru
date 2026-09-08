'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, ExternalLink, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatDateTime, formatHtg } from '@/lib/format';
import type { PaymentMethod } from '@/lib/orders/types';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import { whatsappLink } from './SiteHeader';

/**
 * « Commande créée » — the half-second between our site and the provider's.
 *
 * The redirection is no longer waiting for a tap: `RechargeWidget` calls
 * `window.location.assign` the moment `POST /api/orders` answers, and this
 * screen is what the customer sees while the browser leaves. It is therefore
 * written as a transition, not as a destination — it says what is happening
 * (« Redirection vers MonCash… ») rather than asking for a decision.
 *
 * Two things it must still do, because a redirect started by a script is not
 * a promise:
 *
 * - **the reference, in full, immediately.** It travels by email and WhatsApp
 *   too, and the `rm_order` cookie (already set by the response that carried
 *   this reference) brings the customer back through « Reprendre ma dernière
 *   commande », but the number is on screen and copyable before anything
 *   moves — on a slow connection this screen may be all there is for seconds;
 * - **a real `<a href>` to the provider, visible from the first frame.** A
 *   pop-up blocker, an in-app WebView or a script error can swallow the
 *   automatic navigation, and the customer must not be left staring at a
 *   sentence that lies. It is a link, not a button, so it survives whatever
 *   stopped the script and can be opened long-press.
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
  const methodLabel = METHOD_LABELS[method];
  const support = whatsappLink(supportWhatsapp, t('created.supportMessage', { reference }));

  /**
   * A customer who taps « retour » on the provider's page lands back on this
   * very DOM, restored from the back/forward cache with every pixel — and
   * every animation — exactly as it was frozen. The redirection is over by
   * then, whatever it achieved, so the line must stop claiming it is under
   * way: a dot pulsing forever under « Redirection vers MonCash… » is the one
   * thing this screen must never do.
   */
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setReturned(true);
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

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
        {/*
          The site's own waiting mark (same pulse as the verification poller),
          and the one live region of this screen: it carries the reference so
          a screen reader hears the number before the page is replaced.
        */}
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft" role="status">
          {returned ? null : (
            <span
              className="size-2 shrink-0 animate-pulse rounded-full bg-sun-ink motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          <span>
            <span className="sr-only">
              {t('created.title')} {reference}.{' '}
            </span>
            {returned ? t('created.redirect.returned') : t('created.redirect.status', { method: methodLabel })}
          </span>
        </p>
      </div>

      {sandbox ? <Alert tone="warning">{t('created.sandbox')}</Alert> : null}

      <div className="space-y-2">
        <a href={redirectUrl} className={buttonClasses('dark', 'lg', 'w-full')}>
          {/* The sentence on its own line and the amount underneath: the
              fallback has to name what the tap does, and at 360px a single
              line of both had nowhere to go. */}
          <span className="flex flex-col items-center leading-tight">
            <span>{t('created.redirect.fallback')}</span>
            <span className="text-caption font-normal opacity-80">
              {t('created.redirect.fallbackDetail', { total: formatHtg(totalHtg), method: methodLabel })}
            </span>
          </span>
        </a>
        <p className="text-sm leading-relaxed text-ink-soft">{t('created.redirect.hint', { method: methodLabel })}</p>
      </div>

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
    </div>
  );
}
