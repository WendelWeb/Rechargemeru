import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CopyButton } from '@/components/ui/CopyButton';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { FulfilPanel } from '@/components/admin/FulfilPanel';
import { NotificationsTable } from '@/components/admin/NotificationsTable';
import { OrderActions } from '@/components/admin/OrderActions';
import { OrderTimeline } from '@/components/admin/OrderTimeline';
import { RawJson } from '@/components/admin/RawJson';
import type { NotificationListItem } from '@/lib/admin/queries';
import { formatDateTime, formatHtg, formatRate, formatUsd } from '@/lib/format';
import { buildCustomerMessage } from '@/lib/notifications/templates';
import { meruAccountLabelFr } from '@/lib/orders/meru-account';
import { getOrderById, getOrderEvents, getOrderNotifications } from '@/lib/orders/queries';
import { isExpired, statusLabelFr } from '@/lib/orders/transitions';
import type { NotificationRow, OrderRow } from '@/lib/orders/types';
import { normalizePhone, formatPhone } from '@/lib/phone';
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
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-paper p-4 shadow-card sm:p-6">
      <CardTitle as="h2" className="mb-3">
        {title}
      </CardTitle>
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
  const showFulfilPanel = actionable || order.status === 'fulfilled';

  // The message the operator would send by hand: exactly what the automatic
  // WhatsApp would have said, so both channels tell the same story.
  const waTemplate = order.status === 'fulfilled' ? 'fulfilled' : 'paid';
  const waText = buildCustomerMessage(order, waTemplate, {
    siteUrl: siteUrl(),
    businessName: settings.businessName,
    supportWhatsapp: settings.supportWhatsapp,
    slaFr: settings.fulfilmentSlaFr,
    slaHt: settings.fulfilmentSlaHt,
    supportHours: settings.supportHours,
  }).text;
  const whatsappHref = waLink(order.customerPhone, waText);

  const payerWallet = order.payerWallet ? normalizePhone(order.payerWallet) ?? order.payerWallet : null;
  const payerMismatch = payerWallet !== null && payerWallet !== order.customerPhone;
  const effective = effectiveRateHtg(order.totalHtg, order.usdCents);

  return (
    <div className="space-y-6">
      {/*
        The reference owns the first line, with the button that copies it
        right beside it; what the order *is* comes underneath. Laid out as one
        wrapping row, the copy button was pushed to a line of its own by
        `ml-auto`, alone and right-aligned, away from the value it copies.
      */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 font-display text-2xl leading-tight font-semibold tracking-wide break-all tnum text-ink">
            {order.reference}
          </h1>
          <CopyButton value={order.reference} label="Copier la référence" copiedLabel="Copié" iconOnly className="shrink-0" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} label={statusLabelFr(order.status)} />
          <MethodBadge method={order.method} size="sm" />
          {order.mode === 'sandbox' ? <Chip tone="test">TEST</Chip> : null}
        </div>
      </header>

      {order.mode === 'sandbox' ? (
        <Alert tone="danger" title="Commande de test">
          Ce paiement vient d’un rail en bac à sable : aucune gourde réelle n’a été reçue. Elle est exclue des files
          « à recharger » et de tous les totaux, et ses notifications portent la mention « [TEST] ».
        </Alert>
      ) : null}

      {expired ? (
        <Alert tone="warning" title="Délai de paiement dépassé">
          L’échéance était le {formatDateTime(order.expiresAt)}. Un paiement confirmé après coup passera par
          « À vérifier », jamais directement par « Payée ».
        </Alert>
      ) : null}

      {order.failureReason ? (
        <Alert tone={order.status === 'needs_review' ? 'warning' : 'info'} title="Raison enregistrée">
          {order.failureReason}
        </Alert>
      ) : null}

      {showFulfilPanel ? (
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
      ) : null}

      <OrderActions
        orderId={order.id}
        status={order.status}
        meruAccountType={order.meruAccountType}
        meruAccount={order.meruAccount}
        adminNote={order.adminNote}
        suggestedRefundHtg={order.paidHtg ?? order.totalHtg}
        suggestedRefundWallet={payerWallet ?? order.customerPhone}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Devis figé">
          <dl>
            <Row label="Montant commandé">{formatUsd(order.usdCents, 'fr')}</Row>
            <Row label={`Conversion au taux ${formatRate(order.fxRateHtg, 'fr')}`}>{formatHtg(order.baseHtg)}</Row>
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

        <Panel title="Client">
          <dl>
            <Row label="Nom, tel qu’il doit apparaître dans Meru">{order.customerName}</Row>
            <Row label="WhatsApp">
              <span className="inline-flex items-center gap-2">
                <span className="tnum">{formatPhone(order.customerPhone)}</span>
                <CopyButton value={order.customerPhone} label="Copier" iconOnly />
              </span>
            </Row>
            <Row label="Email">{order.customerEmail ?? NONE}</Row>
            <Row label={meruAccountLabelFr(order.meruAccountType)}>
              <span className="inline-flex items-center gap-2">
                <span className="break-all">{order.meruAccount}</span>
                <CopyButton value={order.meruAccount} label="Copier" iconOnly />
              </span>
            </Row>
            <Row label="Référence Meru du transfert">{order.meruReference ?? NONE}</Row>
            <Row label="Langue">{order.locale === 'ht' ? 'Kreyòl' : 'Français'}</Row>
            {/* A signed-in customer links the order to a Clerk account; a guest
                order says so plainly, because « aucun compte » is a normal,
                supported way to order here — not a missing piece of data. */}
            <Row label="Compte client">
              {order.clerkUserId ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  <span>Commande passée depuis un compte</span>
                  <code className="rounded bg-mist px-1.5 py-0.5 text-xs break-all">{order.clerkUserId}</code>
                  <CopyButton value={order.clerkUserId} label="Copier l’identifiant du compte" iconOnly />
                </span>
              ) : (
                'Commande sans compte'
              )}
            </Row>
            <Row label="Note de l’opérateur">{order.adminNote ?? NONE}</Row>
          </dl>
        </Panel>

        <Panel title="Fournisseur">
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
              {order.lastVerifiedAt ? `, dernière le ${formatDateTime(order.lastVerifiedAt)}` : ''}
            </Row>
            <Row label="Redirection valable jusqu’à">
              {order.redirectExpiresAt ? formatDateTime(order.redirectExpiresAt) : NONE}
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
      </div>

      <Panel title="Chronologie">
        <OrderTimeline events={events} />
      </Panel>

      <section aria-labelledby="notifications-title" className="space-y-3">
        <CardTitle as="h2">
          <span id="notifications-title">Notifications</span>
        </CardTitle>
        <NotificationsTable
          rows={notifications.map((row) => toListItem(row, order))}
          empty="Aucune notification pour cette commande."
        />
      </section>

      <RawJson title="Données brutes de la commande" value={order} />
    </div>
  );
}
