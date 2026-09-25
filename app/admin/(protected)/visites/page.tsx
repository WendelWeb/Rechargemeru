import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Monitor, Smartphone, Tablet, TvMinimal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BarChart } from '@/components/admin/BarChart';
import { Delta, Figure } from '@/components/admin/Figure';
import { dayLabel, plural, visitBars } from '@/components/admin/VisitsPanel';
import { timeAgoFr } from '@/lib/admin/time';
import { countryName, flag, formatActive, pageName, sourceName } from '@/lib/analytics/labels';
import {
  ANALYTICS_RANGES,
  analyticsOverview,
  parseAnalyticsRange,
  type AnalyticsOverview,
  type AnalyticsRange,
  type CountStat,
  type DeviceStat,
} from '@/lib/analytics/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Visites' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RANGE_LABELS: Record<AnalyticsRange, string> = { today: 'Aujourd’hui', '7d': '7 jours', '30d': '30 jours' };
const AGAINST: Record<AnalyticsRange, string> = {
  today: 'la veille',
  '7d': 'aux 7 jours d’avant',
  '30d': 'aux 30 jours d’avant',
};

const KIND: Record<DeviceStat['kind'], { label: string; Icon: LucideIcon }> = {
  mobile: { label: 'Téléphone', Icon: Smartphone },
  tablet: { label: 'Tablette', Icon: Tablet },
  desktop: { label: 'Ordinateur', Icon: Monitor },
  other: { label: 'Autre écran', Icon: TvMinimal },
};

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0 %';
  return `${Math.round((part / whole) * 100)} %`;
}

/** A ranked list with a bar behind each line, the longest line full width. */
function CountList({
  title,
  items,
  label,
  empty,
  unit,
  note,
}: {
  title: string;
  items: CountStat[];
  label: (key: string) => string;
  empty: string;
  unit: [string, string];
  note?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="rounded-card border border-line bg-paper p-5 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
      {note ? <p className="mt-0.5 text-xs text-ink-muted">{note}</p> : null}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <li key={item.key} className="relative overflow-hidden rounded-lg">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 origin-left animate-grow-x rounded-lg bg-mist stagger"
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%`, '--i': index } as CSSProperties}
              />
              <span className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 truncate text-ink">{label(item.key)}</span>
                <span className="shrink-0 font-display font-semibold tnum text-ink" title={plural(item.count, unit[0], unit[1])}>
                  {item.count.toLocaleString('fr-FR')}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Where visitors stop, from the visit to the paid order: each step is a bar
 * as long as its share of the visits, with the share of the step before it —
 * so the steepest drop is the first thing that catches the eye.
 */
function Funnel({ funnel }: { funnel: AnalyticsOverview['funnel'] }) {
  const steps = [
    { label: 'Visites', value: funnel.visits, hint: 'Toutes les visites de la période' },
    { label: 'Ont vu l’accueil', value: funnel.sawHome, hint: 'Le formulaire de recharge était à l’écran' },
    { label: 'Ont donné leurs infos', value: funnel.reachedDetails, hint: 'Sont passés de « Montant » à « Vos infos »' },
    { label: 'Ont vérifié', value: funnel.reachedConfirm, hint: 'Ont atteint l’écran « Vérifier »' },
    { label: 'Ont confirmé', value: funnel.submitted, hint: 'Ont touché « Confirmer et payer »' },
    { label: 'Commandes créées', value: funnel.orders, hint: 'Passées depuis un appareil mesuré' },
    { label: 'Payées', value: funnel.paid, hint: 'Paiement confirmé par MonCash ou NatCash' },
  ];
  const top = Math.max(1, funnel.visits);
  return (
    <section aria-labelledby="funnel-title" className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6">
      <h2 id="funnel-title" className="font-display text-lg font-semibold tracking-tight text-ink">
        Où les visiteurs s’arrêtent
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        De la visite au paiement. Le pourcentage à droite compare chaque étape à la précédente.
      </p>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => {
          const previous = index === 0 ? step.value : steps[index - 1].value;
          const kept = index === 0 ? null : previous > 0 ? Math.round((step.value / previous) * 100) : 0;
          return (
            <li key={step.label} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4rem]">
              <div className="min-w-0">
                <p className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
                  <span className="truncate">{step.label}</span>
                  <span className="font-display font-semibold tnum">{step.value.toLocaleString('fr-FR')}</span>
                </p>
                <p className="hidden truncate text-xs text-ink-muted sm:block">{step.hint}</p>
              </div>
              <div className="relative h-7 overflow-hidden rounded-lg bg-mist">
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 origin-left animate-grow-x rounded-lg stagger',
                    index === steps.length - 1 ? 'bg-mint-deep' : 'bg-ink/80',
                  )}
                  style={{ width: `${Math.max(step.value > 0 ? 2 : 0, (step.value / top) * 100)}%`, '--i': index } as CSSProperties}
                />
              </div>
              <p
                className={cn(
                  'text-right text-sm font-semibold tnum',
                  kept === null ? 'text-ink-muted' : kept < 40 ? 'text-coral-deep' : kept < 70 ? 'text-sun-ink' : 'text-mint-deep',
                )}
              >
                {kept === null ? '—' : `${kept} %`}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DeviceRow({ device, now }: { device: DeviceStat; now: Date }) {
  const { label: kindLabel, Icon } = KIND[device.kind] ?? KIND.other;
  const place = [device.city, device.country ? countryName(device.country) : null].filter(Boolean).join(', ');
  return (
    <li className="group relative">
      <Link
        href={`/admin/visites/${device.deviceId}`}
        className="grid gap-x-5 gap-y-2 px-4 py-3.5 pr-10 transition-colors duration-150 hover:bg-mist/70 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_6rem_minmax(0,9rem)] md:items-center md:pr-12"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist text-ink-soft transition-colors group-hover:bg-paper">
            <Icon className="size-[1.1rem]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{device.label ?? kindLabel}</p>
            <p className="truncate text-xs text-ink-muted">
              {flag(device.country)} {place || 'Lieu inconnu'} · n° {device.deviceId.slice(0, 6)}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-soft md:text-sm">
          <span className="md:block">Vu {timeAgoFr(device.lastSeen, now)}</span>
          <span className="text-ink-muted md:block">
            <span className="md:hidden"> · </span>
            {device.lastPath ? `dernière page : ${pageName(device.lastPath)}` : `1re visite ${timeAgoFr(device.firstSeen, now)}`}
          </span>
        </p>
        <p className="text-sm text-ink md:text-right">
          <span className="font-display font-semibold tnum">{device.visits}</span>{' '}
          <span className="text-ink-soft">visite{device.visits > 1 ? 's' : ''}</span>
          {device.totalVisits > device.visits ? (
            <span className="block text-xs text-ink-muted tnum">{device.totalVisits} au total</span>
          ) : null}
        </p>
        <p className="text-sm text-ink md:text-right">
          <span className="font-display font-semibold tnum">{device.pageViews}</span>{' '}
          <span className="text-ink-soft">page{device.pageViews > 1 ? 's' : ''}</span>
        </p>
        <p className="text-sm text-ink md:text-right">
          {device.activeMs > 0 ? (
            <>
              <span className="font-display font-semibold tnum">{formatActive(device.activeMs)}</span>
              <span className="block text-xs text-ink-muted">sur le site</span>
            </>
          ) : (
            <span className="text-ink-muted" title="Temps non mesuré : visite antérieure à la mesure du temps">
              —
            </span>
          )}
        </p>
        <div>
          {device.orders > 0 ? (
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                device.paidOrders > 0 ? 'bg-mint-soft text-mint-deep' : 'bg-sun-soft text-ink',
              )}
            >
              {plural(device.orders, 'commande', 'commandes')}
              {device.paidOrders > 0 ? ` · ${device.paidOrders} payée${device.paidOrders > 1 ? 's' : ''}` : ''}
            </span>
          ) : (
            <span className="text-xs text-ink-muted">Aucune commande</span>
          )}
        </div>
        <ChevronRight
          aria-hidden="true"
          className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-ink md:right-4"
        />
      </Link>
    </li>
  );
}

/**
 * Who comes to the site, with or without an account.
 *
 * Every phone or computer that opens a page gets an anonymous number in a
 * cookie of this site — no name, no IP address kept — so « appareils
 * uniques » counts people (roughly: one person, one phone), « visites »
 * counts their comings (a new visit after thirty minutes without a page),
 * « temps » is ACTIVE time (tab visible, somebody there). The funnel says
 * where they stop; each device opens onto its own story, visit by visit.
 */
export default async function AdminVisitsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const range = parseAnalyticsRange(sp.range);
  const now = new Date();
  const data = await analyticsOverview(range, now);
  const { summary, previous } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Visites</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Tout le monde compte, avec ou sans compte. Touchez un appareil pour voir chacune de ses visites : les pages,
            le temps passé, les boutons touchés.
          </p>
        </div>
        <nav aria-label="Période" className="inline-flex rounded-xl border border-line bg-paper p-1 shadow-card">
          {ANALYTICS_RANGES.map((value) => {
            const active = value === range;
            return (
              <Link
                key={value}
                href={value === '7d' ? '/admin/visites' : `/admin/visites?range=${value}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-semibold transition-colors duration-200',
                  active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-mist hover:text-ink',
                )}
              >
                {RANGE_LABELS[value]}
              </Link>
            );
          })}
        </nav>
      </header>

      {data.dbReady ? null : (
        <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-8 text-center text-[15px] text-ink-soft">
          Aucune donnée de visite pour l’instant. Les chiffres apparaîtront dès les premières pages vues sur le site.
        </p>
      )}

      <section aria-label="Chiffres de la période" className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <Figure
            label="Visites"
            value={summary.visits.toLocaleString('fr-FR')}
            size="lg"
            note={<Delta current={summary.visits} previous={previous.visits} against={AGAINST[range]} />}
          />
          <Figure
            label="Appareils uniques"
            value={summary.devices.toLocaleString('fr-FR')}
            size="lg"
            note={`${summary.newDevices.toLocaleString('fr-FR')} nouveau${summary.newDevices > 1 ? 'x' : ''}`}
          />
          <Figure
            label="Durée moyenne d’une visite"
            value={formatActive(summary.avgVisitMs)}
            size="lg"
            note="Temps actif, onglet visible"
          />
          <Figure
            label="Pages vues"
            value={summary.pageViews.toLocaleString('fr-FR')}
            size="lg"
            note={
              summary.visits > 0
                ? `${(summary.pageViews / summary.visits).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} par visite`
                : '—'
            }
          />
          <Figure
            label="Visites d’une seule page"
            value={summary.singlePageVisits.toLocaleString('fr-FR')}
            size="lg"
            note={`${percent(summary.singlePageVisits, summary.visits)} des visites`}
          />
          <Figure
            label="Ont commandé"
            value={summary.orderingDevices.toLocaleString('fr-FR')}
            size="lg"
            tone="good"
            note={`${percent(summary.orderingDevices, summary.devices)} des appareils`}
          />
        </dl>

        {data.daily.length > 0 ? (
          <BarChart
            className="mt-8"
            heightClassName="h-36 sm:h-44"
            bars={visitBars(data.daily)}
            label={`Visites par jour, du ${dayLabel(data.daily[0].day)} à aujourd’hui`}
            startLabel={dayLabel(data.daily[0].day)}
            endLabel="Aujourd’hui"
          />
        ) : null}
      </section>

      <Funnel funnel={data.funnel} />

      <div className="grid gap-6 md:grid-cols-2">
        <CountList
          title="Boutons les plus touchés"
          note="Par nombre de visites où ils ont été touchés."
          items={data.clicks.map((click) => ({ key: click.name, count: click.visits }))}
          label={(name) => `« ${name} »`}
          empty="Aucun bouton touché sur la période."
          unit={['visite', 'visites']}
        />
        <CountList
          title="D’où ils viennent"
          items={data.sources}
          label={sourceName}
          empty="Aucune visite sur la période."
          unit={['visite', 'visites']}
        />
        <CountList
          title="Pages les plus vues"
          items={data.pages}
          label={pageName}
          empty="Aucune page vue sur la période."
          unit={['page vue', 'pages vues']}
        />
        <CountList
          title="Pays"
          items={data.countries}
          label={(code) => `${flag(code)} ${countryName(code)}`.trim()}
          empty="Aucun appareil sur la période."
          unit={['appareil', 'appareils']}
        />
        <CountList
          title="Type d’appareil"
          items={data.kinds}
          label={(kind) => (KIND[kind as DeviceStat['kind']] ?? KIND.other).label}
          empty="Aucun appareil sur la période."
          unit={['appareil', 'appareils']}
        />
      </div>

      <section aria-labelledby="devices-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="devices-title" className="font-display text-2xl font-bold tracking-tight text-ink">
            Appareils
          </h2>
          <p className="text-sm text-ink-muted">Les plus assidus en premier. Touchez-en un pour voir son parcours.</p>
        </div>
        {data.devices.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-8 text-center text-[15px] text-ink-soft">
            Aucun appareil sur la période.
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-paper shadow-card">
            <div
              aria-hidden="true"
              className="hidden border-b border-line bg-mist/60 px-5 py-2.5 pr-12 text-xs font-medium text-ink-soft md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_6rem_minmax(0,9rem)] md:gap-x-5"
            >
              <span>Appareil</span>
              <span>Passage</span>
              <span className="text-right">Visites</span>
              <span className="text-right">Pages</span>
              <span className="text-right">Temps</span>
              <span>Commandes</span>
            </div>
            <ul className="divide-y divide-line">
              {data.devices.map((device) => (
                <DeviceRow key={device.deviceId} device={device} now={now} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
