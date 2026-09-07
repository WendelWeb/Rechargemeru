import type { ReactNode } from 'react';
import { BadgeCheck, MessageCircle, Receipt, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type TrustKind = 'feesVisible' | 'verified' | 'tracking' | 'support';

const ICONS: Record<TrustKind, typeof Receipt> = {
  feesVisible: Receipt,
  verified: BadgeCheck,
  tracking: Search,
  support: MessageCircle,
};

export type TrustLineProps = {
  kind: TrustKind;
  /** Custom sentence; defaults to `common.trust.<kind>`. */
  children?: ReactNode;
  className?: string;
};

/** One reason to trust the service: an icon and a short sentence. */
export function TrustLine({ kind, children, className }: TrustLineProps) {
  const t = useTranslations('common');
  const Icon = ICONS[kind];
  return (
    <p className={cn('flex items-start gap-2.5 text-sm leading-snug text-ink-soft', className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden="true" />
      <span>{children ?? t(`trust.${kind}`)}</span>
    </p>
  );
}
