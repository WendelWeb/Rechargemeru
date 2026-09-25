/**
 * lib/whatsapp/catalogue — every message the operator can send, gathered
 * from one file per group. The order of the groups is the order of the menu;
 * inside a group, the order of the file.
 */
import { TONE_LABELS, WHATSAPP_TONES, type CatalogueEntry, type WhatsAppTone } from '@/lib/whatsapp/types';
import { ENTRIES as aide } from './aide';
import { ENTRIES as apres } from './apres';
import { ENTRIES as confiance } from './confiance';
import { ENTRIES as fin } from './fin';
import { ENTRIES as paiement } from './paiement';
import { ENTRIES as questions } from './questions';
import { ENTRIES as relance } from './relance';

export const CATALOGUE: readonly CatalogueEntry[] = [
  ...relance,
  ...aide,
  ...questions,
  ...confiance,
  ...apres,
  ...paiement,
  ...fin,
];

export const CATALOGUE_IDS: ReadonlySet<string> = new Set(CATALOGUE.map((entry) => entry.id));

const BY_ID: ReadonlyMap<string, CatalogueEntry> = new Map(CATALOGUE.map((entry) => [entry.id, entry]));

export function catalogueEntry(id: string): CatalogueEntry | undefined {
  return BY_ID.get(id);
}

/**
 * What the order history shows for a manual WhatsApp send. The journal
 * records `id@tone` (« payment_reminder@fun » → « Rappel de paiement (Fun) »);
 * older rows carry the bare id. Unknown labels are returned as they are.
 */
export function manualMessageLabel(label: string): string | null {
  const [id, tone] = label.split('@');
  const entry = BY_ID.get(id);
  if (!entry) return null;
  return (WHATSAPP_TONES as readonly string[]).includes(tone ?? '')
    ? `${entry.label} (${TONE_LABELS[tone as WhatsAppTone]})`
    : entry.label;
}
