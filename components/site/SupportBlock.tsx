import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/phone';
import { whatsappLink } from './SiteHeader';

export type SupportBlockProps = {
  supportWhatsapp: string | null;
  /** Operator's support hours, e.g. « 8 h – 20 h, 7 j/7 ». */
  supportHours: string;
  className?: string;
};

/**
 * The person behind the service, and the way to reach them. The number is
 * written out on the button: « Écrire sur WhatsApp » alone could lead
 * anywhere, a Haitian number the customer can read says who answers.
 */
export function SupportBlock({ supportWhatsapp, supportHours, className }: SupportBlockProps) {
  const t = useTranslations('home');
  const href = whatsappLink(supportWhatsapp);
  const number = supportWhatsapp?.startsWith('+') ? formatPhone(supportWhatsapp) : supportWhatsapp;

  return (
    <section className={cn('mx-auto max-w-6xl px-gutter', className)} aria-labelledby="support-title">
      <div className="grid gap-5 rounded-[1.75rem] bg-mist p-card sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10">
        <div>
          <h2 id="support-title" className="font-display text-title font-semibold tracking-tight text-ink">
            {t('support.title')}
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            {t('support.body', { hours: supportHours })}
          </p>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-13 flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 rounded-xl bg-mint-deep px-5 py-2.5 font-semibold text-paper transition-[background-color,transform] duration-200 hover:bg-[#0b6644] active:translate-y-px"
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
              {t('support.cta')}
            </span>
            {number ? (
              <span className="font-display font-medium whitespace-nowrap tnum opacity-85">{number}</span>
            ) : null}
          </a>
        ) : null}
      </div>
    </section>
  );
}
