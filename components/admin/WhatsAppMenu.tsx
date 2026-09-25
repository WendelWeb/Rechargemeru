'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Check,
  Heart,
  Laugh,
  MessageCircle,
  MessageSquareText,
  PenLine,
  RotateCcw,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { recordManualWhatsAppAction, type ActionState } from '@/lib/admin/actions';
import { catalogueEntry } from '@/lib/whatsapp/catalogue';
import { renderMessage, whatsappHref, type WhatsAppKit } from '@/lib/whatsapp/render';
import {
  CATEGORY_LABELS,
  MESSAGE_CATEGORIES,
  TONE_HINTS,
  TONE_LABELS,
  WHATSAPP_TONES,
  type CatalogueEntry,
  type MessageCategory,
  type WhatsAppLocale,
  type WhatsAppStyle,
  type WhatsAppTone,
} from '@/lib/whatsapp/types';

/**
 * « Écrire au client » — the menu of ready-made WhatsApp messages.
 *
 * WhatsApp is the manual channel of this platform: the `wa.me` link opens the
 * operator's own phone with the text written, he reads it, he sends it. The
 * message leaves from his real number, which for a service handling
 * somebody's money inspires more trust than an unknown sender.
 *
 * What the window offers:
 *   - THE TONE — Classique, Chaleureux, Fun, Direct — and every text changes
 *     at once; the default is the one he chose on /admin/messages;
 *   - THE LANGUAGE — the customer's by default, switchable;
 *   - EMOJIS — on or off;
 *   - every text readable in full and EDITABLE before it leaves, for this
 *     send only (his permanent rewrites live on /admin/messages);
 *   - the recommended messages first, then the others by group.
 *
 * Two layout rules, both learnt on a laptop:
 *   - the window is rendered into <body> through a portal. It used to live
 *     next to its button, and a list row centred with a CSS transform — which
 *     makes the row the containing block of anything `position: fixed` —
 *     shrank the « full-screen » window into the 44px box of the button:
 *     it opened, invisibly;
 *   - « Ouvrir dans WhatsApp » sits at the TOP of every card, before the
 *     text, and the options compact themselves on a short screen (`short:`).
 *     A 1366x768 laptop leaves about 600px of browser, and a send button
 *     placed under a long text there was simply off screen.
 *
 * Sending is journaled (« WhatsApp manuel », with the tone) at best effort:
 * if the record fails, WhatsApp opens anyway. A text edited by hand survives
 * closing and reopening the window for the same order.
 */

export type WhatsAppMenuProps = {
  kit: WhatsAppKit;
  style: WhatsAppStyle;
  /** `compact` for list rows (an icon), `full` for the order page (a labelled button). */
  variant?: 'compact' | 'full';
  className?: string;
};

const TONE_ICONS: Record<WhatsAppTone, LucideIcon> = {
  classique: MessageSquareText,
  chaleureux: Heart,
  fun: Laugh,
  direct: Zap,
};

const DOT: Record<CatalogueEntry['color'], string> = {
  primary: 'bg-mint',
  neutral: 'bg-line-strong',
  caution: 'bg-sun-deep',
};

type Filter = 'all' | 'recommended' | MessageCategory;

export function WhatsAppMenu({ kit, style, variant = 'full', className }: WhatsAppMenuProps) {
  const [open, setOpen] = useState(false);
  // Held here, not in the window: an edited text and the « ouvert » marks
  // survive closing it by mistake (a tap on the backdrop, Escape).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstName = kit.vars.fr.prenom;

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  return (
    <>
      {variant === 'compact' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Écrire à ${kit.customerName} sur WhatsApp`}
          title="Écrire sur WhatsApp"
          className={cn(
            'inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border border-line-strong/70 bg-paper text-mint-deep transition-[background-color,border-color,transform] duration-150 hover:border-mint hover:bg-mint-soft active:scale-95',
            className,
          )}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={cn(
            'inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-xl bg-mint-deep px-4 font-semibold text-paper transition-[background-color,transform] duration-150 hover:bg-[#0b6644] active:translate-y-px',
            className,
          )}
        >
          <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
          Écrire à {firstName} sur WhatsApp
        </button>
      )}
      {open ? (
        <MessageDialog
          kit={kit}
          style={style}
          drafts={drafts}
          setDrafts={setDrafts}
          sent={sent}
          setSent={setSent}
          onClose={close}
        />
      ) : null}
    </>
  );
}

type DialogProps = {
  kit: WhatsAppKit;
  style: WhatsAppStyle;
  drafts: Record<string, string>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  sent: string[];
  setSent: Dispatch<SetStateAction<string[]>>;
  onClose: () => void;
};

function MessageDialog({ kit, style, drafts, setDrafts, sent, setSent, onClose }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tone, setTone] = useState<WhatsAppTone>(style.defaultTone);
  const [locale, setLocale] = useState<WhatsAppLocale>(kit.locale);
  const [emojis, setEmojis] = useState(style.emojis);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, startRecording] = useTransition();

  // While open: the page behind does not scroll, Escape closes, Tab stays inside.
  // The lock is on <html>, not <body>: with `overflow-x: clip` on the root
  // (globals.css), a lock on <body> leaves the page itself scrolling.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const items = useMemo(
    () =>
      kit.entries
        .map(({ id, recommended }) => ({ entry: catalogueEntry(id), recommended }))
        .filter((item): item is { entry: CatalogueEntry; recommended: boolean } => item.entry !== undefined),
    [kit.entries],
  );

  const texts = useMemo(() => {
    const out = new Map<string, string>();
    for (const { entry } of items) {
      out.set(entry.id, renderMessage(entry, kit.vars[locale], { tone, locale, emojis }, style, kit.businessName));
    }
    return out;
  }, [items, kit.vars, kit.businessName, locale, tone, emojis, style]);

  const recommended = items.filter((item) => item.recommended);
  const byCategory = MESSAGE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => !item.recommended && item.entry.category === category),
  })).filter((group) => group.items.length > 0);

  const chips: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'Tout', count: items.length },
    ...(recommended.length > 0 ? [{ value: 'recommended' as const, label: 'Conseillés', count: recommended.length }] : []),
    ...MESSAGE_CATEGORIES.map((category) => ({
      value: category,
      label: CATEGORY_LABELS[category],
      count: items.filter((item) => item.entry.category === category).length,
    })).filter((chip) => chip.count > 0),
  ];

  const sections: { title: string; items: typeof items }[] =
    filter === 'all'
      ? [
          ...(recommended.length > 0 ? [{ title: 'Conseillé pour cette commande', items: recommended }] : []),
          ...byCategory.map((group) => ({ title: CATEGORY_LABELS[group.category], items: group.items })),
        ]
      : filter === 'recommended'
        ? [{ title: 'Conseillé pour cette commande', items: recommended }]
        : [{ title: CATEGORY_LABELS[filter], items: items.filter((item) => item.entry.category === filter) }];

  function note(entry: CatalogueEntry) {
    setSent((list) => (list.includes(entry.id) ? list : [...list, entry.id]));
    startRecording(async () => {
      // Best effort on purpose: see the header, the journal never blocks a reply.
      (await recordManualWhatsAppAction(kit.orderId, `${entry.id}@${tone}`)) satisfies ActionState;
    });
  }

  function dropDraft(id: string) {
    setDrafts((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
  }

  const dialog = (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[94dvh] w-full animate-sheet flex-col overflow-hidden overscroll-contain rounded-t-[1.75rem] bg-paper shadow-lift sm:max-h-[min(calc(100dvh-2rem),58rem)] sm:max-w-2xl sm:animate-rise sm:rounded-[1.75rem]"
      >
        {/* ── Who, and the way out ─────────────────────────────── */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5 short:pt-3">
          <div className="min-w-0">
            <p id={titleId} className="font-display text-xl leading-tight font-bold tracking-tight text-ink short:text-lg">
              Écrire à {kit.vars.fr.prenom}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-muted tnum short:hidden">
              {kit.reference} · {kit.customerPhone} · le texte s’ouvre dans WhatsApp, vous relisez avant d’envoyer
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            autoFocus
            className="-mt-1 inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-mist hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* ── The options: tone, language, emojis ──────────────── */}
        <div className="shrink-0 space-y-2.5 border-b border-line px-4 pt-3 pb-3 sm:px-6 short:space-y-2 short:pt-2 short:pb-2">
          <div role="group" aria-label="Ton du message" className="grid grid-cols-4 gap-1 rounded-2xl bg-mist p-1">
            {WHATSAPP_TONES.map((value) => {
              const Icon = TONE_ICONS[value];
              const active = value === tone;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTone(value)}
                  className={cn(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold transition-[background-color,color,box-shadow] duration-200 short:min-h-9 short:flex-row short:gap-1.5',
                    active ? 'bg-paper text-ink shadow-card' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <Icon
                    className={cn('size-4 shrink-0 short:max-sm:hidden', active && value === 'fun' && 'animate-pop')}
                    aria-hidden="true"
                  />
                  {TONE_LABELS[value]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-xs text-ink-muted short:hidden">{TONE_HINTS[tone]}</p>
            <div className="flex items-center gap-3">
              <div role="group" aria-label="Langue du message" className="inline-flex rounded-xl bg-mist p-0.5">
                {(['fr', 'ht'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={locale === value}
                    onClick={() => setLocale(value)}
                    title={value === kit.locale ? 'La langue du client' : undefined}
                    className={cn(
                      'relative inline-flex min-h-9 items-center rounded-[10px] px-3 text-sm font-semibold transition-colors',
                      locale === value ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    {value === 'fr' ? 'Français' : 'Kreyòl'}
                    {value === kit.locale ? (
                      <>
                        <span className="ml-1.5 size-1.5 rounded-full bg-mint" aria-hidden="true" />
                        <span className="sr-only"> (langue du client)</span>
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emojis}
                onClick={() => setEmojis((value) => !value)}
                className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-ink"
              >
                <span
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors duration-200',
                    emojis ? 'bg-mint-deep' : 'bg-line-strong/60',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 size-4 rounded-full bg-paper shadow transition-transform duration-200',
                      emojis && 'translate-x-4',
                    )}
                  />
                </span>
                Emojis
              </button>
            </div>
          </div>
        </div>

        {/* ── Quick filters ────────────────────────────────────── */}
        <div className="shrink-0 border-b border-line px-4 py-2.5 sm:px-6 short:py-1.5">
          <div role="group" aria-label="Filtrer les messages" className="-mx-1 flex scroll-fade-x gap-1.5 overflow-x-auto px-1">
            {chips.map((chip) => {
              const active = chip.value === filter;
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(chip.value)}
                  className={cn(
                    'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                    active ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink',
                  )}
                >
                  {chip.label}
                  <span className={cn('text-xs tnum', active ? 'text-paper/70' : 'text-ink-muted')}>{chip.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── The messages ─────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 short:py-3">
          {sections.map((section) => (
            <section key={section.title} className="mb-6 last:mb-1">
              <h3 className="mb-2.5 font-display text-sm font-semibold text-ink-soft">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.items.map(({ entry }) => {
                  const proposed = texts.get(entry.id) ?? '';
                  const draft = drafts[entry.id];
                  const edited = draft !== undefined && draft !== proposed;
                  const text = draft ?? proposed;
                  const isOpen = expanded === entry.id;
                  const href = whatsappHref(kit.customerPhone, text);
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        'rounded-2xl border bg-paper p-3.5 transition-[border-color,box-shadow] duration-200 sm:p-4',
                        isOpen ? 'border-ink shadow-card' : 'border-line hover:border-line-strong/70',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', DOT[entry.color])} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] leading-snug font-semibold text-ink">
                            {entry.label}
                            {sent.includes(entry.id) ? (
                              <span className="ml-2 inline-flex animate-pop items-center gap-1 align-middle text-xs font-medium text-mint-deep">
                                <Check className="size-3.5" aria-hidden="true" />
                                ouvert
                              </span>
                            ) : null}
                            {edited ? (
                              <span className="ml-2 inline-flex items-center rounded-full bg-sun-soft px-2 align-middle text-[11px] font-semibold text-ink">
                                modifié
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-ink-muted">{entry.hint}</p>
                        </div>
                      </div>

                      {/* The action first: whatever the length of the text below,
                          the send button is on screen as soon as the card is. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => note(entry)}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-mint-deep px-4 text-sm font-semibold whitespace-nowrap text-paper transition-[background-color,transform] duration-150 hover:bg-[#0b6644] active:translate-y-px"
                          >
                            <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                            Ouvrir dans WhatsApp
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : entry.id)}
                          aria-expanded={isOpen}
                          aria-controls={`draft-${entry.id}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line-strong/70 px-3.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
                        >
                          <PenLine className="size-4" aria-hidden="true" />
                          {isOpen ? 'Replier' : 'Modifier'}
                        </button>
                      </div>

                      {entry.warning ? (
                        <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-sun-soft px-3 py-2 text-xs leading-snug text-ink">
                          <TriangleAlert className="mt-px size-3.5 shrink-0 text-sun-ink" aria-hidden="true" />
                          {entry.warning}
                        </p>
                      ) : null}

                      {isOpen ? (
                        <div className="mt-3 animate-drop">
                          <label htmlFor={`draft-${entry.id}`} className="mb-1 block text-xs font-medium text-ink-soft">
                            Le message tel qu’il partira. Vos modifications ne valent que pour cet envoi.
                          </label>
                          <textarea
                            id={`draft-${entry.id}`}
                            // Mounted by the click on « Modifier » or on the preview:
                            // the keyboard lands in the text, not on <body>.
                            autoFocus
                            value={text}
                            onChange={(event) => setDrafts((all) => ({ ...all, [entry.id]: event.target.value }))}
                            rows={Math.min(12, Math.max(5, text.split('\n').length + 1))}
                            className="block max-h-[40dvh] w-full resize-y rounded-xl border border-line-strong bg-[#f3fbf2] px-3.5 py-3 text-[15px] leading-relaxed break-anywhere text-ink transition-colors hover:border-ink focus-visible:border-ink short:max-h-[32dvh]"
                          />
                          {edited ? (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sun-soft/70 px-3 py-2 text-xs text-ink">
                              <span>Texte modifié à la main : le ton, la langue et les emojis ne le changent plus.</span>
                              <button
                                type="button"
                                onClick={() => dropDraft(entry.id)}
                                className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                              >
                                <RotateCcw className="size-3.5" aria-hidden="true" />
                                Revenir au texte proposé
                              </button>
                            </div>
                          ) : null}
                          <div className="mt-1.5 text-right">
                            <Link
                              href={`/admin/messages#${entry.id}~${tone}~${locale}`}
                              onClick={onClose}
                              className="inline-flex min-h-9 items-center text-xs font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                            >
                              Réécrire ce message pour toutes les commandes
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(entry.id)}
                          aria-label={`Lire et modifier « ${entry.label} »`}
                          className="mt-3 block w-full rounded-2xl rounded-tl-md bg-[#e9f7e6] px-3.5 py-2.5 text-left text-sm leading-relaxed whitespace-pre-line break-anywhere text-ink-soft transition-colors hover:bg-[#dff2db]"
                        >
                          {/* Paragraph gaps collapsed: four lines of preview are four lines of words. */}
                          <span className="line-clamp-4">{text.replace(/\n{2,}/g, '\n')}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
