'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bell, LayoutDashboard, ReceiptText, SlidersHorizontal } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/cn';

/**
 * The admin frame: the sections, the signed-in operator and the way out. It
 * lives outside the `[locale]` segment, so every link here is a plain
 * `next/link` — a locale-aware one would prefix `/fr` and break the route
 * (the ESLint rule on `app/admin/**` enforces that).
 *
 * The navigation exists twice, and exactly one of the two is ever rendered.
 *
 * - On a phone it is a fixed bar at the bottom of the screen: five sections,
 *   five thumb-sized targets, all five visible. The strip it replaces was a
 *   horizontally scrolling row where « Santé » and « Notifications » sat past
 *   the right edge of a 360px screen with nothing to say they were there.
 * - From `sm` up the strip comes back under the header, where there is room
 *   for it and where the pointer is faster than a thumb.
 *
 * The operator's email is shown as text next to Clerk's `<UserButton />`: the
 * avatar alone does not say *which* account is about to send dollars, and
 * that is the one thing worth reading before pressing « Marquer rechargée ».
 * On a phone the header has no room for it, so it moves to the footer rather
 * than disappearing. The shell only ever renders under `requireAdmin()`, so
 * Clerk is configured and its provider is mounted whenever this exists.
 */

const SECTIONS = [
  { href: '/admin', label: 'Tableau de bord', Icon: LayoutDashboard, exact: true },
  { href: '/admin/commandes', label: 'Commandes', Icon: ReceiptText, exact: false },
  { href: '/admin/parametres', label: 'Paramètres', Icon: SlidersHorizontal, exact: false },
  { href: '/admin/sante', label: 'Santé', Icon: Activity, exact: false },
  { href: '/admin/notifications', label: 'Notifications', Icon: Bell, exact: false },
] as const;

export type AdminShellProps = {
  email: string;
  businessName: string;
  children: ReactNode;
};

export function AdminShell({ email, businessName, children }: AdminShellProps) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean): boolean {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    // The bottom bar is fixed, so the page reserves its height — plus the
    // home indicator's — or the last line of every page sits under it.
    <div className="flex min-h-screen flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Aller au contenu
      </a>

      {/* Sticky only where it costs nothing: on a 640px-tall phone the bottom
          bar is already always visible, and 48px of permanent header is 8% of
          the screen the operator works in. */}
      <header className="border-b border-line bg-paper/95 backdrop-blur sm:sticky sm:top-0 sm:z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6 sm:py-2.5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <Link
              href="/admin"
              className="inline-flex min-h-11 min-w-0 items-center rounded-lg font-display text-base font-bold tracking-tight text-ink"
            >
              <span className="truncate">{businessName}</span>
            </Link>
            <span className="hidden truncate text-sm text-ink-muted sm:inline">administration</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-ink-soft sm:inline">{email}</span>
            {/* Clerk owns the session: the account menu — and « se déconnecter »
                with it — is its own component, because signing out has to clear
                the browser's Clerk state, which a Server Action cannot do. */}
            <UserButton />
          </div>
        </div>

        <nav aria-label="Sections de l’administration" className="hidden border-t border-line sm:block">
          <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1 sm:px-4">
            {SECTIONS.map(({ href, label, Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                      active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-mist hover:text-ink',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main id="admin-main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-muted sm:px-6">
        <p className="mb-1 truncate sm:hidden">Connecté avec {email}</p>
        Les envois de dollars sont manuels et irréversibles : vérifiez l’identifiant Meru avant chaque recharge.
      </footer>

      <nav
        aria-label="Sections de l’administration"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="flex items-stretch">
          {SECTIONS.map(({ href, label, Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-[4.5rem] flex-col items-center justify-center gap-1 px-1 text-center transition-colors',
                    active ? 'text-ink' : 'text-ink-soft',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active && 'bg-ink text-paper',
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {/* A fixed two-line box: « Tableau de bord » wraps and the
                      other four do not, and without it their icons would sit
                      half a line higher than its own. */}
                  <span className="flex h-[1.7rem] w-full items-start justify-center text-[10px] leading-tight font-medium break-words hyphens-auto">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
