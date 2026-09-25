'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export type LocaleSwitcherProps = { className?: string };

/**
 * Français / Kreyòl toggle that keeps the visitor on the same page.
 *
 * It shows the two-letter code until `xl`: « Français » and « Kreyòl » are
 * unbreakable words worth some 160px, and the header row has to seat a
 * wordmark, a support button and the account links before them — at 360px
 * there is nothing like the room, and between 640 and 1280 there is only just
 * enough for one of the two. The full name stays as the accessible name, so
 * nothing is lost to a screen reader.
 */
export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const current = useLocale();
  const pathname = usePathname();
  const t = useTranslations('common');

  return (
    <nav aria-label={t('switchLocale')} className={cn('inline-flex rounded-xl bg-mist p-0.5', className)}>
      {routing.locales.map((locale: AppLocale) => {
        const active = locale === current;
        const name = t(`localeNames.${locale}`);
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            hrefLang={locale}
            aria-label={name}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'inline-flex min-h-tap items-center justify-center rounded-[10px] px-2.5 text-sm font-semibold transition-colors sm:px-3',
              active ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
            )}
          >
            <span className="xl:hidden" aria-hidden="true">
              {locale.toUpperCase()}
            </span>
            <span className="hidden xl:inline" aria-hidden="true">
              {name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
