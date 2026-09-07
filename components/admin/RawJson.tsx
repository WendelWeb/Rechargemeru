export type RawJsonProps = {
  title: string;
  value: unknown;
  /** Open by default (rarely wanted: this is the last resort, not the first read). */
  defaultOpen?: boolean;
};

/**
 * The raw row, one tap away. Nothing is hidden from the operator — when a
 * provider does something the interface has no word for, this is where the
 * answer is. `<details>` keeps it out of the way without any JavaScript.
 */
export function RawJson({ title, value, defaultOpen = false }: RawJsonProps) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    text = 'Contenu non sérialisable.';
  }
  return (
    <details open={defaultOpen} className="rounded-card border border-line bg-paper shadow-card">
      <summary className="cursor-pointer list-none px-5 py-3 font-display text-sm font-semibold tracking-tight text-ink">
        {title}
      </summary>
      <div className="border-t border-line p-4">
        <pre className="overflow-x-auto rounded-lg bg-mist p-3 text-xs leading-relaxed text-ink-soft">{text}</pre>
      </div>
    </details>
  );
}
