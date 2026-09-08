import Link from 'next/link';
import { ChevronDown, Search } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { statusLabelFr } from '@/lib/orders/transitions';
import { ORDER_STATUSES, PAYMENT_METHODS } from '@/lib/orders/types';
import { METHOD_LABELS } from '@/components/ui/MethodBadge';
import type { AdminOrderFilters } from '@/lib/admin/queries';

const MODE_LABELS = [
  { value: 'live', label: 'Réelles' },
  { value: 'sandbox', label: 'Tests' },
] as const;

export type OrderFiltersProps = { filters: AdminOrderFilters };

/** True when anything beyond the search box is narrowing the list. */
function hasNarrowing(filters: AdminOrderFilters): boolean {
  return (
    filters.status !== 'all' ||
    filters.method !== 'all' ||
    filters.mode !== 'all' ||
    filters.fromDay !== '' ||
    filters.toDay !== ''
  );
}

/**
 * A plain `GET` form: the filters live in the URL, so a filtered list can be
 * bookmarked, shared and reloaded, and the page works with JavaScript off —
 * which matters on the phone the operator actually uses.
 *
 * Search is the whole form, nine times out of ten: the operator opens this
 * page holding a reference a customer just sent on WhatsApp. So search and
 * its button stay out in the open and the four other controls fold away —
 * they were 380px of form standing between the page and its first result on
 * a phone. The fold opens by itself whenever one of them is actually set, so
 * a narrowed list never looks like a complete one.
 *
 * `page` is deliberately absent: changing a filter starts again at page 1.
 */
export function OrderFilters({ filters }: OrderFiltersProps) {
  const labelClass = 'mb-1 block text-xs font-medium text-ink-soft';
  const narrowed = hasNarrowing(filters);

  return (
    <form
      method="get"
      className="rounded-card border border-line bg-paper p-4 shadow-card"
      aria-label="Filtrer les commandes"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <div className="min-w-0 flex-1">
          <label className={labelClass} htmlFor="filter-q">
            Recherche
          </label>
          <Input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Référence, téléphone, compte Meru, nom"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <button type="submit" className={buttonClasses('dark', 'md', 'w-full sm:w-auto')}>
          <Search className="size-4" aria-hidden="true" />
          Filtrer
        </button>
      </div>

      <details open={narrowed} className="group mt-3">
        <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          Plus de filtres
          {narrowed ? <span className="font-normal text-ink-soft">· actifs</span> : null}
          <ChevronDown className="size-4 text-ink-soft transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="filter-status">
              Statut
            </label>
            <Select id="filter-status" name="status" defaultValue={filters.status}>
              <option value="all">Tous</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabelFr(status)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className={labelClass} htmlFor="filter-method">
              Méthode
            </label>
            <Select id="filter-method" name="method" defaultValue={filters.method}>
              <option value="all">Toutes</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className={labelClass} htmlFor="filter-mode">
              Mode
            </label>
            <Select id="filter-mode" name="mode" defaultValue={filters.mode}>
              <option value="all">Tous</option>
              {MODE_LABELS.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Two native date pickers side by side leave 124px each at 360px,
              which the browser truncates: they stack until there is room. */}
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/admin/commandes" className={buttonClasses('ghost', 'sm')}>
          Réinitialiser
        </Link>
        <p className="text-xs text-ink-muted">Les dates sont des journées d’Haïti (Port-au-Prince), bornes incluses.</p>
      </div>
    </form>
  );
}
