import { cn } from '@/lib/cn';

/**
 * The brand mark alone — a coin rising into a wallet — in a file of its own so
 * the admin (a client tree, outside the locale segment) can use it without
 * importing the public header and its server-only translations.
 */
export function BrandMark({ tone = 'ink', className }: { tone?: 'ink' | 'paper'; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" className={tone === 'ink' ? 'fill-ink' : 'fill-paper'} />
      <circle cx="16" cy="13" r="6.5" className="fill-sun" />
      <path
        d="M7 21.5h18a1.5 1.5 0 0 1 1.5 1.5v1.5A2.5 2.5 0 0 1 24 27H8a2.5 2.5 0 0 1-2.5-2.5V23A1.5 1.5 0 0 1 7 21.5Z"
        className={tone === 'ink' ? 'fill-paper' : 'fill-ink'}
      />
    </svg>
  );
}
