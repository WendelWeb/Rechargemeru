'use server';

/**
 * lib/admin/whatsapp-actions.ts — the operator coaching his WhatsApp messages.
 *
 * Same lock as every other write: `await requireAdmin()` first, because a
 * Server Action is an endpoint of its own. The style lives in its own table
 * (see `whatsapp_style` in db/schema.ts), so nothing here can invalidate a
 * customer's quote.
 */
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/admin';
import { CATALOGUE_IDS } from '@/lib/whatsapp/catalogue';
import { jokesFromText } from '@/lib/whatsapp/style';
import { readWhatsAppStyleStrict, saveWhatsAppStyle } from '@/lib/whatsapp/style-store';
import { unknownPlaceholders } from '@/lib/whatsapp/template';
import {
  STYLE_LIMITS,
  WHATSAPP_LOCALES,
  WHATSAPP_TONES,
  overrideKey,
  type WhatsAppLocale,
  type WhatsAppTone,
} from '@/lib/whatsapp/types';

export type CoachState = { ok?: boolean; message?: string; error?: string };

/*
 * Both actions read the stored style STRICTLY before merging their change:
 * if it cannot be read, the save fails with a message instead of writing the
 * defaults over everything the operator coached.
 */

function revalidateAdmin() {
  // Every admin page can open the message menu: refresh them all.
  revalidatePath('/admin', 'layout');
}

function failed(where: string, err: unknown): CoachState {
  console.error(`[whatsapp-actions] ${where} failed: ${err instanceof Error ? err.message : String(err)}`);
  return { error: 'L’enregistrement a échoué. Réessayez dans un instant.' };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** « Votre style » : default tone, emojis, signature, closing lines, jokes. Rewrites are kept as they are. */
export async function saveWhatsAppStyleAction(_prev: CoachState, formData: FormData): Promise<CoachState> {
  await requireAdmin();
  try {
    const current = await readWhatsAppStyleStrict();
    const tone = field(formData, 'defaultTone');
    await saveWhatsAppStyle({
      ...current,
      defaultTone: (WHATSAPP_TONES as readonly string[]).includes(tone) ? tone : current.defaultTone,
      emojis: formData.get('emojis') === 'on',
      signatureName: field(formData, 'signatureName'),
      closing: { fr: field(formData, 'closingFr'), ht: field(formData, 'closingHt') },
      jokes: { fr: jokesFromText(field(formData, 'jokesFr')), ht: jokesFromText(field(formData, 'jokesHt')) },
    });
    revalidateAdmin();
    return { ok: true, message: 'Style enregistré. Il s’applique à tous les messages dès maintenant.' };
  } catch (err) {
    return failed('saveWhatsAppStyleAction', err);
  }
}

function isTone(value: string): value is WhatsAppTone {
  return (WHATSAPP_TONES as readonly string[]).includes(value);
}

function isLocale(value: string): value is WhatsAppLocale {
  return (WHATSAPP_LOCALES as readonly string[]).includes(value);
}

/**
 * The operator's own version of one message, for one tone and one language.
 * An empty text removes it (the built-in text comes back). A typo in a
 * placeholder is refused with its name, rather than sent to a customer as
 * « {prenmo} ».
 */
export async function saveMessageOverrideAction(
  id: string,
  tone: string,
  locale: string,
  text: string,
): Promise<CoachState> {
  await requireAdmin();
  if (!CATALOGUE_IDS.has(id) || !isTone(tone) || !isLocale(locale)) return { error: 'Message inconnu.' };
  const body = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (body.length > STYLE_LIMITS.overrideLength) {
    return { error: `Texte trop long : ${STYLE_LIMITS.overrideLength} caractères au plus.` };
  }
  const unknown = unknownPlaceholders(body);
  if (unknown.length > 0) {
    return { error: `Variable inconnue : ${unknown.map((name) => `{${name}}`).join(', ')}. Utilisez les pastilles proposées.` };
  }
  try {
    const current = await readWhatsAppStyleStrict();
    const overrides = { ...current.overrides };
    const key = overrideKey(id, tone, locale);
    if (body) overrides[key] = body;
    else delete overrides[key];
    await saveWhatsAppStyle({ ...current, overrides });
    revalidateAdmin();
    return { ok: true, message: body ? 'Votre version est enregistrée.' : 'Texte d’origine rétabli.' };
  } catch (err) {
    return failed('saveMessageOverrideAction', err);
  }
}
