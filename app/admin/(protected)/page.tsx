import type { Metadata } from 'next';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { CardTitle } from '@/components/ui/Card';
import { OrderCard } from '@/components/admin/OrderCard';
import { OrdersTable } from '@/components/admin/OrdersTable';
import { buildWhatsAppMessages, type WhatsAppMessage } from '@/lib/admin/whatsapp-messages';
import { siteUrl } from '@/lib/site-url';
import { StatCard } from '@/components/admin/StatCard';
import { dashboardStats } from '@/lib/admin/queries';
import { formatDateTime, formatHtg, formatUsdShort } from '@/lib/format';
import { listActionable, listOrders } from '@/lib/orders/queries';
import { getSettings } from '@/lib/settings/store';
import type { OrderRow } from '@/lib/orders/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tableau de bord' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;


/**
 * Les messages WhatsApp de chaque commande d'une liste, indexés par
 * identifiant. Construits ici, pas dans la carte : le catalogue a besoin des
 * réglages (nom commercial, adresse publique) que seul le serveur lit.
 */
function whatsappFor(
  orders: OrderRow[],
  businessName: string,
): Record<string, WhatsAppMessage[]> {
  const ctx = { siteUrl: siteUrl(), businessName };
  const out: Record<string, WhatsAppMessage[]> = {};
  for (const order of orders) {
    const messages = buildWhatsAppMessages(order, ctx);
    if (messages.length > 0) out[order.id] = messages;
  }
  return out;
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tests) ? sp.tests[0] : sp.tests;
  const showTests = raw === '1';
  const now = new Date();

  const [settings, stats, actionable, recent] = await Promise.all([
    getSettings(),
    dashboardStats(now),
    listActionable({ includeSandbox: showTests, limit: 20 }),
    listOrders({ mode: showTests ? 'all' : 'live', limit: 8 }),
  ]);

  const waActionable = whatsappFor(actionable, settings.businessName);
  const waRecent = whatsappFor(recent.orders, settings.businessName);

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
              <OrderCard
                key={order.id}
                order={order}
                cta="Recharger"
                whatsappMessages={waActionable[order.id]}
              />
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
       * Les chiffres du jour et du mois, toujours visibles : l'opérateur veut
       * les voir en ouvrant le tableau de bord, sans avoir à déplier quoi que
       * ce soit.
       */}
      <section
        aria-labelledby="figures-title"
        className="rounded-card border border-line bg-paper shadow-card"
      >
        <div className="px-4 py-3 sm:px-5">
          <h2 id="figures-title" className="font-display text-base font-semibold tracking-tight text-ink">
            Aujourd’hui et ce mois
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft tnum">
            {formatHtg(stats.today.collectedHtg)} reçues · {formatUsdShort(stats.today.sentUsdCents, 'fr')} envoyés
            aujourd’hui
          </p>
        </div>

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
        <OrdersTable
          orders={recent.orders}
          empty="Aucune commande pour l’instant."
          whatsappByOrder={waRecent}
        />
      </section>
    </div>
  );
}
