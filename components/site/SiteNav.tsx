'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

/**
 * The site's navigation, in the two shapes the header needs: a row of links
 * on a desk, a scrolling strip on a phone.
 *
 * It is a client component for one reason — `aria-current`. Nothing else on
 * the public site told a visitor which page they were on, though the admin
 * has done it since day one. Labels are resolved by the server and handed
 * down, so no message bundle crosses into the browser for this.
 */
export type SiteNavEntry = {
  href: string;
  label: string;
  /** Shown below `sm`, where « Suivre ma commande » does not fit. */
  short?: string;
};

export type SiteNavProps = {
  entries: SiteNavEntry[];
  ariaLabel: string;
  /** `row` is the md+ header row; `strip` is the scrolling mobile band. */
  layout: 'row' | 'strip';
  className?: string;
  /** The strip scrolls: fade its right edge so the fact is visible. */
  scrollable?: boolean;
};

const LINK_BASE =
  'inline-flex min-h-tap items-center rounded-lg px-3 font-medium transition-colors hover:bg-mist hover:text-ink';

export function SiteNav({ entries, ariaLabel, layout, className, scrollable = false }: SiteNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        className={cn(
          'flex items-center gap-1',
          layout === 'strip' &&
            'mx-auto max-w-6xl snap-x snap-mandatory scroll-px-2 overflow-x-auto px-2 py-1 sm:px-4',
          layout === 'strip' && scrollable && 'scroll-fade-x',
        )}
      >
        {entries.map((entry) => {
          const active = pathname === entry.href;
          return (
            <li key={entry.href} className="shrink-0 snap-start">
              <Link
                href={entry.href}
                // « Suivre ma commande » is 175 unbreakable pixels. The header
                // row is capped at the page's own 1152px and has to seat a
                // wordmark, a support button, two account links and the
                // language switch first — so the visible label is the short
                // one at every width, and the full sentence is what a screen
                // reader announces.
                aria-label={entry.short ? entry.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  LINK_BASE,
                  layout === 'strip' ? 'text-sm' : 'text-[15px]',
                  active ? 'bg-mist text-ink' : 'text-ink-soft',
                )}
              >
                {entry.short ?? entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
