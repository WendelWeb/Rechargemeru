import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { OrderCard } from '@/components/admin/OrderCard';
import { OrdersTable } from '@/components/admin/OrdersTable';
import { StatCard } from '@/components/admin/StatCard';
import { SweepButton } from '@/components/admin/SweepButton';
import { STALE_PENDING_MS, dashboardStats } from '@/lib/admin/queries';
import { formatDateTime, formatHtg, formatUsdShort } from '@/lib/format';
import { listActionable, listOrders, listReconcileCandidates } from '@/lib/orders/queries';
import { RECONCILE_DEFAULTS } from '@/lib/orders/reconcile';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tableau de bord' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DAY_MS = 24 * 3_600_000;

export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tests) ? sp.tests[0] : sp.tests;
  const showTests = raw === '1';
  const now = new Date();

  const [stats, actionable, stalePending, failedRecently, recent] = await Promise.all([
    dashboardStats(now),
    listActionable({ includeSandbox: showTests, limit: 20 }),
    listReconcileCandidates({
      now,
      minAgeMs: STALE_PENDING_MS,
      maxAgeMs: RECONCILE_DEFAULTS.maxAgeMs,
      notVerifiedSinceMs: RECONCILE_DEFAULTS.notVerifiedSinceMs,
      maxAttempts: RECONCILE_DEFAULTS.maxAttempts,
      limit: 10,
    }),
    listOrders({ status: 'failed', mode: showTests ? 'all' : 'live', from: new Date(now.getTime() - DAY_MS), limit: 10 }),
    listOrders({ mode: showTests ? 'all' : 'live', limit: 8 }),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Tableau de bord</h1>
          <p className="mt-0.5 text-sm text-ink-soft">Heure d’Haïti : {formatDateTime(now)}.</p>
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
       * The queue comes first, before any counter. This is the only section
       * that is work rather than information, and on a phone whatever is
       * printed above it is scrolled past every single time.
       */}
      <section aria-labelledby="actionable-title">
        <div className="mb-3">
          <CardTitle as="h2">
            <span id="actionable-title">À recharger maintenant</span>
          </CardTitle>
          <p className="mt-0.5 text-sm text-ink-soft">Payées d’abord, puis à vérifier ; la plus ancienne en tête.</p>
        </div>
        {actionable.length === 0 ? (
          <p className="rounded-card border border-line bg-paper px-5 py-8 text-center text-ink-soft shadow-card">
            Rien à recharger. Tout est à jour.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {actionable.map((order) => (
              <OrderCard key={order.id} order={order} cta="Recharger" />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="counters-title">
        <CardTitle as="h2" className="mb-1">
          <span id="counters-title">Compteurs</span>
        </CardTitle>
        <p className="mb-3 text-sm text-ink-soft">Les montants excluent toujours les commandes de test.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="À recharger"
            value={stats.actionable}
            tone={stats.actionable > 0 ? 'action' : 'neutral'}
            hint="Paiements confirmés en attente de vos dollars."
            href="/admin/commandes?status=paid"
          />
          <StatCard
            label="En attente de paiement"
            value={stats.stalePending}
            hint="Créées il y a plus de dix minutes, jamais payées."
            href="/admin/commandes?status=pending_payment"
          />
          <StatCard
            label="Échouées (24 h)"
            value={stats.failed24h}
            tone={stats.failed24h > 0 ? 'attention' : 'neutral'}
            href="/admin/commandes?status=failed"
          />
          <StatCard
            label="Tests en attente"
            value={stats.sandboxActionable}
            hint="Exclues des totaux : ne rien envoyer."
            href="/admin/commandes?mode=sandbox"
          />
        </div>
      </section>

      {/*
       * Six more figures, folded away. They are steering numbers, not work,
       * and unfolded they were a thousand pixels of scrolling between the
       * operator and the orders below. The summary keeps the two that answer
       * « comment va la journée ? » so closing it costs nothing.
       */}
      <details className="group rounded-card border border-line bg-paper shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden sm:px-5">
          <div className="min-w-0">
            <p className="font-display text-base font-semibold tracking-tight text-ink">Aujourd’hui et ce mois</p>
            <p className="mt-0.5 text-sm text-ink-soft tnum">
              {formatHtg(stats.today.collectedHtg)} reçues · {formatUsdShort(stats.today.sentUsdCents, 'fr')} envoyés
              aujourd’hui
            </p>
          </div>
          <ChevronDown
            className="size-5 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="space-y-5 border-t border-line p-4 sm:p-5">
          <section aria-labelledby="today-title">
            <h3 id="today-title" className="mb-2 text-sm font-semibold text-ink">
              Aujourd’hui
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Gourdes reçues"
                value={formatHtg(stats.today.collectedHtg)}
                hint={`${stats.today.paidOrders} paiement(s) confirmé(s)`}
              />
              <StatCard
                label="Dollars envoyés"
                value={formatUsdShort(stats.today.sentUsdCents, 'fr')}
                tone="good"
                hint={`${stats.today.fulfilledOrders} recharge(s)`}
              />
              <StatCard label="Frais encaissés" value={formatHtg(stats.today.feesHtg)} hint="Reçu moins la conversion." />
            </div>
          </section>

          <section aria-labelledby="month-title">
            <h3 id="month-title" className="mb-2 text-sm font-semibold text-ink">
              Ce mois
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Gourdes reçues"
                value={formatHtg(stats.month.collectedHtg)}
                hint={`${stats.month.paidOrders} paiement(s) confirmé(s)`}
              />
              <StatCard
                label="Dollars envoyés"
                value={formatUsdShort(stats.month.sentUsdCents, 'fr')}
                tone="good"
                hint={`${stats.month.fulfilledOrders} recharge(s)`}
              />
              <StatCard label="Frais encaissés" value={formatHtg(stats.month.feesHtg)} hint="Reçu moins la conversion." />
            </div>
          </section>
        </div>
      </details>

      <section aria-labelledby="stale-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle as="h2">
              <span id="stale-title">En attente depuis plus de dix minutes</span>
            </CardTitle>
            <p className="mt-0.5 text-sm text-ink-soft">Non vérifiées depuis une heure. Un retour perdu se rattrape ici.</p>
          </div>
          <SweepButton pending={stalePending.length} />
        </div>
        <OrdersTable orders={stalePending} empty="Aucune commande en attente à re-vérifier." compact />
      </section>

      <section aria-labelledby="failed-title">
        <CardTitle as="h2" className="mb-3">
          <span id="failed-title">Échouées ces vingt-quatre heures</span>
        </CardTitle>
        <OrdersTable orders={failedRecently.orders} empty="Aucun échec récent." compact />
      </section>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle as="h2">
            <span id="recent-title">Dernières commandes</span>
          </CardTitle>
          <Link
            href="/admin/commandes"
            className="text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          >
            Toutes les commandes
          </Link>
        </div>
        <OrdersTable orders={recent.orders} empty="Aucune commande pour l’instant." />
      </section>
    </div>
  );
}
