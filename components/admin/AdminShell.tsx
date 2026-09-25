'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bell,
  ChartNoAxesColumn,
  Ellipsis,
  ExternalLink,
  LayoutDashboard,
  MessageCircleQuestion,
  MessagesSquare,
  ReceiptText,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/cn';
import { BrandMark } from '@/components/ui/BrandMark';

/**
 * The admin frame: the sections, the signed-in operator and the way out. It
 * lives outside the `[locale]` segment, so every link here is a plain
 * `next/link` — a locale-aware one would prefix `/fr` and break the route
 * (the ESLint rule on `app/admin/**` enforces that).
 *
 * Two shapes, and exactly one is ever on screen:
 *
 * - From `lg` up, a navy sidebar that stays put while the page scrolls: every
 *   section in one column, the count of paid orders waiting beside
 *   « Commandes », the operator's address and the way to the public site at
 *   the foot.
 * - On a phone — where this is mostly used, next to the Meru app — a bar at
 *   the bottom of the screen with the three places the operator goes all day
 *   (tableau de bord, commandes, visites) and « Plus » for the rest, which
 *   opens as a sheet. Four thumb-sized targets instead of six cramped ones.
 *
 * The count of orders to recharge is the one number that follows the
 * operator everywhere: a paid order is somebody waiting for their money.
 *
 * The operator's email is written out next to Clerk's avatar: the avatar
 * alone does not say *which* account is about to send dollars. The shell only
 * ever renders under `requireAdmin()`, so Clerk is configured and its
 * provider is mounted whenever this exists.
 */

type Section = { href: string; label: string; short: string; Icon: LucideIcon; exact: boolean };

const DASHBOARD: Section = { href: '/admin', label: 'Tableau de bord', short: 'Accueil', Icon: LayoutDashboard, exact: true };
const ORDERS: Section = { href: '/admin/commandes', label: 'Commandes', short: 'Commandes', Icon: ReceiptText, exact: false };
const FOLLOW_UPS: Section = { href: '/admin/relances', label: 'Relances', short: 'Relances', Icon: MessageCircleQuestion, exact: false };
const VISITS: Section = { href: '/admin/visites', label: 'Visites', short: 'Visites', Icon: ChartNoAxesColumn, exact: false };
const MORE: Section[] = [
  { href: '/admin/messages', label: 'Messages WhatsApp', short: 'Messages', Icon: MessagesSquare, exact: false },
  { href: '/admin/notifications', label: 'Notifications', short: 'Notifications', Icon: Bell, exact: false },
  { href: '/admin/parametres', label: 'Paramètres', short: 'Paramètres', Icon: SlidersHorizontal, exact: false },
  { href: '/admin/sante', label: 'Santé', short: 'Santé', Icon: Activity, exact: false },
];
const ALL: Section[] = [DASHBOARD, ORDERS, FOLLOW_UPS, VISITS, ...MORE];

export type AdminShellProps = {
  email: string;
  businessName: string;
  /** Live paid + needs_review orders: the badge beside « Commandes ». */
  actionableCount: number;
  /** Unpaid orders of the week nobody has written about yet: the badge beside « Relances ». */
  followUpCount?: number;
  children: ReactNode;
};

/**
 * A count beside a section. Yellow means money waiting (« à recharger »);
 * the quieter mint one means people to write to (« à relancer »).
 */
function Badge({
  count,
  tone = 'sun',
  what = 'à recharger',
  className,
}: {
  count: number;
  tone?: 'sun' | 'mint';
  what?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-bold tnum',
        tone === 'sun' ? 'bg-sun text-ink' : 'bg-mint-deep text-paper',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
      <span className="sr-only"> {what}</span>
    </span>
  );
}

function sectionBadge(section: Section, actionable: number, followUps: number, className?: string) {
  if (section === ORDERS) return <Badge count={actionable} className={className} />;
  if (section === FOLLOW_UPS) return <Badge count={followUps} tone="mint" what="à relancer" className={className} />;
  return null;
}

export function AdminShell({ email, businessName, actionableCount, followUpCount = 0, children }: AdminShellProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(section: Section): boolean {
    return section.exact
      ? pathname === section.href
      : pathname === section.href || pathname.startsWith(`${section.href}/`);
  }

  const moreActive = MORE.some(isActive);

  /*
   * A number field that has the focus changes its value under the mouse
   * wheel — 0.01 per notch on the amount fields. Scrolling past the settings
   * once turned a 10 000 $ US maximum into 9 999,96 without anyone typing a
   * digit. The wheel now scrolls the page and leaves the field alone.
   */
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      const field = event.target;
      if (field instanceof HTMLInputElement && field.type === 'number' && document.activeElement === field) {
        field.blur();
      }
    }
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSheetOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Aller au contenu
      </a>

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        data-surface="dark"
        className="hidden bg-ink text-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"
      >
        <div className="px-5 pt-6 pb-6">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <BrandMark tone="paper" />
            <span className="min-w-0">
              <span className="block truncate font-display text-base leading-tight font-bold tracking-tight">
                {businessName}
              </span>
              <span className="block text-xs text-paper/55">Administration</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Sections de l’administration" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-1">
            {ALL.map((section) => {
              const active = isActive(section);
              const { Icon } = section;
              return (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-[background-color,color] duration-200',
                      active ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10 hover:text-paper',
                    )}
                  >
                    <Icon className="size-[1.15rem] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    {sectionBadge(section, actionableCount, followUpCount)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-paper/10 p-4">
          <a
            href="/fr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-paper/70 transition-colors hover:text-paper"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Voir le site
          </a>
          <div className="flex min-w-0 items-center gap-3 px-1">
            {/* Clerk owns the session: « se déconnecter » is its own menu,
                because signing out has to clear the browser's Clerk state. */}
            <UserButton />
            <span className="min-w-0 truncate text-sm text-paper/70" title={email}>
              {email}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* ── Phone header ──────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2 lg:hidden">
          <Link href="/admin" className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg">
            <BrandMark className="size-7" />
            <span className="min-w-0 truncate font-display text-base font-bold tracking-tight text-ink">
              {businessName}
            </span>
          </Link>
          <UserButton />
        </header>

        <main id="admin-main" className="page-host mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="px-4 py-5 text-center text-xs text-ink-muted sm:px-6 lg:px-10">
          <p className="mb-1 truncate lg:hidden">Connecté avec {email}</p>
          Les envois de dollars sont manuels et irréversibles : vérifiez l’identifiant Meru avant chaque recharge.
        </footer>
      </div>

      {/* ── Phone tab bar ───────────────────────────────────────────── */}
      <nav
        aria-label="Sections de l’administration"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="flex items-stretch">
          {[DASHBOARD, ORDERS, FOLLOW_UPS, VISITS].map((section) => {
            const active = isActive(section);
            const { Icon } = section;
            return (
              <li key={section.href} className="min-w-0 flex-1">
                <Link
                  href={section.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-17 flex-col items-center justify-center gap-1 px-1 transition-colors',
                    active ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  <span
                    className={cn(
                      'relative flex h-8 w-14 items-center justify-center rounded-full transition-[background-color] duration-300',
                      active && 'bg-ink text-paper',
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {sectionBadge(section, actionableCount, followUpCount, 'absolute -top-1 right-1.5 ring-2 ring-paper')}
                  </span>
                  <span className="text-[11px] leading-none font-semibold">{section.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-expanded={sheetOpen}
              aria-controls="admin-more"
              className={cn(
                'flex h-17 w-full flex-col items-center justify-center gap-1 px-1 transition-colors',
                moreActive ? 'text-ink' : 'text-ink-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-full transition-[background-color] duration-300',
                  moreActive && 'bg-ink text-paper',
                )}
              >
                <Ellipsis className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] leading-none font-semibold">Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={() => setSheetOpen(false)} />
          <div
            id="admin-more"
            role="dialog"
            aria-modal="true"
            aria-label="Autres sections"
            className="absolute inset-x-0 bottom-0 animate-sheet rounded-t-[1.75rem] bg-paper px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-base font-semibold text-ink">Plus</p>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Fermer"
                autoFocus
                className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl text-ink-soft hover:bg-mist hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="space-y-1">
              {MORE.map((section) => {
                const active = isActive(section);
                const { Icon } = section;
                return (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      onClick={() => setSheetOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-13 items-center gap-3 rounded-2xl px-3 text-base font-medium transition-colors',
                        active ? 'bg-ink text-paper' : 'text-ink hover:bg-mist',
                      )}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                      {section.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <a
                  href="/fr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-13 items-center gap-3 rounded-2xl px-3 text-base font-medium text-ink hover:bg-mist"
                >
                  <ExternalLink className="size-5" aria-hidden="true" />
                  Voir le site
                </a>
              </li>
            </ul>
            <p className="mt-3 truncate border-t border-line px-3 pt-3 text-xs text-ink-muted">Connecté avec {email}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
