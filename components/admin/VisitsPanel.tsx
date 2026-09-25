import Link from 'next/link';
import { BarChart } from '@/components/admin/BarChart';
import { Delta, Figure } from '@/components/admin/Figure';
import type { DailyVisits, VisitsSnapshot } from '@/lib/analytics/queries';

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** « 25 sept. » for a `YYYY-MM-DD` Port-au-Prince day (read at noon UTC, so no zone can shift it). */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : dayFormatter.format(date);
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
}

/** The days as bars, today in yellow. */
export function visitBars(daily: DailyVisits[]) {
  return daily.map((day, index) => ({
    key: day.day,
    value: day.visits,
    title: `${dayLabel(day.day)} : ${plural(day.visits, 'visite', 'visites')}`,
    highlight: index === daily.length - 1,
  }));
}

/**
 * « Visites aujourd'hui » on the dashboard: how many people came, from how
 * many devices, how many pages they opened — against yesterday — and the last
 * fourteen days as bars. Everything else lives on /admin/visites.
 */
export function VisitsPanel({ snapshot }: { snapshot: VisitsSnapshot }) {
  const { today, yesterday, daily } = snapshot;

  return (
    <section aria-labelledby="visits-title" className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="visits-title" className="font-display text-lg font-semibold tracking-tight text-ink">
          Visites aujourd’hui
        </h2>
        <Link
          href="/admin/visites"
          className="inline-flex min-h-tap items-center rounded text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink sm:min-h-0"
        >
          Voir le détail
        </Link>
      </div>

      {snapshot.dbReady ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <Figure
              label="Visites"
              value={today.visits.toLocaleString('fr-FR')}
              size="lg"
              note={<Delta current={today.visits} previous={yesterday.visits} against="hier" />}
            />
            <Figure
              label="Appareils uniques"
              value={today.devices.toLocaleString('fr-FR')}
              size="lg"
              note={today.newDevices > 0 ? plural(today.newDevices, 'nouveau', 'nouveaux') : 'Aucun nouveau'}
            />
            <Figure
              label="Pages vues"
              value={today.pageViews.toLocaleString('fr-FR')}
              size="lg"
              note={
                today.visits > 0
                  ? `${(today.pageViews / today.visits).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} par visite`
                  : '—'
              }
            />
          </dl>
          {daily.length > 0 ? (
            <BarChart
              className="mt-6"
              bars={visitBars(daily)}
              label={`Visites des ${daily.length} derniers jours`}
              startLabel={dayLabel(daily[0].day)}
              endLabel="Aujourd’hui"
            />
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Les visites s’afficheront ici dès les premières pages vues sur le site.
        </p>
      )}
    </section>
  );
}
