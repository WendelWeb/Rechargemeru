'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bell, LayoutDashboard, ReceiptText, SlidersHorizontal } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/cn';

/**
 * The admin frame: one bar with the sections, the signed-in operator and the
 * way out. It lives outside the `[locale]` segment, so every link here is a
 * plain `next/link` — a locale-aware one would prefix `/fr` and break the
 * route (the ESLint rule on `app/admin/**` enforces that).
 *
 * The operator's email is shown as text next to Clerk's `<UserButton />`: the
 * avatar alone does not say *which* account is about to send dollars, and
 * that is the one thing worth reading before pressing « Marquer rechargée ».
 * The shell only ever renders under `requireAdmin()`, so Clerk is configured
 * and its provider is mounted whenever this component exists.
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

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <Link href="/admin" className="rounded-lg font-display text-base font-bold tracking-tight text-ink">
              {businessName}
            </Link>
            <span className="truncate text-sm text-ink-muted">administration</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-ink-soft sm:inline">{email}</span>
            {/* Clerk owns the session: the account menu — and « se déconnecter »
                with it — is its own component, because signing out has to clear
                the browser's Clerk state, which a Server Action cannot do. */}
            <UserButton />
          </div>
        </div>

        <nav aria-label="Sections de l’administration" className="border-t border-line">
          <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-1 sm:px-4">
            {SECTIONS.map(({ href, label, Icon, exact }) => {
              const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
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

      <main id="admin-main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-line px-4 py-4 text-center text-xs text-ink-muted sm:px-6">
        Les envois de dollars sont manuels et irréversibles : vérifiez l’identifiant Meru avant chaque recharge.
      </footer>
    </div>
  );
}
