import type { Metadata } from 'next';
import { Alert } from '@/components/ui/Alert';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { dbConfigured } from '@/lib/env';
import { getSettings } from '@/lib/settings/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Paramètres</h1>
        <p className="mt-1 max-w-3xl text-sm leading-snug text-ink-soft">
          Ces valeurs décident du prix affiché au client, de qui est prévenu et de ce que le site promet.
          Enregistrer invalide les devis en cours : une commande calculée sur les anciens paramètres sera refusée
          plutôt que facturée à un montant que le client n’a pas vu.
        </p>
      </header>

      {dbConfigured() ? null : (
        <Alert tone="danger" title="Base de données non configurée">
          Les paramètres affichés sont les valeurs par défaut du code et ne peuvent pas être enregistrés. Renseignez
          <code className="mx-1">DATABASE_URL</code> puis lancez les migrations.
        </Alert>
      )}

      <SettingsForm settings={settings} />
    </div>
  );
}
