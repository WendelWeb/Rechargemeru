import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Chip } from '@/components/ui/Chip';
import { CopyButton } from '@/components/ui/CopyButton';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { FulfilPanel } from '@/components/admin/FulfilPanel';
import { NotificationsTable } from '@/components/admin/NotificationsTable';
import { OrderActions } from '@/components/admin/OrderActions';
import { OrderTimeline } from '@/components/admin/OrderTimeline';
import { RawJson } from '@/components/admin/RawJson';
import { WhatsAppMenu } from '@/components/admin/WhatsAppMenu';
import { orderMomentFr } from '@/lib/admin/order-status';
import type { NotificationListItem } from '@/lib/admin/queries';
import { timeAgoFr } from '@/lib/admin/time';
import { buildWhatsAppMessages } from '@/lib/admin/whatsapp-messages';
import { formatDateTime, formatHtg, formatRate, formatUsd } from '@/lib/format';
import { meruAccountLabelFr } from '@/lib/orders/meru-account';
import { getOrderById, getOrderEvents, getOrderNotifications } from '@/lib/orders/queries';
import { isExpired, statusLabelFr } from '@/lib/orders/transitions';
import type { NotificationRow, OrderRow } from '@/lib/orders/types';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { effectiveRateHtg } from '@/lib/pricing/money';
import { getSettings } from '@/lib/settings/store';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

type PageParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrderById(id);
  return { title: order ? `Commande ${order.reference}` : 'Commande' };
}

/** `https://wa.me/<digits>?text=…`, built here so the admin never imports a locale-aware helper. */
function waLink(e164: string, text: string): string | null {
  const digits = e164.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-paper p-4 shadow-card sm:p-5 ${className ?? ''}`}>
      <h2 className="mb-2 font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

const NONE = <span className="text-ink-muted">—</span>;

function toListItem(row: NotificationRow, order: OrderRow): NotificationListItem {
  return {
    id: row.id,
    orderId: row.orderId,
    reference: order.reference,
    mode: order.mode,
    channel: row.channel,
    audience: row.audience,
    recipient: row.recipient,
    template: row.template,
    locale: row.locale,
    status: row.status,
    providerId: row.providerId,
    error: row.error,
    resendOf: row.resendOf,
    createdAt: row.createdAt,
  };
}

/** What this order is, in one sentence — the line above the figures. */
function stateSentence(order: OrderRow, expired: boolean, now: Date): string {
  switch (order.status) {
    case 'pending_payment':
      return expired
        ? `Délai de paiement dépassé ${timeAgoFr(order.expiresAt, now)}, aucun paiement confirmé.`
        : `En attente du paiement du client. Le lien expire ${timeAgoFr(order.expiresAt, now)}.`;
    case 'fulfilled':
      return `Rechargée ${timeAgoFr(order.fulfilledAt ?? order.updatedAt, now)}.`;
    case 'expired':
      return 'Expirée sans paiement confirmé.';
    case 'failed':
      return 'Échouée : aucun dollar n’est parti.';
    case 'cancelled':
      return 'Annulée avant tout paiement.';
    case 'refunded':
      return `Remboursée${order.refundHtg === null ? '' : ` : ${formatHtg(order.refundHtg)}`}${order.refundWallet ? ` sur ${order.refundWallet}` : ''}.`;
    default:
      return statusLabelFr(order.status);
  }
}

/**
 * One order, read in the order the operator needs it.
 *
 * First the reference and the state, then the one block that matters for
 * this state: for a paid order, the recharge panel — the name as Meru shows
 * it, the identifier and the amount to copy, the button — and for any other
 * order, the figures of what it is and where it stands. Then, on a desk, two
 * columns: what happened (history, messages sent) on the left, who and how
 * much (client, price, payment, dates, the other actions) on the right. On a
 * phone the same blocks stack, client first.
 */
export default async function AdminOrderPage({ params }: PageParams) {
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();

  const [events, notifications, settings] = await Promise.all([
    getOrderEvents(order.id),
    getOrderNotifications(order.id),
    getSettings(),
  ]);

  const now = new Date();
  const expired = isExpired(order, now);
  const actionable = order.status === 'paid' || order.status === 'needs_review';

  // Tous les messages que l'opérateur peut écrire à ce client, dans SA langue,
  // les plus pertinents pour l'état de la commande en premier. Une commande de
  // test n'en propose aucun (voir lib/admin/whatsapp-messages.ts).
  const waMessages = buildWhatsAppMessages(order, {
    siteUrl: siteUrl(),
    businessName: settings.businessName,
  });
  const waShortcut = waMessages.find((m) => m.id === 'payment_received');
  const whatsappHref = waShortcut ? waLink(order.customerPhone, waShortcut.body) : null;

  const payerWallet = order.payerWallet ? (normalizePhone(order.payerWallet) ?? order.payerWallet) : null;
  const payerMismatch = payerWallet !== null && payerWallet !== order.customerPhone;
  const effective = effectiveRateHtg(order.totalHtg, order.usdCents);

  const client = (
    <Panel title="Client">
      <p className="font-display text-xl leading-tight font-semibold tracking-tight break-words text-ink">
        {order.customerName}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">Nom tel qu’il doit apparaître dans Meru</p>
      <dl className="mt-3">
        <Row label="WhatsApp">
          <span className="inline-flex items-center gap-1">
            <span className="tnum">{formatPhone(order.customerPhone)}</span>
            <CopyButton value={order.customerPhone} label="Copier le numéro" iconOnly className="border-0" />
          </span>
        </Row>
        <Row label={meruAccountLabelFr(order.meruAccountType)}>
          <span className="inline-flex items-center gap-1">
            <span className="font-medium break-all">{order.meruAccount}</span>
            <CopyButton value={order.meruAccount} label="Copier l’identifiant" iconOnly className="border-0" />
          </span>
        </Row>
        <Row label="Email">{order.customerEmail ? <span className="break-all">{order.customerEmail}</span> : NONE}</Row>
        {order.accountEmail && order.accountEmail !== order.customerEmail ? (
          <Row label="Email du compte">
            <span className="break-all">{order.accountEmail}</span>
          </Row>
        ) : null}
        <Row label="Langue">{order.locale === 'ht' ? 'Kreyòl' : 'Français'}</Row>
        {/* A guest order says so plainly: « sans compte » is a normal,
            supported way to order here — not a missing piece of data. */}
        <Row label="Compte client">{order.clerkUserId ? 'Commande passée depuis un compte' : 'Sans compte'}</Row>
        {order.adminNote ? <Row label="Votre note">{order.adminNote}</Row> : null}
      </dl>
      {waMessages.length > 0 ? (
        <div className="mt-4">
          <WhatsAppMenu
            orderId={order.id}
            reference={order.reference}
            customerName={order.customerName}
            customerPhone={order.customerPhone}
            messages={waMessages}
            className="w-full"
          />
          <p className="mt-2 text-xs leading-snug text-ink-muted">
            Déjà rédigé en {order.locale === 'ht' ? 'kreyòl' : 'français'}. Vous relisez dans WhatsApp avant d’envoyer.
          </p>
        </div>
      ) : null}
    </Panel>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/commandes"
          className="-ml-2 inline-flex min-h-tap items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Commandes
        </Link>

        <header className="mt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="flex min-w-0 items-center gap-1 font-display text-2xl leading-tight font-bold tracking-wide tnum text-ink sm:text-3xl">
              <span className="break-all">{order.reference}</span>
              <CopyButton
                value={order.reference}
                label="Copier la référence"
                copiedLabel="Copié"
                iconOnly
                className="shrink-0 border-0 bg-transparent"
              />
            </h1>
            <StatusPill status={order.status} label={statusLabelFr(order.status)} />
            <MethodBadge method={order.method} size="sm" />
            {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {orderMomentFr(order, now)} · créée le {formatDateTime(order.createdAt)}
          </p>
        </header>
      </div>

      {order.mode === 'sandbox' ? (
        <Alert tone="danger" title="Commande de test">
          Ce paiement vient d’un rail en bac à sable : aucune gourde réelle n’a été reçue. Elle est exclue des files
          « à recharger » et de tous les totaux, et ses notifications portent la mention « [TEST] ».
        </Alert>
      ) : null}

      {order.failureReason ? (
        <Alert tone={order.status === 'needs_review' ? 'warning' : 'info'} title="Raison enregistrée">
          {order.failureReason}
        </Alert>
      ) : null}

      {actionable ? (
        <FulfilPanel
          orderId={order.id}
          reference={order.reference}
          status={order.status}
          mode={order.mode}
          customerName={order.customerName}
          customerPhone={order.customerPhone}
          meruAccount={order.meruAccount}
          meruAccountType={order.meruAccountType}
          usdCents={order.usdCents}
          totalHtg={order.totalHtg}
          paidHtg={order.paidHtg}
          meruReference={order.meruReference}
          fulfilledUsdCents={order.fulfilledUsdCents}
          fulfilledAt={order.fulfilledAt}
          whatsappHref={whatsappHref}
        />
      ) : (
        <section
          data-surface="dark"
          aria-label="L’essentiel"
          className="rounded-[1.75rem] bg-ink p-5 text-paper shadow-lift sm:p-7"
        >
          <p className="text-[15px] leading-snug text-paper/75">{stateSentence(order, expired, now)}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
            <div>
              <dt className="text-xs text-paper/60">{order.status === 'fulfilled' ? 'Envoyé sur Meru' : 'Montant'}</dt>
              <dd className="mt-1 font-display text-3xl leading-none font-bold tracking-tight tnum sm:text-4xl">
                {formatUsd(order.fulfilledUsdCents ?? order.usdCents, 'fr')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-paper/60">{order.paidHtg === null ? 'À payer' : 'Reçu'}</dt>
              <dd className="mt-1 font-display text-2xl leading-none font-semibold tracking-tight tnum sm:text-3xl">
                {formatHtg(order.paidHtg ?? order.totalHtg)}
              </dd>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <dt className="text-xs text-paper/60">{meruAccountLabelFr(order.meruAccountType)}</dt>
              <dd className="mt-1 font-display text-lg leading-snug font-semibold break-all">{order.meruAccount}</dd>
              {order.meruReference ? (
                <dd className="mt-0.5 text-xs break-all text-paper/60">Référence Meru {order.meruReference}</dd>
              ) : null}
            </div>
          </dl>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <Panel title="Historique">
            <OrderTimeline events={events} />
          </Panel>

          <section aria-labelledby="notifications-title" className="space-y-3">
            <h2 id="notifications-title" className="font-display text-base font-semibold tracking-tight text-ink">
              Messages envoyés
            </h2>
            <NotificationsTable
              rows={notifications.map((row) => toListItem(row, order))}
              empty="Aucun message pour cette commande."
            />
          </section>

          <RawJson title="Données brutes de la commande" value={order} />
        </div>

        <aside className="order-1 min-w-0 space-y-6 lg:order-2">
          {client}

          <Panel title="Prix">
            <dl>
              <Row label="Montant commandé">{formatUsd(order.usdCents, 'fr')}</Row>
              <Row label={`Conversion à ${formatRate(order.fxRateHtg, 'fr')}`}>{formatHtg(order.baseHtg)}</Row>
              {order.feeLines.map((line) => (
                <Row key={line.id} label={line.label}>
                  {formatHtg(line.amountHtg)}
                </Row>
              ))}
              <Row label="Total à payer">
                <span className="font-display font-semibold tnum">{formatHtg(order.totalHtg)}</span>
              </Row>
              <Row label="Reçu du fournisseur">
                {order.paidHtg === null ? NONE : <span className="tnum">{formatHtg(order.paidHtg)}</span>}
              </Row>
              <Row label="Taux tout compris">{formatRate(effective, 'fr')}</Row>
              <Row label="Dollars envoyés">
                {order.fulfilledUsdCents === null ? NONE : formatUsd(order.fulfilledUsdCents, 'fr')}
              </Row>
              {order.refundHtg === null ? null : (
                <Row label="Remboursé">
                  {formatHtg(order.refundHtg)}
                  {order.refundWallet ? ` sur ${order.refundWallet}` : ''}
                </Row>
              )}
            </dl>
          </Panel>

          <Panel title="Paiement">
            <dl>
              <Row label="Fournisseur">{order.provider ?? NONE}</Row>
              <Row label="Mode">{order.mode === 'sandbox' ? 'Bac à sable (test)' : 'Réel'}</Row>
              <Row label="Référence fournisseur">
                <span className="break-all">{order.providerRef ?? NONE}</span>
              </Row>
              <Row label="Transaction">
                <span className="break-all">{order.providerTransactionId ?? NONE}</span>
              </Row>
              <Row label="Portefeuille payeur">
                {payerWallet ? (
                  <span className={payerMismatch ? 'text-coral-deep' : undefined}>
                    {payerWallet}
                    {payerMismatch ? ' — différent du téléphone du client' : ''}
                  </span>
                ) : (
                  NONE
                )}
              </Row>
              <Row label="Vérifications">
                <span className="tnum">{order.verifyAttempts}</span>
                {order.lastVerifiedAt ? `, la dernière ${timeAgoFr(order.lastVerifiedAt, now)}` : ''}
              </Row>
            </dl>
          </Panel>

          <Panel title="Dates">
            <dl>
              <Row label="Créée">{formatDateTime(order.createdAt)}</Row>
              <Row label="Échéance de paiement">{formatDateTime(order.expiresAt)}</Row>
              <Row label="Retour du client">{order.returnedAt ? formatDateTime(order.returnedAt) : NONE}</Row>
              <Row label="Paiement confirmé">{order.paidAt ? formatDateTime(order.paidAt) : NONE}</Row>
              <Row label="Rechargée">{order.fulfilledAt ? formatDateTime(order.fulfilledAt) : NONE}</Row>
              <Row label="Dernière modification">{formatDateTime(order.updatedAt)}</Row>
            </dl>
          </Panel>

          <OrderActions
            orderId={order.id}
            status={order.status}
            meruAccountType={order.meruAccountType}
            meruAccount={order.meruAccount}
            adminNote={order.adminNote}
            suggestedRefundHtg={order.paidHtg ?? order.totalHtg}
            suggestedRefundWallet={payerWallet ?? order.customerPhone}
          />
        </aside>
      </div>
    </div>
  );
}
