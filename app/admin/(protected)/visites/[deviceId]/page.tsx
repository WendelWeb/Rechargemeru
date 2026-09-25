import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  CircleAlert,
  FileText,
  Monitor,
  MousePointerClick,
  Send,
  Smartphone,
  StepForward,
  Tablet,
  TvMinimal,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { StatusPill } from '@/components/ui/StatusPill';
import { Figure } from '@/components/admin/Figure';
import { timeAgoFr } from '@/lib/admin/time';
import { deviceDetail, type DeviceDetail, type VisitJourney } from '@/lib/analytics/queries';
import {
  NET_LABELS,
  countryName,
  describeEvent,
  flag,
  formatActive,
  pageName,
  sourceName,
  type EventTone,
} from '@/lib/analytics/labels';
import { TIME_ZONE, formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import { statusLabelFr } from '@/lib/orders/transitions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Un appareil' };

type PageParams = { params: Promise<{ deviceId: string }> };

const KIND: Record<DeviceDetail['device']['kind'], { label: string; Icon: LucideIcon }> = {
  mobile: { label: 'Téléphone', Icon: Smartphone },
  tablet: { label: 'Tablette', Icon: Tablet },
  desktop: { label: 'Ordinateur', Icon: Monitor },
  other: { label: 'Autre écran', Icon: TvMinimal },
};

const TONE: Record<EventTone, { Icon: LucideIcon; dot: string }> = {
  click: { Icon: MousePointerClick, dot: 'bg-paper text-ink-soft ring-line' },
  step: { Icon: StepForward, dot: 'bg-ink text-paper ring-ink' },
  error: { Icon: CircleAlert, dot: 'bg-coral-soft text-coral-deep ring-coral/40' },
  submit: { Icon: Send, dot: 'bg-mint-deep text-paper ring-mint-deep' },
};

const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** « +1:05 » — how far into the visit a line happened. */
function offset(at: Date, start: Date): string {
  const seconds = Math.max(0, Math.round((at.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `+${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

type Line =
  | { kind: 'page'; at: Date; path: string; activeMs: number | null; scrollPct: number | null }
  | { kind: 'event'; at: Date; text: string; tone: EventTone };

/** Pages and actions of one visit, in the order they happened. */
function linesOf(visit: VisitJourney): Line[] {
  const lines: Line[] = [
    ...visit.pages.map((page) => ({
      kind: 'page' as const,
      at: page.at,
      path: page.path,
      activeMs: page.activeMs,
      scrollPct: page.scrollPct,
    })),
    ...visit.events.map((event) => ({ kind: 'event' as const, at: event.at, ...describeEvent(event) })),
  ];
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === 'page' ? -1 : 1));
}

function VisitCard({ visit, index, now }: { visit: VisitJourney; index: number; now: Date }) {
  const lines = linesOf(visit);
  const reachedOrder = visit.events.some((e) => e.type === 'submit');
  return (
    <li
      className="animate-rise stagger rounded-card border border-line bg-paper shadow-card"
      style={{ '--i': Math.min(index, 8) } as CSSProperties}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <p className="font-display text-base font-semibold text-ink first-letter:uppercase">
            {timeAgoFr(visit.start, now)}
            <span className="ml-2 text-sm font-normal text-ink-muted tnum">
              {clock.format(visit.start)} – {clock.format(visit.end)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Arrivé par : {sourceName(visit.referrer)}
            {visit.utm ? ` · campagne « ${visit.utm} »` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-mist px-2.5 py-1 font-semibold text-ink tnum">
            {formatActive(visit.activeMs)} actif
          </span>
          <span className="rounded-full bg-mist px-2.5 py-1 text-ink-soft tnum">
            {visit.pages.length} page{visit.pages.length > 1 ? 's' : ''}
          </span>
          {reachedOrder ? (
            <span className="rounded-full bg-mint-soft px-2.5 py-1 font-semibold text-mint-deep">A commandé</span>
          ) : null}
        </div>
      </div>

      <ol className="relative px-4 py-4 sm:px-5">
        <span aria-hidden="true" className="absolute top-6 bottom-6 left-[1.9rem] w-px bg-line sm:left-[2.15rem]" />
        {lines.map((line, i) => {
          if (line.kind === 'page') {
            return (
              <li key={`p${i}`} className="relative flex gap-3 py-1.5">
                <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-sun-soft text-sun-ink ring-4 ring-paper">
                  <FileText className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[15px] leading-snug font-semibold text-ink">{pageName(line.path)}</p>
                  <p className="text-xs text-ink-muted tnum">
                    {offset(line.at, visit.start)}
                    {line.activeMs !== null ? ` · ${formatActive(line.activeMs)} sur la page` : ''}
                    {line.scrollPct !== null ? ` · lue jusqu’à ${line.scrollPct} %` : ''}
                  </p>
                </div>
              </li>
            );
          }
          const { Icon, dot } = TONE[line.tone];
          return (
            <li key={`e${i}`} className="relative flex gap-3 py-1">
              <span
                className={cn(
                  'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-paper',
                  dot,
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <p
                className={cn(
                  'min-w-0 flex-1 pt-1 text-sm leading-snug break-anywhere',
                  line.tone === 'error' ? 'font-medium text-coral-deep' : 'text-ink-soft',
                )}
              >
                {line.text}
                <span className="ml-2 text-xs text-ink-muted tnum">{offset(line.at, visit.start)}</span>
              </p>
            </li>
          );
        })}
        <li className="relative flex gap-3 py-1.5">
          <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-mist ring-4 ring-paper">
            <span className="size-2 rounded-full bg-line-strong" aria-hidden="true" />
          </span>
          <p className="pt-1 text-sm text-ink-muted">
            Quitte le site {offset(visit.end, visit.start)} après son arrivée.
          </p>
        </li>
      </ol>
    </li>
  );
}

/**
 * One device, told visit by visit: where it came from, which pages it
 * opened and how long it stayed on each, what it pressed, which screen of
 * the form it reached and where it got stuck — and the orders it placed.
 * Nothing typed by the visitor is ever shown: it was never recorded.
 */
export default async function DevicePage({ params }: PageParams) {
  const { deviceId } = await params;
  const detail = await deviceDetail(deviceId);
  if (!detail) notFound();

  const now = new Date();
  const { device, orders, visits } = detail;
  const { label: kindLabel, Icon } = KIND[device.kind] ?? KIND.other;
  const place = [device.city, device.country ? countryName(device.country) : null].filter(Boolean).join(', ');
  const facts = [
    kindLabel,
    device.screen ? `écran ${device.screen.replace('x', ' × ')}` : null,
    device.net ? (NET_LABELS[device.net] ?? device.net) : null,
    device.lang ? `navigateur en ${device.lang}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/visites"
        className="-ml-2 inline-flex min-h-tap items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Visites
      </Link>

      <header className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-paper">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-ink sm:text-3xl">
            {device.label ?? kindLabel}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {flag(device.country)} {place || 'Lieu inconnu'} · appareil n° {device.deviceId.slice(0, 6)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{facts.join(' · ')}</p>
        </div>
      </header>

      <section aria-label="En chiffres" className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">
          <Figure label="Visites" value={device.visits.toLocaleString('fr-FR')} size="lg" />
          <Figure label="Pages vues" value={device.pageViews.toLocaleString('fr-FR')} size="lg" />
          <Figure label="Temps passé" value={formatActive(device.activeMs)} size="lg" note="Temps actif, onglet visible" />
          <Figure label="Première visite" value={timeAgoFr(device.firstSeen, now)} note={formatDateTime(device.firstSeen)} />
          <Figure label="Dernière visite" value={timeAgoFr(device.lastSeen, now)} note={formatDateTime(device.lastSeen)} />
        </dl>
      </section>

      <section aria-labelledby="device-orders">
        <h2 id="device-orders" className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">
          Commandes depuis cet appareil
        </h2>
        {orders.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-6 text-center text-sm text-ink-soft">
            Aucune commande : cet appareil a regardé, sans commander.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper shadow-card">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/commandes/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-mist/70 sm:px-5"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-display font-semibold tracking-wide tnum text-ink">{order.reference}</span>
                    <StatusPill status={order.status} label={statusLabelFr(order.status)} size="sm" />
                  </span>
                  <span className="text-sm text-ink-soft tnum">
                    {formatUsd(order.usdCents, 'fr')} · {formatHtg(order.totalHtg)} · {timeAgoFr(order.createdAt, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="device-visits">
        <h2 id="device-visits" className="mb-1 font-display text-lg font-semibold tracking-tight text-ink">
          Ses visites, une à une
        </h2>
        <p className="mb-3 text-sm text-ink-soft">
          La plus récente en premier. Les pages ouvertes, le temps passé sur chacune et ce qui a été touché ; rien de ce
          qui a été tapé n’est enregistré.
        </p>
        {visits.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-6 text-center text-sm text-ink-soft">
            Aucune visite enregistrée.
          </p>
        ) : (
          <ul className="space-y-4">
            {visits.map((visit, index) => (
              <VisitCard key={visit.visitId} visit={visit} index={index} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
