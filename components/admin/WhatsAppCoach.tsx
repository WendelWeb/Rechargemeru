'use client';

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Check, ChevronDown, Heart, Laugh, MessageSquareText, RotateCcw, Search, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import {
  saveMessageOverrideAction,
  saveWhatsAppStyleAction,
  type CoachState,
} from '@/lib/admin/whatsapp-actions';
import { CATALOGUE } from '@/lib/whatsapp/catalogue';
import { jokeFor, renderMessage, signature, type OrderVars } from '@/lib/whatsapp/render';
import { placeholdersIn, unknownPlaceholders } from '@/lib/whatsapp/template';
import {
  CATEGORY_LABELS,
  MESSAGE_CATEGORIES,
  PLACEHOLDERS,
  STYLE_LIMITS,
  TONE_HINTS,
  TONE_LABELS,
  WHATSAPP_TONES,
  overrideKey,
  type CatalogueEntry,
  type PlaceholderName,
  type WhatsAppLocale,
  type WhatsAppStyle,
  type WhatsAppTone,
} from '@/lib/whatsapp/types';

/**
 * /admin/messages — where the operator coaches his WhatsApp messages.
 *
 * Two things can be taught:
 *   - HIS STYLE: the tone the window opens in, emojis, his first name as a
 *     signature, a closing line of his own, and his jokes — in the fun tone
 *     one of them is added as a P.S. (never on a message where money is at
 *     risk). A live preview shows the result before anything is saved.
 *   - HIS WORDS: any message, in any tone and language, rewritten his way
 *     with the same {placeholders} as the built-in text. His version then
 *     replaces the built-in one for every order; emptying it brings the
 *     original back.
 */

export type WhatsAppCoachProps = {
  style: WhatsAppStyle;
  sample: Record<WhatsAppLocale, OrderVars>;
  businessName: string;
};

const TONE_ICONS: Record<WhatsAppTone, LucideIcon> = {
  classique: MessageSquareText,
  chaleureux: Heart,
  fun: Laugh,
  direct: Zap,
};

const LOCALE_LABELS: Record<WhatsAppLocale, string> = { fr: 'Français', ht: 'Kreyòl' };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  render: (value: T) => ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-mist p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
            option === value ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          {render(option)}
        </button>
      ))}
    </div>
  );
}

/** A WhatsApp-looking bubble, the footer in a quieter grey. */
function Bubble({ text }: { text: string }) {
  return (
    <div className="rounded-2xl rounded-tl-md bg-[#e9f7e6] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line break-anywhere text-ink shadow-sm">
      {text}
    </div>
  );
}

export function WhatsAppCoach({ style, sample, businessName }: WhatsAppCoachProps) {
  const [state, formAction, pending] = useActionState<CoachState, FormData>(saveWhatsAppStyleAction, {});
  // « Style enregistré » stays only while the form still holds what was saved.
  const [edits, setEdits] = useState(0);
  const [submittedAt, setSubmittedAt] = useState(-1);
  const savedAndUnchanged = edits === submittedAt;

  // The style as it is being edited, for the live preview.
  const [defaultTone, setDefaultTone] = useState<WhatsAppTone>(style.defaultTone);
  const [emojis, setEmojis] = useState(style.emojis);
  const [signatureName, setSignatureName] = useState(style.signatureName);
  const [closingFr, setClosingFr] = useState(style.closing.fr);
  const [closingHt, setClosingHt] = useState(style.closing.ht);
  const [jokesFr, setJokesFr] = useState(style.jokes.fr.join('\n'));
  const [jokesHt, setJokesHt] = useState(style.jokes.ht.join('\n'));
  const [overrides, setOverrides] = useState<Record<string, string>>(style.overrides);

  const liveStyle: WhatsAppStyle = useMemo(
    () => ({
      defaultTone,
      emojis,
      signatureName,
      closing: { fr: closingFr, ht: closingHt },
      jokes: {
        fr: jokesFr.split('\n').map((j) => j.trim()).filter(Boolean),
        ht: jokesHt.split('\n').map((j) => j.trim()).filter(Boolean),
      },
      overrides,
    }),
    [defaultTone, emojis, signatureName, closingFr, closingHt, jokesFr, jokesHt, overrides],
  );

  // Preview controls.
  const [previewId, setPreviewId] = useState('payment_reminder');
  const [previewTone, setPreviewTone] = useState<WhatsAppTone>(style.defaultTone);
  const [previewLocale, setPreviewLocale] = useState<WhatsAppLocale>('fr');
  const previewEntry = CATALOGUE.find((entry) => entry.id === previewId) ?? CATALOGUE[0];

  /** Typing a joke: the preview switches to a fun message that can carry it. */
  function showJokes() {
    setPreviewTone('fun');
    const canJoke = jokeFor(previewEntry, { jokes: { fr: ['·'], ht: ['·'] } }, 'fr', 'preview') !== null;
    if (!canJoke) setPreviewId('payment_reminder');
  }
  const preview = renderMessage(
    previewEntry,
    sample[previewLocale],
    { tone: previewTone, locale: previewLocale, emojis },
    liveStyle,
    businessName,
  );

  const labelClass = 'mb-1.5 block text-sm font-semibold text-ink';
  const hintClass = 'mt-1 text-xs leading-snug text-ink-muted';
  const textareaClass =
    'block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted transition-colors hover:border-ink focus-visible:border-ink';

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        {/* ── Votre style ─────────────────────────────────────── */}
        <form
          action={formAction}
          onChange={() => setEdits((n) => n + 1)}
          onSubmit={() => setSubmittedAt(edits)}
          className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6"
        >
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Votre style</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Appliqué à tous les messages. Dans la fenêtre « Écrire au client », vous pouvez toujours changer de ton
            pour un message précis.
          </p>

          <fieldset className="mt-6">
            <legend className={labelClass}>Ton par défaut</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WHATSAPP_TONES.map((tone) => {
                const Icon = TONE_ICONS[tone];
                const active = tone === defaultTone;
                return (
                  <label
                    key={tone}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition-[border-color,background-color] duration-200 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
                      active ? 'border-ink bg-paper' : 'border-line bg-mist/50 hover:border-line-strong',
                    )}
                  >
                    <input
                      type="radio"
                      name="defaultTone"
                      value={tone}
                      checked={active}
                      onChange={() => {
                        setDefaultTone(tone);
                        setPreviewTone(tone);
                      }}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        active ? 'bg-ink text-paper' : 'bg-paper text-ink-soft',
                      )}
                    >
                      <Icon className="size-[1.1rem]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-ink">{TONE_LABELS[tone]}</span>
                      <span className="block text-xs leading-snug text-ink-muted">{TONE_HINTS[tone]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-mist/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Emojis</p>
              <p className="text-xs text-ink-muted">Désactivés, ils disparaissent de tous les textes.</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                name="emojis"
                checked={emojis}
                onChange={(event) => setEmojis(event.target.checked)}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-line-strong/60 transition-colors duration-200 peer-checked:bg-mint-deep peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
              <span className="absolute top-1 left-1 size-4 rounded-full bg-paper shadow transition-transform duration-200 peer-checked:translate-x-5" />
              <span className="sr-only">Emojis</span>
            </label>
          </div>

          <div className="mt-6">
            <label htmlFor="signatureName" className={labelClass}>
              Votre prénom, pour signer
            </label>
            <Input
              id="signatureName"
              name="signatureName"
              value={signatureName}
              maxLength={STYLE_LIMITS.signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
              placeholder="Stanley"
              autoComplete="given-name"
            />
            <p className={hintClass}>
              Les messages commenceront par « Bonjour Jean, ici {signature(liveStyle, businessName, 'fr')}. » Laissez
              vide pour ne signer qu’au nom du service.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="closingFr" className={labelClass}>
                Votre phrase de fin, en français
              </label>
              <Input
                id="closingFr"
                name="closingFr"
                value={closingFr}
                maxLength={STYLE_LIMITS.closing}
                onChange={(event) => setClosingFr(event.target.value)}
                placeholder="Merci de votre confiance, bonne journée !"
              />
            </div>
            <div>
              <label htmlFor="closingHt" className={labelClass}>
                … et en kreyòl
              </label>
              <Input
                id="closingHt"
                name="closingHt"
                value={closingHt}
                maxLength={STYLE_LIMITS.closing}
                onChange={(event) => setClosingHt(event.target.value)}
                placeholder="Mèsi paske w fè nou konfyans, pase bon jounen !"
              />
            </div>
            <p className={cn(hintClass, 'sm:col-span-2 -mt-2')}>
              Ajoutée à la fin de chaque message, juste avant la mention « message automatique ».
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-line-strong/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Laugh className="size-4 text-sun-ink" aria-hidden="true" />
              Vos blagues, pour le ton Fun
            </p>
            <p className={hintClass}>
              Une par ligne. En ton Fun, une de vos blagues est ajoutée en P.S. — toujours la même pour une même
              commande, et jamais sur un message où il y a de l’argent en jeu (montant différent, remboursement,
              vérification…).
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="jokesFr" className="mb-1 block text-xs font-medium text-ink-soft">
                  En français
                </label>
                <textarea
                  id="jokesFr"
                  name="jokesFr"
                  rows={4}
                  value={jokesFr}
                  onChange={(event) => setJokesFr(event.target.value)}
                  onFocus={showJokes}
                  placeholder={'Vos dollars font déjà leurs valises 🧳\nMeru, c’est comme le riz collé : on y revient toujours 😄'}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="jokesHt" className="mb-1 block text-xs font-medium text-ink-soft">
                  En kreyòl
                </label>
                <textarea
                  id="jokesHt"
                  name="jokesHt"
                  rows={4}
                  value={jokesHt}
                  onChange={(event) => {
                    setJokesHt(event.target.value);
                    setPreviewLocale('ht');
                  }}
                  onFocus={() => {
                    showJokes();
                    setPreviewLocale('ht');
                  }}
                  placeholder={'Dola w yo gentan ap mare valiz yo 🧳\nPa gen pwoblèm, se nou menm ki la pou sa 😄'}
                  className={textareaClass}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="dark" size="lg" loading={pending} loadingLabel="Enregistrement…">
              Enregistrer mon style
            </Button>
            {state.message && savedAndUnchanged ? (
              <p className="inline-flex animate-fade-in items-center gap-1.5 text-sm font-medium text-mint-deep" role="status">
                <Check className="size-4" aria-hidden="true" />
                {state.message}
              </p>
            ) : null}
          </div>
          {state.error && savedAndUnchanged ? (
            <Alert tone="danger" className="mt-3">
              {state.error}
            </Alert>
          ) : null}
        </form>

        {/* ── Live preview ────────────────────────────────────── */}
        <aside aria-label="Aperçu" className="rounded-card border border-line bg-paper p-5 shadow-card lg:sticky lg:top-6">
          <h2 className="font-display text-base font-semibold text-ink">Aperçu en direct</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Avec une commande d’exemple (Jean, {sample.fr.reference}). Rien n’est envoyé.</p>
          <label htmlFor="preview-message" className="mt-4 mb-1 block text-xs font-medium text-ink-soft">
            Message
          </label>
          <select
            id="preview-message"
            value={previewId}
            onChange={(event) => setPreviewId(event.target.value)}
            className="block min-h-tap w-full rounded-xl border border-line-strong bg-paper px-3 text-[15px] text-ink"
          >
            {MESSAGE_CATEGORIES.map((category) => (
              <optgroup key={category} label={CATEGORY_LABELS[category]}>
                {CATALOGUE.filter((entry) => entry.category === category).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            <Segmented
              label="Ton de l’aperçu"
              value={previewTone}
              options={WHATSAPP_TONES}
              onChange={setPreviewTone}
              render={(tone) => TONE_LABELS[tone]}
            />
            <Segmented
              label="Langue de l’aperçu"
              value={previewLocale}
              options={['fr', 'ht'] as const}
              onChange={setPreviewLocale}
              render={(locale) => LOCALE_LABELS[locale]}
            />
          </div>
          <div className="mt-4 rounded-2xl bg-[#efe7dd] p-3">
            <Bubble key={`${previewId}${previewTone}${previewLocale}`} text={preview} />
          </div>
          {liveStyle.jokes[previewLocale].length > 0 && previewTone !== 'fun' ? (
            <p className="mt-2 text-xs text-ink-muted">Vos blagues n’apparaissent qu’en ton Fun.</p>
          ) : null}
        </aside>
      </div>

      <MessageEditor
        sample={sample}
        businessName={businessName}
        liveStyle={liveStyle}
        overrides={overrides}
        onSaved={setOverrides}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vos textes                                                                 */
/* -------------------------------------------------------------------------- */

function MessageEditor({
  sample,
  businessName,
  liveStyle,
  overrides,
  onSaved,
}: {
  sample: Record<WhatsAppLocale, OrderVars>;
  businessName: string;
  liveStyle: WhatsAppStyle;
  overrides: Record<string, string>;
  onSaved: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [deep, setDeep] = useState<{ id: string; tone?: WhatsAppTone; locale?: WhatsAppLocale } | null>(null);

  // Arriving from « Réécrire ce message » in the window (#id~tone~locale):
  // open that message, in the tone and language the operator was reading.
  useEffect(() => {
    const [id, tone, locale] = window.location.hash.slice(1).split('~');
    if (!id || !CATALOGUE.some((entry) => entry.id === id)) return;
    const frame = requestAnimationFrame(() => {
      setDeep({
        id,
        tone: (WHATSAPP_TONES as readonly string[]).includes(tone ?? '') ? (tone as WhatsAppTone) : undefined,
        locale: locale === 'ht' || locale === 'fr' ? locale : undefined,
      });
      setOpenId(id);
      document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = (entry: CatalogueEntry) =>
    !needle || entry.label.toLowerCase().includes(needle) || entry.hint.toLowerCase().includes(needle);

  return (
    <section aria-labelledby="texts-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="texts-title" className="font-display text-2xl font-bold tracking-tight text-ink">
            Vos textes
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Réécrivez n’importe quel message, dans chaque ton et chaque langue. Votre version remplace le texte proposé
            pour toutes les commandes ; videz-la pour revenir au texte d’origine.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher un message"
            aria-label="Chercher un message"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-5 space-y-8">
        {MESSAGE_CATEGORIES.map((category) => {
          const entries = CATALOGUE.filter((entry) => entry.category === category && matches(entry));
          if (entries.length === 0) return null;
          return (
            <div key={category}>
              <h3 className="mb-2.5 font-display text-sm font-semibold text-ink-soft">{CATEGORY_LABELS[category]}</h3>
              <ul className="overflow-hidden rounded-card border border-line bg-paper shadow-card">
                {entries.map((entry) => (
                  <EntryEditor
                    // Remounted by a deep link so it opens on the requested tone and language.
                    key={deep?.id === entry.id ? `${entry.id}~${deep.tone}~${deep.locale}` : entry.id}
                    initialTone={deep?.id === entry.id ? deep.tone : undefined}
                    initialLocale={deep?.id === entry.id ? deep.locale : undefined}
                    entry={entry}
                    open={openId === entry.id}
                    onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
                    sample={sample}
                    businessName={businessName}
                    liveStyle={liveStyle}
                    overrides={overrides}
                    onSaved={onSaved}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EntryEditor({
  entry,
  open,
  onToggle,
  sample,
  businessName,
  liveStyle,
  overrides,
  onSaved,
  initialTone,
  initialLocale,
}: {
  entry: CatalogueEntry;
  open: boolean;
  onToggle: () => void;
  sample: Record<WhatsAppLocale, OrderVars>;
  businessName: string;
  liveStyle: WhatsAppStyle;
  overrides: Record<string, string>;
  onSaved: Dispatch<SetStateAction<Record<string, string>>>;
  /** Tone and language to open on (a deep link from the message window). */
  initialTone?: WhatsAppTone;
  initialLocale?: WhatsAppLocale;
}) {
  const [tone, setTone] = useState<WhatsAppTone>(initialTone ?? liveStyle.defaultTone);
  const [locale, setLocale] = useState<WhatsAppLocale>(initialLocale ?? 'fr');
  const key = overrideKey(entry.id, tone, locale);
  const saved = overrides[key] ?? '';
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = draft[key] ?? saved;
  const [feedback, setFeedback] = useState<CoachState>({});
  const [pending, startSaving] = useTransition();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const coachedCount = WHATSAPP_TONES.reduce(
    (n, t) => n + (overrides[overrideKey(entry.id, t, 'fr')] ? 1 : 0) + (overrides[overrideKey(entry.id, t, 'ht')] ? 1 : 0),
    0,
  );
  const unknown = unknownPlaceholders(value);
  const dirty = value.trim() !== saved.trim();
  // The preview shows the version being typed; an emptied field previews the built-in text.
  const previewOverrides = { ...overrides };
  if (value.trim()) previewOverrides[key] = value.trim();
  else delete previewOverrides[key];
  const preview = renderMessage(
    entry,
    sample[locale],
    { tone, locale, emojis: liveStyle.emojis },
    { ...liveStyle, overrides: previewOverrides },
    businessName,
  );

  function insert(name: PlaceholderName) {
    const area = areaRef.current;
    const token = `{${name}}`;
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setDraft((all) => ({ ...all, [key]: next }));
    setFeedback({});
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function save(text: string) {
    setFeedback({});
    startSaving(async () => {
      const result = await saveMessageOverrideAction(entry.id, tone, locale, text);
      setFeedback(result);
      if (result.ok) {
        // Relative to the latest rewrites: two quick saves must both stay.
        onSaved((previous) => {
          const next = { ...previous };
          if (text.trim()) next[key] = text.trim();
          else delete next[key];
          return next;
        });
        setDraft((all) => {
          const copy = { ...all };
          delete copy[key];
          return copy;
        });
      }
    });
  }

  const builtIn = entry.text[tone][locale];
  const used = new Set(placeholdersIn(builtIn));

  return (
    <li id={`msg-${entry.id}`} className="scroll-mt-6 border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-mist/60 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{entry.label}</span>
          <span className="block text-xs text-ink-muted">{entry.hint}</span>
        </span>
        {coachedCount > 0 ? (
          <span className="shrink-0 rounded-full bg-sun-soft px-2.5 py-1 text-xs font-semibold text-ink">
            {coachedCount} version{coachedCount > 1 ? 's' : ''} à vous
          </span>
        ) : null}
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-300', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div className="reveal" data-open={open} inert={!open}>
        <div>
          <div className="space-y-4 border-t border-line bg-mist/30 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <Segmented
                label="Ton"
                value={tone}
                options={WHATSAPP_TONES}
                onChange={(t) => {
                  setTone(t);
                  setFeedback({});
                }}
                render={(t) => (
                  <>
                    {TONE_LABELS[t]}
                    {overrides[overrideKey(entry.id, t, locale)] ? <span className="size-1.5 rounded-full bg-sun-deep" /> : null}
                  </>
                )}
              />
              <Segmented
                label="Langue"
                value={locale}
                options={['fr', 'ht'] as const}
                onChange={(l) => {
                  setLocale(l);
                  setFeedback({});
                }}
                render={(l) => LOCALE_LABELS[l]}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-soft">Texte proposé</p>
                <div className="rounded-xl border border-line bg-paper px-3.5 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                  {builtIn}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((all) => ({ ...all, [key]: builtIn }))}
                  className="mt-1.5 inline-flex min-h-9 items-center text-xs font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  Partir de ce texte
                </button>
              </div>
              <div>
                <label htmlFor={`area-${entry.id}`} className="mb-1.5 block text-xs font-semibold text-ink-soft">
                  Votre version ({TONE_LABELS[tone]}, {LOCALE_LABELS[locale].toLowerCase()})
                </label>
                <textarea
                  id={`area-${entry.id}`}
                  ref={areaRef}
                  rows={8}
                  value={value}
                  maxLength={STYLE_LIMITS.overrideLength}
                  onChange={(event) => {
                    setDraft((all) => ({ ...all, [key]: event.target.value }));
                    setFeedback({});
                  }}
                  placeholder="Vide : le texte proposé est utilisé."
                  aria-invalid={unknown.length > 0 || undefined}
                  aria-describedby={unknown.length > 0 ? `unknown-${entry.id}` : undefined}
                  className="block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted transition-colors hover:border-ink focus-visible:border-ink aria-[invalid=true]:border-coral-deep"
                />
                {unknown.length > 0 ? (
                  <p id={`unknown-${entry.id}`} className="mt-1 text-xs font-medium text-coral-deep">
                    Variable inconnue : {unknown.map((name) => `{${name}}`).join(', ')}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Insérer une variable">
                  {(Object.keys(PLACEHOLDERS) as PlaceholderName[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      title={PLACEHOLDERS[name]}
                      onClick={() => insert(name)}
                      className={cn(
                        'rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors',
                        used.has(name)
                          ? 'border-ink/30 bg-paper text-ink hover:border-ink'
                          : 'border-line bg-paper text-ink-muted hover:border-ink hover:text-ink',
                      )}
                    >
                      {`{${name}}`}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-ink-muted">
                  Une partie entre [[ et ]] n’apparaît que si ses variables ont une valeur, par exemple
                  « [[, référence Meru {'{ref_meru}'}]] ».
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-soft">Ce que le client lira</p>
              <div className="rounded-2xl bg-[#efe7dd] p-3">
                <Bubble text={preview} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="dark"
                disabled={!dirty || unknown.length > 0}
                loading={pending}
                loadingLabel="Enregistrement…"
                onClick={() => save(value)}
              >
                Enregistrer ma version
              </Button>
              {saved ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => save('')}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Revenir au texte proposé
                </Button>
              ) : null}
              {feedback.message ? (
                <span className="inline-flex animate-fade-in items-center gap-1 text-sm font-medium text-mint-deep" role="status">
                  <Check className="size-4" aria-hidden="true" />
                  {feedback.message}
                </span>
              ) : null}
              {feedback.error ? (
                <span className="text-sm font-medium text-coral-deep" role="alert">
                  {feedback.error}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
