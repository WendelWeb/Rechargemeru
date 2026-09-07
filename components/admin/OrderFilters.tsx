import Link from 'next/link';
import { Search } from 'lucide-react';
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

/**
 * A plain `GET` form: the filters live in the URL, so a filtered list can be
 * bookmarked, shared and reloaded, and the page works with JavaScript off —
 * which matters on the phone the operator actually uses.
 *
 * `page` is deliberately absent: changing a filter starts again at page 1.
 */
export function OrderFilters({ filters }: OrderFiltersProps) {
  const labelClass = 'mb-1 block text-xs font-medium text-ink-soft';
  return (
    <form
      method="get"
      className="rounded-card border border-line bg-paper p-4 shadow-card"
      aria-label="Filtrer les commandes"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
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
          />
        </div>

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

        <div className="grid grid-cols-2 gap-2">
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonClasses('dark', 'sm')}>
          <Search className="size-4" aria-hidden="true" />
          Filtrer
        </button>
        <Link href="/admin/commandes" className={buttonClasses('ghost', 'sm')}>
          Réinitialiser
        </Link>
        <p className="text-xs text-ink-muted">Les dates sont des journées d’Haïti (Port-au-Prince), bornes incluses.</p>
      </div>
    </form>
  );
}
