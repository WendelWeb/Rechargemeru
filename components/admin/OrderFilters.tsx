import Link from 'next/link';
import { ChevronDown, Search } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PAYMENT_METHODS } from '@/lib/orders/types';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import type { AdminOrderFilters } from '@/lib/admin/queries';

const MODE_LABELS = [
  { value: 'live', label: 'Réelles' },
  { value: 'sandbox', label: 'Tests' },
] as const;

export type OrderFiltersProps = {
  filters: AdminOrderFilters;
  /** The ticked status chips, carried through a search as `?status=…`. */
  statusParam: string;
};

/** True when anything in the folded part is narrowing the list. */
function hasNarrowing(filters: AdminOrderFilters): boolean {
  return filters.method !== 'all' || filters.mode !== 'all' || filters.fromDay !== '' || filters.toDay !== '';
}

/**
 * The search bar of `/admin/commandes`: a plain `GET` form, so a filtered
 * list can be bookmarked, shared and reloaded, and the page works with
 * JavaScript off.
 *
 * Search is the whole form, nine times out of ten — the operator opens this
 * page holding a reference a customer just sent on WhatsApp — so it is one
 * wide field with its button. The wallet, test/real and date filters fold
 * away and open by themselves when one of them is set, so a narrowed list
 * never looks like a complete one. The status lives in the chips below.
 */
export function OrderFilters({ filters, statusParam }: OrderFiltersProps) {
  const labelClass = 'mb-1 block text-xs font-medium text-ink-soft';
  const narrowed = hasNarrowing(filters);
  const anything = narrowed || filters.q !== '' || statusParam !== '';

  return (
    <form method="get" aria-label="Rechercher une commande">
      {statusParam ? <input type="hidden" name="status" value={statusParam} /> : null}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="filter-q" className="sr-only">
            Rechercher
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <Input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Référence, téléphone, compte Meru ou nom"
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-12 rounded-2xl pl-11 shadow-card"
          />
        </div>
        <button type="submit" className={buttonClasses('dark', 'md', 'min-h-12 shrink-0 rounded-2xl')}>
          Rechercher
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        <details open={narrowed} className="group w-full">
          <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Plus de filtres
            {narrowed ? <span className="font-normal text-ink-soft">(actifs)</span> : null}
            <ChevronDown
              className="size-4 text-ink-soft transition-transform duration-300 group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>

          <div className="mt-1 grid animate-drop gap-3 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="filter-method">
                Paiement
              </label>
              <Select id="filter-method" name="method" defaultValue={filters.method}>
                <option value="all">MonCash et NatCash</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className={labelClass} htmlFor="filter-mode">
                Réelles ou tests
              </label>
              <Select id="filter-mode" name="mode" defaultValue={filters.mode}>
                <option value="all">Toutes</option>
                {MODE_LABELS.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Two native date pickers side by side leave 124px each at 360px,
                which the browser truncates: they stack until there is room. */}
            <div>
              <label className={labelClass} htmlFor="filter-from">
                Du
              </label>
              <Input id="filter-from" name="from" type="date" defaultValue={filters.fromDay} />
            </div>
            <div>
              <label className={labelClass} htmlFor="filter-to">
                Au
              </label>
              <Input id="filter-to" name="to" type="date" defaultValue={filters.toDay} />
            </div>
            <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-4">
              Journées d’Haïti, bornes incluses. Appuyez sur « Rechercher » pour appliquer.
            </p>
          </div>
        </details>
      </div>

      {anything ? (
        <Link
          href="/admin/commandes"
          className="inline-flex min-h-tap items-center text-sm font-medium text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          Tout effacer
        </Link>
      ) : null}
    </form>
  );
}
