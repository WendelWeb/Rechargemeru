import type { Metadata } from 'next';
import { Alert } from '@/components/ui/Alert';
import { CardTitle } from '@/components/ui/Card';
import { HealthCard, HealthTests } from '@/components/admin/HealthCard';
import { hasBlockingProblem, integrationStatuses, notificationFreshness, whatsappTestable } from '@/lib/admin/health';
import { lastAdminNotificationByChannel } from '@/lib/admin/queries';
import { formatDateTime } from '@/lib/format';
import { emailConfigured } from '@/lib/notifications/email';
import { moncashConfigured } from '@/lib/payments/moncash';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@/lib/orders/types';
import { getSettings } from '@/lib/settings/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Santé' };

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp automatique',
  whatsapp_manual: 'WhatsApp manuel',
};

const FRESHNESS_TEXT = {
  ok: { tone: 'text-mint-deep', label: 'à jour' },
  stale: { tone: 'text-sun-deep', label: 'plus de 48 h' },
  never: { tone: 'text-coral-deep', label: 'jamais reçu' },
} as const;

export default async function AdminHealthPage() {
  const now = new Date();
  const [settings, lastByChannel] = await Promise.all([getSettings(), lastAdminNotificationByChannel()]);
  const statuses = integrationStatuses();
  const blocking = hasBlockingProblem(statuses);

  const emailReady = emailConfigured() && settings.adminEmails.length > 0;
  const whatsappReady = whatsappTestable() && settings.adminWhatsappNumbers.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Santé</h1>
        <p className="mt-0.5 max-w-3xl text-sm leading-snug text-ink-soft">
          Ce que ce serveur peut faire en ce moment. Aucun secret n’est affiché : seulement s’il est présent et ce
          qu’il permet.
        </p>
      </header>

      {blocking ? (
        <Alert tone="danger" title="Une brique essentielle manque">
          Tant qu’elle n’est pas configurée, une commande peut être payée sans que vous en soyez averti. Corrigez les
          lignes en rouge ci-dessous avant d’annoncer le site.
        </Alert>
      ) : null}

      <section aria-labelledby="integrations-title">
        <CardTitle as="h2" className="mb-3">
          <span id="integrations-title">Intégrations</span>
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {statuses.map((status) => (
            <HealthCard key={status.id} status={status} />
          ))}
        </div>
      </section>

      <section aria-labelledby="alerts-title">
        <CardTitle as="h2" className="mb-1">
          <span id="alerts-title">Dernière alerte reçue par canal</span>
        </CardTitle>
        <p className="mb-3 text-sm text-ink-soft">
          Un canal muet depuis plus de deux jours ressemble à « aucune commande » jusqu’à ce qu’un paiement soit
          manqué.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {NOTIFICATION_CHANNELS.map((channel) => {
            const at = lastByChannel[channel];
            const freshness = notificationFreshness(at, now);
            const style = FRESHNESS_TEXT[freshness];
            return (
              <div key={channel} className="rounded-card border border-line bg-paper p-4 shadow-card">
                <dt className="text-sm font-medium text-ink-soft">{CHANNEL_LABELS[channel]}</dt>
                <dd className="mt-1 text-[15px] text-ink">{at ? formatDateTime(at) : 'Aucune'}</dd>
                <p className={`mt-1 text-xs font-semibold ${style.tone}`}>{style.label}</p>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-labelledby="tests-title">
        <CardTitle as="h2" className="mb-1">
          <span id="tests-title">Tests</span>
        </CardTitle>
        <p className="mb-3 text-sm text-ink-soft">
          Ces boutons envoient de vrais messages aux destinataires configurés dans les paramètres. Le test MonCash
          n’engage aucun paiement : il interroge une référence qui ne peut pas exister.
        </p>
        <HealthTests emailReady={emailReady} whatsappReady={whatsappReady} moncashReady={moncashConfigured()} />
      </section>
    </div>
  );
}
