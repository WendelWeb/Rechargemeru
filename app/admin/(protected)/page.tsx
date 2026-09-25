import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, FlaskConical } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { Figure } from '@/components/admin/Figure';
import { OrderCard } from '@/components/admin/OrderCard';
import { OrdersFeed } from '@/components/admin/OrdersFeed';
import { VisitsPanel } from '@/components/admin/VisitsPanel';
import { dashboardStats, type PeriodTotals } from '@/lib/admin/queries';
import { orderMomentFr } from '@/lib/admin/order-status';
import { timeAgoFr } from '@/lib/admin/time';
import { visitsSnapshot } from '@/lib/analytics/queries';
import { TIME_ZONE, formatHtg, formatUsdShort } from '@/lib/format';
import { listActionable, listOrders } from '@/lib/orders/queries';
import type { OrderRow } from '@/lib/orders/types';
import { getSettings } from '@/lib/settings/store';
import { whatsappKits } from '@/lib/whatsapp/context';
import { getWhatsAppStyle } from '@/lib/whatsapp/style-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tableau de bord' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** How many recent orders the « Commandes » list carries (and filters in the browser). */
const FEED_SIZE = 50;

const headerDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function momentsFor(orders: OrderRow[], now: Date): Record<string, string> {
  return Object.fromEntries(orders.map((order) => [order.id, orderMomentFr(order, now)]));
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

function PeriodRow({ title, totals }: { title: string; totals: PeriodTotals }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <dl className="mt-2 grid grid-cols-3 gap-4">
        <Figure
          label="Gourdes reçues"
          value={formatHtg(totals.collectedHtg)}
          note={count(totals.paidOrders, 'paiement', 'paiements')}
        />
        <Figure
          label="Dollars envoyés"
          value={formatUsdShort(totals.sentUsdCents, 'fr')}
          tone="good"
          note={count(totals.fulfilledOrders, 'recharge', 'recharges')}
        />
        <Figure label="Frais encaissés" value={formatHtg(totals.feesHtg)} note="Reçu moins la conversion" />
      </dl>
    </div>
  );
}

/**
 * The page the operator opens first, laid out by urgency:
 *
 *   1. what has been paid and is waiting for dollars — a yellow block, with a
 *      card per order and the button that starts the recharge; or, when
 *      nothing waits, one calm line that says so and when money last came in;
 *   2. who came to the site today, and the money of the day and the month;
 *   3. every recent order, with the status chips to narrow it down.
 */
export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tests) ? sp.tests[0] : sp.tests;
  const showTests = raw === '1';
  const now = new Date();

  const [settings, stats, actionable, recent, visits, waStyle] = await Promise.all([
    getSettings(),
    dashboardStats(now),
    listActionable({ includeSandbox: showTests, limit: 24 }),
    listOrders({ mode: showTests ? 'all' : 'live', limit: FEED_SIZE }),
    visitsSnapshot(now),
    getWhatsAppStyle(),
  ]);

  // Écrire au client est la suite la plus fréquente de la lecture d'une liste.
  const waActionable = whatsappKits(actionable, settings);
  const waRecent = whatsappKits(recent.orders, settings);
  const moments = momentsFor([...actionable, ...recent.orders], now);

  const paidCount = actionable.filter((order) => order.status === 'paid').length;
  const reviewCount = actionable.length - paidCount;
  const lastPaid = recent.orders
    .filter((order) => order.mode === 'live' && order.paidAt)
    .reduce<Date | null>((latest, order) => (latest && latest > order.paidAt! ? latest : order.paidAt), null);

  const queueTitle =
    paidCount > 0
      ? `${count(paidCount, 'commande payée attend', 'commandes payées attendent')} vos dollars`
      : `${count(reviewCount, 'commande est', 'commandes sont')} à vérifier`;

  const today = headerDate.format(now);

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Tableau de bord</h1>
          <p className="mt-1 text-sm text-ink-soft first-letter:uppercase">{today}, heure d’Haïti</p>
        </div>
        <Link href={showTests ? '/admin' : '/admin?tests=1'} className={buttonClasses('ghost', 'sm')}>
          <FlaskConical className="size-4" aria-hidden="true" />
          {showTests ? 'Masquer les tests' : 'Afficher les tests'}
        </Link>
      </header>

      {stats.dbReady ? null : (
        <Alert tone="danger" title="Base de données non configurée">
          Aucune commande ne peut être lue ni écrite. Renseignez <code>DATABASE_URL</code> puis lancez les migrations ;
          l’état complet est sur la page « Santé ».
        </Alert>
      )}

      {/*
        The queue comes first, before any figure: it is the only part of this
        page that is work rather than information, and on a phone whatever is
        printed above it is scrolled past every single time.
      */}
      {actionable.length > 0 ? (
        <section
          aria-labelledby="queue-title"
          className="rounded-[1.75rem] bg-sun-soft p-4 ring-1 ring-sun/50 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="size-3 shrink-0 animate-beat rounded-full bg-sun-deep" aria-hidden="true" />
            <h2 id="queue-title" className="font-display text-xl leading-tight font-bold tracking-tight text-ink sm:text-2xl">
              {queueTitle}
            </h2>
          </div>
          <p className="mt-1.5 pl-6 text-sm text-ink-soft">
            {paidCount > 0 && reviewCount > 0 ? `Et ${count(reviewCount, 'autre', 'autres')} à vérifier. ` : ''}
            La plus ancienne en premier. Envoyez sur Meru, puis marquez-la rechargée.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {actionable.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                moment={moments[order.id] ?? ''}
                whatsappKit={waActionable[order.id]}
                whatsappStyle={waStyle}
              />
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-labelledby="queue-title"
          className="flex items-center gap-4 rounded-[1.75rem] border border-line bg-paper p-5 shadow-card sm:p-6"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint-deep">
            <CircleCheck className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="queue-title" className="font-display text-lg font-semibold tracking-tight text-ink">
              Aucune commande payée en attente
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {lastPaid ? `Dernier paiement reçu ${timeAgoFr(lastPaid, now)}. ` : ''}
              Les nouvelles commandes payées apparaîtront ici.
            </p>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <VisitsPanel snapshot={visits} />

        {/* Toujours déplié : l'opérateur veut ces chiffres en ouvrant la page. */}
        <section
          aria-labelledby="figures-title"
          className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-6"
        >
          <h2 id="figures-title" className="font-display text-lg font-semibold tracking-tight text-ink">
            Aujourd’hui et ce mois
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft tnum">
            {formatHtg(stats.today.collectedHtg)} reçues · {formatUsdShort(stats.today.sentUsdCents, 'fr')} envoyés
            aujourd’hui
          </p>
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            <PeriodRow title="Aujourd’hui" totals={stats.today} />
            <PeriodRow title="Ce mois" totals={stats.month} />
          </div>
          <p className="mt-5 text-xs text-ink-muted">Les commandes de test ne comptent jamais dans ces montants.</p>
        </section>
      </div>

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="mb-3 font-display text-2xl font-bold tracking-tight text-ink">
          Commandes
        </h2>
        <OrdersFeed orders={recent.orders} moments={moments} whatsappByOrder={waRecent} whatsappStyle={waStyle} />
      </section>
    </div>
  );
}
