import type { Metadata } from 'next';
import { WhatsAppCoach } from '@/components/admin/WhatsAppCoach';
import { formatDateTime, formatHtg, formatUsd, formatUsdShort } from '@/lib/format';
import { HTG_WALLET_MAX } from '@/lib/pricing/money';
import { getSettings } from '@/lib/settings/store';
import { siteUrl } from '@/lib/site-url';
import type { OrderVars } from '@/lib/whatsapp/render';
import { getWhatsAppStyle } from '@/lib/whatsapp/style-store';
import type { WhatsAppLocale } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Messages WhatsApp' };

/**
 * « Messages » — the operator coaches how his WhatsApp messages sound. The
 * previews run on an invented order (Jean Baptiste, MR-7F3K2QAB) with the
 * live settings — rate-free facts only, nothing real is shown or sent.
 */
export default async function AdminMessagesPage() {
  const [style, settings] = await Promise.all([getWhatsAppStyle(), getSettings()]);
  const root = siteUrl();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60_000);

  const sample = (locale: WhatsAppLocale): OrderVars => ({
    prenom: 'Jean',
    nom: 'Jean Baptiste',
    reference: 'MR-7F3K2QAB',
    montant_usd: formatUsd(2000, locale),
    montant_htg: formatHtg(3625),
    montant_recu: formatHtg(3625),
    methode: 'MonCash',
    compte_meru: 'jean.baptiste@gmail.com',
    ref_meru: 'TR58213',
    transaction: '178933654959',
    lien_suivi: `${root}/${locale}/commande/MR-7F3K2QAB`,
    lien_accueil: `${root}/${locale}`,
    entreprise: settings.businessName,
    echeance: formatDateTime(expires),
    delai: locale === 'ht' ? settings.fulfilmentSlaHt : settings.fulfilmentSlaFr,
    heures: settings.supportHours,
    plafond: formatHtg(HTG_WALLET_MAX),
    montant_min: formatUsdShort(settings.minUsdCents, locale),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Messages WhatsApp</h1>
        <p className="mt-1 max-w-3xl text-sm leading-snug text-ink-soft">
          Apprenez à vos messages à parler comme vous : le ton, vos emojis, votre signature, vos blagues, et vos
          propres mots pour chaque message. Tout s’applique dans la fenêtre « Écrire au client » de chaque commande.
        </p>
      </header>
      <WhatsAppCoach style={style} sample={{ fr: sample('fr'), ht: sample('ht') }} businessName={settings.businessName} />
    </div>
  );
}
