'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export type LocaleSwitcherProps = { className?: string };

/** Français / Kreyòl toggle that keeps the visitor on the same page. */
export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const current = useLocale();
  const pathname = usePathname();
  const t = useTranslations('common');

  return (
    <nav aria-label={t('switchLocale')} className={cn('inline-flex rounded-xl bg-mist p-0.5', className)}>
      {routing.locales.map((locale: AppLocale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            hrefLang={locale}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-[10px] px-3 py-1.5 text-sm font-semibold transition-colors',
              active ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
            )}
          >
            {t(`localeNames.${locale}`)}
          </Link>
        );
      })}
    </nav>
  );
}
