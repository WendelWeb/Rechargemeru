import { MessageCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { AccountMenu } from './AccountMenu';
import { LocaleSwitcher } from './LocaleSwitcher';

/** `https://wa.me/<digits>` for an E.164 number, or null when none is configured. */
export function whatsappLink(e164: string | null, text?: string): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export type WordmarkProps = { name: string; tone?: 'ink' | 'paper'; className?: string };

/** The brand: a coin rising into a wallet, then the name. */
export function Wordmark({ name, tone = 'ink', className }: WordmarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="32" height="32" rx="9" className={tone === 'ink' ? 'fill-ink' : 'fill-paper'} />
        <circle cx="16" cy="13" r="6.5" className="fill-sun" />
        <path
          d="M7 21.5h18a1.5 1.5 0 0 1 1.5 1.5v1.5A2.5 2.5 0 0 1 24 27H8a2.5 2.5 0 0 1-2.5-2.5V23A1.5 1.5 0 0 1 7 21.5Z"
          className={tone === 'ink' ? 'fill-paper' : 'fill-ink'}
        />
      </svg>
      <span
        className={cn(
          'font-display text-lg font-bold tracking-tight',
          tone === 'ink' ? 'text-ink' : 'text-paper',
        )}
      >
        {name}
      </span>
    </span>
  );
}

const NAV = [
  { href: '/', key: 'home' },
  { href: '/suivi', key: 'track' },
  { href: '/faq', key: 'faq' },
  { href: '/conditions', key: 'terms' },
] as const;

/**
 * What the header needs to know about customer accounts. `null` — the
 * default — means accounts are switched off (no Clerk keys) and the header
 * says nothing about them at all, exactly as before they existed.
 *
 * The layout resolves this: reading the session needs Clerk's server module,
 * which must stay out of the browser bundle this file also feeds.
 */
export type HeaderAccount = { signedIn: boolean };

export type SiteHeaderProps = {
  businessName: string;
  supportWhatsapp: string | null;
  account?: HeaderAccount | null;
};

/**
 * The site header. An account is a convenience, never a gate, so it stays
 * quiet up here: a plain link to sign in, a mist-grey button to create an
 * account, and once signed in only the avatar menu — the accent colour is
 * reserved for the one button that takes money.
 *
 * Below `md` the account links move into the scrolling nav strip, where
 * there is room for them; the avatar stays visible at every width because it
 * is the way out of a session.
 */
export async function SiteHeader({ businessName, supportWhatsapp, account = null }: SiteHeaderProps) {
  const t = await getTranslations('common');
  const support = whatsappLink(supportWhatsapp);

  const linkClass =
    'rounded-lg px-3 py-2 text-[15px] font-medium text-ink-soft transition-colors hover:bg-mist hover:text-ink';

  const accountNav: { href: string; label: string }[] =
    account === null
      ? []
      : account.signedIn
        ? [{ href: '/mes-commandes', label: t('account.myOrders') }]
        : [
            { href: '/connexion', label: t('account.signIn') },
            { href: '/inscription', label: t('account.signUp') },
          ];

  return (
    <header className="border-b border-line bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {t('skipToContent')}
      </a>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="rounded-lg">
          <Wordmark name={businessName} />
        </Link>

        <nav aria-label={t('brand')} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className={linkClass}>
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {support ? (
            <a
              href={support}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink transition-colors hover:border-mint hover:text-mint-deep"
            >
              <MessageCircle className="size-4 text-mint" aria-hidden="true" />
              <span className="hidden sm:inline">{t('nav.support')}</span>
              <span className="sr-only sm:hidden">{t('nav.support')}</span>
            </a>
          ) : null}

          {account === null ? null : account.signedIn ? (
            <AccountMenu linkClassName={cn(linkClass, 'hidden md:inline-flex')} />
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/connexion" className={linkClass}>
                {t('account.signIn')}
              </Link>
              <Link href="/inscription" className={buttonClasses('secondary', 'sm')}>
                {t('account.signUp')}
              </Link>
            </div>
          )}

          <LocaleSwitcher />
        </div>
      </div>

      <nav aria-label={t('brand')} className="border-t border-line md:hidden">
        <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 py-1 sm:px-4">
          {NAV.map((item) => (
            <li key={item.key} className="shrink-0">
              <Link href={item.href} className={cn(linkClass, 'text-sm')}>
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          ))}
          {accountNav.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link href={item.href} className={cn(linkClass, 'text-sm')}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
