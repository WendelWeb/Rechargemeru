/**
 * lib/settings/store.ts — the single `platform_settings` row, read and
 * written by the app.
 *
 * Reads are GATED and NEVER THROW: no `DATABASE_URL`, no singleton row yet, or
 * a failed query all resolve to the code defaults (with the
 * `NEXT_PUBLIC_USD_TO_HTG` rescue rate), so the public site renders and
 * `next build` succeeds without a database. Writes upsert the singleton and
 * MAY throw — the admin action wraps them and shows the message.
 *
 * `updatedAt` is the quote fingerprint: every order request carries the
 * value the customer's receipt was computed from, and `createOrder` refuses
 * a stale one, so only `updateSettings` ever touches it.
 *
 * Admin authentication lives in Clerk: this module holds no login state.
 */
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import type { PlatformSettingsRow } from '@/lib/orders/types';
import type { QuoteSettings } from '@/lib/pricing/quote';
import { DEFAULT_SETTINGS, SETTINGS_ID } from '@/lib/settings/defaults';
import type { SettingsInput } from '@/lib/settings/schema';
import type { Settings } from '@/lib/settings/types';

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

/** `NEXT_PUBLIC_USD_TO_HTG` as a usable rate, or `null`. Read literally so Next can inline it. */
function rescueRate(): number | null {
  const raw = process.env.NEXT_PUBLIC_USD_TO_HTG?.trim().replace(',', '.');
  if (!raw) return null;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 && rate <= 10_000 ? rate : null;
}

/** The code defaults, with the rescue rate when one is set. */
function fallbackSettings(): Settings {
  const rate = rescueRate();
  return { ...DEFAULT_SETTINGS, ...(rate !== null ? { fxRateHtg: rate } : {}) };
}

/** Defaults merged under the stored row, so a column added later still has a value. */
function rowToSettings(row: PlatformSettingsRow): Settings {
  return {
    fxRateHtg: Number.isFinite(row.fxRateHtg) && row.fxRateHtg > 0 ? row.fxRateHtg : DEFAULT_SETTINGS.fxRateHtg,
    feeRules: Array.isArray(row.feeRules) ? row.feeRules : DEFAULT_SETTINGS.feeRules,
    amountToleranceHtg: row.amountToleranceHtg,
    minUsdCents: row.minUsdCents,
    maxUsdCents: row.maxUsdCents,
    orderTtlMinutes: row.orderTtlMinutes,
    adminEmails: Array.isArray(row.adminEmails) ? row.adminEmails : [],
    adminWhatsappNumbers: Array.isArray(row.adminWhatsappNumbers) ? row.adminWhatsappNumbers : [],
    notifyAdminEvents: Array.isArray(row.notifyAdminEvents) ? row.notifyAdminEvents : DEFAULT_SETTINGS.notifyAdminEvents,
    notifyCustomerEvents: Array.isArray(row.notifyCustomerEvents)
      ? row.notifyCustomerEvents
      : DEFAULT_SETTINGS.notifyCustomerEvents,
    meruAccountTypes:
      Array.isArray(row.meruAccountTypes) && row.meruAccountTypes.length > 0
        ? row.meruAccountTypes
        : DEFAULT_SETTINGS.meruAccountTypes,
    businessName: row.businessName || DEFAULT_SETTINGS.businessName,
    supportWhatsapp: row.supportWhatsapp?.trim() || null,
    supportHours: row.supportHours || DEFAULT_SETTINGS.supportHours,
    fulfilmentSlaFr: row.fulfilmentSlaFr || DEFAULT_SETTINGS.fulfilmentSlaFr,
    fulfilmentSlaHt: row.fulfilmentSlaHt || DEFAULT_SETTINGS.fulfilmentSlaHt,
    meruHelpFr: row.meruHelpFr?.trim() || DEFAULT_SETTINGS.meruHelpFr,
    meruHelpHt: row.meruHelpHt?.trim() || DEFAULT_SETTINGS.meruHelpHt,
    updatedAt: row.updatedAt,
  };
}

async function readRow(): Promise<PlatformSettingsRow | null> {
  const [row] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, SETTINGS_ID)).limit(1);
  return row ?? null;
}

const readSettings = cache(async (): Promise<Settings> => {
  if (!dbConfigured()) return fallbackSettings();
  try {
    const row = await readRow();
    return row ? rowToSettings(row) : fallbackSettings();
  } catch (err) {
    console.error(`[settings] read failed, using defaults: ${errorText(err)}`);
    return fallbackSettings();
  }
});

/**
 * The live settings. Never throws; memoised per request (React `cache`) so
 * the layout, the page and the actions of one request share a single read.
 */
export async function getSettings(): Promise<Settings> {
  return readSettings();
}

/** The slice of the settings the quote engine needs, safe to hand to the browser. */
export function toQuoteSettings(s: Settings): QuoteSettings {
  return {
    fxRateHtg: s.fxRateHtg,
    feeRules: s.feeRules,
    minUsdCents: s.minUsdCents,
    maxUsdCents: s.maxUsdCents,
    settingsUpdatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Persists validated settings (upsert of the singleton) and returns what is
 * now stored. Throws without a database or on a failed write.
 */
export async function updateSettings(input: SettingsInput): Promise<Settings> {
  if (!dbConfigured()) throw new Error('Base de données non configurée : les paramètres ne peuvent pas être enregistrés.');
  const updatedAt = new Date();
  const values = {
    fxRateHtg: input.fxRateHtg,
    feeRules: input.feeRules,
    amountToleranceHtg: input.amountToleranceHtg,
    minUsdCents: input.minUsdCents,
    maxUsdCents: input.maxUsdCents,
    orderTtlMinutes: input.orderTtlMinutes,
    adminEmails: input.adminEmails,
    adminWhatsappNumbers: input.adminWhatsappNumbers,
    notifyAdminEvents: input.notifyAdminEvents,
    notifyCustomerEvents: input.notifyCustomerEvents,
    meruAccountTypes: input.meruAccountTypes,
    businessName: input.businessName,
    supportWhatsapp: input.supportWhatsapp,
    supportHours: input.supportHours,
    fulfilmentSlaFr: input.fulfilmentSlaFr,
    fulfilmentSlaHt: input.fulfilmentSlaHt,
    meruHelpFr: input.meruHelpFr,
    meruHelpHt: input.meruHelpHt,
    updatedAt,
  };
  const [row] = await db
    .insert(schema.platformSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: values })
    .returning();
  if (!row) throw new Error("Les paramètres n'ont pas été enregistrés.");
  return rowToSettings(row);
}
