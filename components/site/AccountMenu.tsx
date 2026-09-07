'use client';

import { UserButton } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * The signed-in corner of the header: a shortcut to one's own orders and
 * Clerk's avatar menu (profile, sign out).
 *
 * It is mounted only once the header knows somebody is signed in, which also
 * means `<ClerkProvider>` is up — Clerk components throw outside it. Signing
 * out has to clear browser state, so it belongs to Clerk's own menu rather
 * than to a Server Action.
 *
 * Clerk's theme variables are repeated here instead of imported from
 * `lib/auth/clerk.ts`: that module reaches for Clerk's Backend API and must
 * never be pulled into the browser bundle.
 */

export type AccountMenuProps = {
  /** The header's own link styling, handed down so both nav rows match. */
  linkClassName: string;
};

export function AccountMenu({ linkClassName }: AccountMenuProps) {
  const t = useTranslations('common');

  return (
    <div className="flex items-center gap-1">
      <Link href="/mes-commandes" className={linkClassName}>
        {t('account.myOrders')}
      </Link>
      <UserButton
        appearance={{
          variables: {
            colorPrimary: '#0e1b3d',
            colorForeground: '#0e1b3d',
            colorMutedForeground: '#4a5578',
            colorBorder: '#d9e0ec',
            borderRadius: '0.75rem',
            fontFamily: 'var(--font-figtree), Figtree, ui-sans-serif, system-ui, sans-serif',
          },
        }}
      />
    </div>
  );
}
