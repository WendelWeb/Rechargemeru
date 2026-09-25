import { MessageCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { BrandMark } from '@/components/ui/BrandMark';
import { buttonClasses } from '@/components/ui/Button';
import { AccountMenu } from './AccountMenu';
import { LocaleSwitcher } from './LocaleSwitcher';
import { MobileMenu } from './MobileMenu';
import { SiteNav, type SiteNavEntry } from './SiteNav';

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
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark tone={tone} />
      <span
        className={cn(
          'truncate font-display text-lg font-bold tracking-tight',
          tone === 'ink' ? 'text-ink' : 'text-paper',
        )}
      >
        {name}
      </span>
    </span>
  );
}

const NAV = [
  { href: '/', key: 'home', short: null },
  { href: '/suivi', key: 'track', short: 'trackShort' },
  { href: '/faq', key: 'faq', short: 'faqShort' },
  { href: '/conditions', key: 'terms', short: null },
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
 * account, and once signed in only the avatar — the accent colour is
 * reserved for the one button that takes money.
 *
 * On a phone the row holds four things and nothing else: the wordmark (the
 * one that gives, `min-w-0` + `truncate`), the language switch, WhatsApp
 * support as a square 44px target, and the menu button — every other link
 * lives in the panel it opens. From `lg` up the links come back into the row.
 */
export async function SiteHeader({ businessName, supportWhatsapp, account = null }: SiteHeaderProps) {
  const t = await getTranslations('common');
  const support = whatsappLink(supportWhatsapp);

  const desktopLinkClass =
    'inline-flex min-h-tap items-center rounded-lg px-3 text-[15px] font-medium text-ink-soft transition-colors hover:bg-mist hover:text-ink';

  const navEntries: SiteNavEntry[] = NAV.map((item) => ({
    href: item.href,
    label: t(`nav.${item.key}`),
    short: item.short ? t(`nav.${item.short}`) : undefined,
  }));

  const accountNav: SiteNavEntry[] =
    account === null
      ? []
      : account.signedIn
        ? [{ href: '/mes-commandes', label: t('account.myOrders') }]
        : [
            { href: '/connexion', label: t('account.signIn') },
            { href: '/inscription', label: t('account.signUp') },
          ];

  return (
    <header className="relative z-40 border-b border-line bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {t('skipToContent')}
      </a>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-gutter py-2 sm:gap-3 sm:py-3">
        <Link href="/" className="inline-flex min-h-tap min-w-0 items-center rounded-lg lg:shrink-0">
          <Wordmark name={businessName} />
        </Link>

        <SiteNav entries={navEntries} ariaLabel={t('nav.primary')} layout="row" className="hidden min-w-0 lg:block" />

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {account === null ? null : account.signedIn ? (
            <AccountMenu linkClassName={cn(desktopLinkClass, 'hidden lg:inline-flex')} />
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link href="/connexion" className={desktopLinkClass}>
                {t('account.signIn')}
              </Link>
              <Link href="/inscription" className={buttonClasses('secondary', 'sm')}>
                {t('account.signUp')}
              </Link>
            </div>
          )}

          <LocaleSwitcher />

          {support ? (
            <a
              href={support}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('nav.support')}
              title={t('nav.support')}
              className="hidden min-h-tap min-w-tap shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink transition-colors hover:border-mint hover:text-mint-deep sm:inline-flex"
            >
              <MessageCircle className="size-5 shrink-0 text-mint xl:size-4" aria-hidden="true" />
              <span className="hidden xl:inline">{t('nav.support')}</span>
            </a>
          ) : null}

          <MobileMenu
            entries={[...navEntries, ...accountNav]}
            ariaLabel={t('nav.primary')}
            openLabel={t('nav.menu')}
            closeLabel={t('nav.close')}
            support={support ? { href: support, label: t('nav.support') } : null}
            className="lg:hidden"
          />
        </div>
      </div>
    </header>
  );
}
