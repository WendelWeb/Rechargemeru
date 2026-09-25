'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { MessageCircle } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { SiteNavEntry } from './SiteNav';

export type MobileMenuProps = {
  entries: SiteNavEntry[];
  ariaLabel: string;
  openLabel: string;
  closeLabel: string;
  /** WhatsApp support, which leaves the header row below `sm` and lands here. */
  support?: { href: string; label: string } | null;
  className?: string;
};

/**
 * The phone's navigation: one button, and the links in a panel that unfolds
 * under the header.
 *
 * It replaces a strip of links that scrolled sideways under the header — six
 * destinations of which a 360px screen showed three, and 45px of permanent
 * height between the customer and the form. The form is what nearly every
 * visitor came for; « Conditions » and « Questions fréquentes » can live one
 * tap away.
 *
 * The panel closes on a link (the page changes under it), on Escape and on a
 * tap outside it. While closed it is `inert`, so neither a keyboard nor a
 * screen reader can wander into links nobody can see.
 */
export function MobileMenu({ entries, ariaLabel, openLabel, closeLabel, support = null, className }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const bar = 'absolute left-0 h-0.5 w-5 rounded-full bg-ink transition-[transform,opacity] duration-300 ease-out';

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border border-line-strong bg-paper transition-colors hover:border-ink"
      >
        <span className="relative block h-3.5 w-5" aria-hidden="true">
          <span className={cn(bar, 'top-0', open && 'translate-y-1.5 rotate-45')} />
          <span className={cn(bar, 'top-1.5', open && 'opacity-0')} />
          <span className={cn(bar, 'top-3', open && '-translate-y-1.5 -rotate-45')} />
        </span>
      </button>

      {/* The page under the panel dims, and a tap on it closes the menu. */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          'absolute inset-x-0 top-full h-dvh bg-ink/25 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div id="site-menu" className="reveal absolute inset-x-0 top-full" data-open={open} inert={!open}>
        <div>
          <nav aria-label={ariaLabel} className="border-b border-line bg-paper">
            <ul className="mx-auto max-w-6xl px-gutter py-3">
              {entries.map((entry, index) => {
                const active = pathname === entry.href;
                return (
                  <li
                    key={entry.href}
                    style={{ '--i': index } as CSSProperties}
                    className={cn(open && 'animate-drop stagger')}
                  >
                    <Link
                      href={entry.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex min-h-13 items-center rounded-xl px-3 font-display text-lg font-semibold transition-colors',
                        active ? 'bg-mist text-ink' : 'text-ink-soft hover:bg-mist hover:text-ink',
                      )}
                    >
                      {entry.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {support ? (
              <div className="mx-auto max-w-6xl px-gutter pb-4 sm:hidden">
                <a
                  href={support.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-mint-deep px-4 font-semibold text-paper"
                >
                  <MessageCircle className="size-5" aria-hidden="true" />
                  {support.label}
                </a>
              </div>
            ) : null}
          </nav>
        </div>
      </div>
    </div>
  );
}
