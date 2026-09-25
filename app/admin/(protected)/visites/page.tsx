import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Monitor, Smartphone, Tablet, TvMinimal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { BarChart } from '@/components/admin/BarChart';
import { Delta, Figure } from '@/components/admin/Figure';
import { dayLabel, plural, visitBars } from '@/components/admin/VisitsPanel';
import { timeAgoFr } from '@/lib/admin/time';
import {
  ANALYTICS_RANGES,
  analyticsOverview,
  parseAnalyticsRange,
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

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });

function countryName(code: string | null): string {
  if (!code || code === 'unknown') return 'Pays inconnu';
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** « 🇭🇹 » from « HT »: two regional-indicator letters. */
function flag(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** A path as the operator thinks of it: « Accueil (kreyòl) », « Page d’une commande ». */
function pageName(path: string): string {
  const match = /^\/(fr|ht)(\/.*)?$/.exec(path);
  if (!match) return path;
  const lang = match[1] === 'ht' ? 'kreyòl' : 'français';
  const rest = match[2] ?? '';
  const names: Record<string, string> = {
    '': 'Accueil',
    '/suivi': 'Suivre ma commande',
    '/faq': 'Questions fréquentes',
    '/conditions': 'Conditions',
    '/commande/*': 'Page d’une commande',
    '/mes-commandes': 'Mes commandes',
    '/connexion': 'Connexion',
    '/inscription': 'Création de compte',
  };
  return `${names[rest] ?? rest} (${lang})`;
}

function sourceName(host: string): string {
  if (host === 'direct') return 'Accès direct, WhatsApp ou favori';
  const known: Record<string, string> = {
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'google.com': 'Google',
    whatsapp: 'WhatsApp',
    't.co': 'X (Twitter)',
    'tiktok.com': 'TikTok',
    'youtube.com': 'YouTube',
  };
  return known[host] ?? host;
}

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
}: {
  title: string;
  items: CountStat[];
  label: (key: string) => string;
  empty: string;
  unit: [string, string];
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="rounded-card border border-line bg-paper p-5 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
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

function DeviceRow({ device, now }: { device: DeviceStat; now: Date }) {
  const { label: kindLabel, Icon } = KIND[device.kind] ?? KIND.other;
  const place = [device.city, device.country ? countryName(device.country) : null].filter(Boolean).join(', ');
  return (
    <li className="grid gap-x-5 gap-y-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_minmax(0,9rem)] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist text-ink-soft">
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
          1<sup>re</sup> visite {timeAgoFr(device.firstSeen, now)}
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
    </li>
  );
}

/**
 * Who comes to the site, with or without an account.
 *
 * Every phone or computer that opens a page gets an anonymous identifier in a
 * cookie of this site — no name, no IP address kept — so « appareils
 * uniques » counts people (roughly: one person, one phone), « visites »
 * counts their comings (a new visit after thirty minutes without a page), and
 * « pages vues » everything they opened. The list at the bottom is the
 * devices themselves: how often each came back, and whether it ordered.
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
            Tout le monde compte, avec ou sans compte. Chaque téléphone reçoit un numéro anonyme : aucun nom, aucune
            adresse IP n’est gardée.
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
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
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
            note={<Delta current={summary.devices} previous={previous.devices} against={AGAINST[range]} />}
          />
          <Figure
            label="Nouveaux appareils"
            value={summary.newDevices.toLocaleString('fr-FR')}
            size="lg"
            note={`${percent(summary.newDevices, summary.devices)} des appareils`}
          />
          <Figure
            label="Pages vues"
            value={summary.pageViews.toLocaleString('fr-FR')}
            size="lg"
            note={
              summary.devices > 0
                ? `${(summary.visits / summary.devices).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} visite(s) par appareil`
                : '—'
            }
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

      <div className="grid gap-6 md:grid-cols-2">
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
          <p className="text-sm text-ink-muted">Les plus assidus en premier, {RANGE_LABELS[range].toLowerCase()}.</p>
        </div>
        {data.devices.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-8 text-center text-[15px] text-ink-soft">
            Aucun appareil sur la période.
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-paper shadow-card">
            <div
              aria-hidden="true"
              className="hidden border-b border-line bg-mist/60 px-5 py-2.5 text-xs font-medium text-ink-soft md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_minmax(0,9rem)] md:gap-x-5"
            >
              <span>Appareil</span>
              <span>Passage</span>
              <span className="text-right">Visites</span>
              <span className="text-right">Pages</span>
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
