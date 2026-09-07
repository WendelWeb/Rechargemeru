import type { Metadata } from 'next';
import { NotificationsTable } from '@/components/admin/NotificationsTable';
import { listRecentNotifications } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Notifications' };

const LIMIT = 200;

export default async function AdminNotificationsPage() {
  const rows = await listRecentNotifications(LIMIT);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Notifications</h1>
        <p className="mt-0.5 max-w-3xl text-sm leading-snug text-ink-soft">
          Les {LIMIT} derniers messages, opérateur et clients confondus. Une ligne « Ignorée » signifie que le canal
          n’est pas configuré ou que le message avait déjà été envoyé ; une ligne « Renvoi » vient du bouton de la
          fiche commande.
        </p>
      </header>

      <NotificationsTable rows={rows} showOrder empty="Aucune notification enregistrée." />
    </div>
  );
}
