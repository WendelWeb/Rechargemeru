import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/**
 * « Reprendre ma dernière commande MR-… » — shown when the `rm_order` cookie
 * points at an order that is still worth coming back to, so a customer who
 * left mid-payment never has to start over (or pay twice).
 */
export type ResumeBannerProps = {
  reference: string;
  /** Translated status label, e.g. « En attente de paiement ». */
  statusLabel: string;
  className?: string;
};

export function ResumeBanner({ reference, statusLabel, className }: ResumeBannerProps) {
  const t = useTranslations('home');

  return (
    <Alert
      tone="info"
      title={t('resume.title')}
      className={className}
      actions={
        <Link href={`/commande/${reference}`} className={buttonClasses('dark', 'sm')}>
          {t('resume.cta')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
    >
      <span className="tnum">{t('resume.body', { reference, status: statusLabel })}</span>
    </Alert>
  );
}
