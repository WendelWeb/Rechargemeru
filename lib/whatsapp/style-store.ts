/**
 * lib/whatsapp/style-store.ts — reads and writes the operator's WhatsApp
 * coaching (`whatsapp_style`, one row).
 *
 * Reads never throw: no database, no row yet, or a failed query all answer
 * the default style, so the message menu always works. Writes may throw — the
 * admin action catches them and says so.
 */
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import { CATALOGUE_IDS } from '@/lib/whatsapp/catalogue';
import { normalizeStyle } from '@/lib/whatsapp/style';
import { DEFAULT_WHATSAPP_STYLE, type WhatsAppStyle } from '@/lib/whatsapp/types';

const ID = 'singleton';

/** The coaching, normalised; the defaults whenever it cannot be read. Memoised per request. */
export const getWhatsAppStyle = cache(async (): Promise<WhatsAppStyle> => {
  if (!dbConfigured()) return DEFAULT_WHATSAPP_STYLE;
  try {
    const [row] = await db.select().from(schema.whatsappStyle).where(eq(schema.whatsappStyle.id, ID)).limit(1);
    return normalizeStyle(row?.style ?? {}, CATALOGUE_IDS);
  } catch (err) {
    console.error(`[whatsapp/style-store] read failed: ${err instanceof Error ? err.message : String(err)}`);
    return DEFAULT_WHATSAPP_STYLE;
  }
});

/**
 * The stored style for a WRITE: throws when it cannot be read, instead of
 * answering the defaults. Saving on top of a failed read would replace every
 * rewrite, joke and closing line the operator ever coached with nothing.
 */
export async function readWhatsAppStyleStrict(): Promise<WhatsAppStyle> {
  const [row] = await db.select().from(schema.whatsappStyle).where(eq(schema.whatsappStyle.id, ID)).limit(1);
  return normalizeStyle(row?.style ?? {}, CATALOGUE_IDS);
}

/** Saves a whole style (normalised first) and returns what was stored. */
export async function saveWhatsAppStyle(style: unknown): Promise<WhatsAppStyle> {
  const clean = normalizeStyle(style, CATALOGUE_IDS);
  const now = new Date();
  await db
    .insert(schema.whatsappStyle)
    .values({ id: ID, style: clean, updatedAt: now })
    .onConflictDoUpdate({ target: schema.whatsappStyle.id, set: { style: clean, updatedAt: now } });
  return clean;
}
