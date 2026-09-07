/**
 * lib/payments/moncash.ts — the MonCash facade: picks a provider, then gets
 * out of the way.
 *
 * MonCash can be reached two ways and which one is available depends on
 * paperwork, not on code:
 *
 *   - `direct` — Digicel's own API. No middleman, no aggregator fee, but it
 *                needs a Digicel merchant contract that takes weeks.
 *   - `bazik`  — Bazik (api.bazik.io), a Haitian aggregator fronting MonCash
 *                with self-serve credentials, so it can be live today.
 *
 * Everything downstream — order creation, both callbacks, settlement, the
 * admin health page — imports from HERE and never learns which one answered.
 * Switching is `MONCASH_PROVIDER=direct|bazik`, not a refactor.
 *
 * SELECTION RULE (`pickMoncashProvider`): honour MONCASH_PROVIDER when it
 * names a provider that is actually configured. Naming an unconfigured
 * provider does NOT silently use the other one — it resolves to null, so a
 * typo surfaces as "MonCash not configured" instead of quietly charging
 * through a different company than intended. Outside production, an empty
 * MONCASH_PROVIDER falls back to whichever provider has credentials
 * (preferring `direct`, the cheaper path). IN PRODUCTION IT FAILS CLOSED:
 * the operator must name the provider, because guessing from whichever keys
 * happen to be present is how a rotated credential switches companies on a
 * live site without anyone deciding it.
 */
import { isProduction, isVercelProduction } from '@/lib/env';
import {
  directProvider,
  directHost,
  directMode,
  directRedirectUrl,
  directBasicAuth,
  isDirectPaid,
  resetDirectTokenCache,
  retrieveByTransactionId,
} from './moncash/direct';
import type { DirectTransactionPayment } from './moncash/direct';
import { bazikProvider, bazikMode, isBazikPaid, resetBazikTokenCache } from './moncash/bazik';
import type {
  MoncashCreateInput,
  MoncashFailure,
  MoncashMode,
  MoncashOrder,
  MoncashPayment,
  MoncashProvider,
  MoncashProviderId,
} from './moncash/types';

export type {
  MoncashCreateInput,
  MoncashMode,
  MoncashFailure,
  MoncashOrder,
  MoncashPayment,
  MoncashProvider,
  MoncashProviderId,
};
export { usdCentsToHtg, MONCASH_MAX_HTG } from './moncash/types';

/** A payment looked up by Digicel's transaction id, plus the order it belongs to. */
export type MoncashTransactionPayment = DirectTransactionPayment;

/** Both implementations, in preference order for the non-production fallback. */
const PROVIDERS: MoncashProvider[] = [directProvider, bazikProvider];

/**
 * Pure — the selection rule, exported so it can be tested without env
 * juggling. `production` is passed in (not read here) for the same reason.
 */
export function pickMoncashProvider(
  requested: string | undefined,
  configured: Record<MoncashProviderId, boolean>,
  production: boolean,
): MoncashProviderId | null {
  const want = requested?.trim().toLowerCase();
  if (want === 'direct' || want === 'bazik') {
    // Explicit choice is honoured or refused — never silently redirected to
    // the other provider, which would mean charging through a different
    // company than the operator asked for.
    return configured[want] ? want : null;
  }
  // Fail closed: production never guesses which company moves the money.
  if (production) return null;
  if (configured.direct) return 'direct';
  if (configured.bazik) return 'bazik';
  return null;
}

/** The provider in force right now, or null when none is usable. */
export function activeMoncashProvider(): MoncashProvider | null {
  const id = pickMoncashProvider(
    process.env.MONCASH_PROVIDER,
    {
      direct: directProvider.configured(),
      bazik: bazikProvider.configured(),
    },
    isProduction(),
  );
  return id ? (PROVIDERS.find((p) => p.id === id) ?? null) : null;
}

/** True when SOME provider can take a MonCash payment. */
export function moncashConfigured(): boolean {
  return activeMoncashProvider() !== null;
}

/** Which environment the active provider points at; 'sandbox' when none. */
export function moncashMode(): MoncashMode {
  return activeMoncashProvider()?.mode() ?? 'sandbox';
}

/** Human-readable target, for the admin health page. */
export function moncashLabel(): string {
  return activeMoncashProvider()?.label() ?? 'aucun fournisseur configuré';
}

export function moncashProviderId(): MoncashProviderId | null {
  return activeMoncashProvider()?.id ?? null;
}

/**
 * May this browser start a MonCash payment?
 *
 * A rail whose credentials point at a sandbox never moves money, and the
 * sandbox answers "successful" without anyone paying. On the production
 * deployment such a rail is offered ONLY to a browser carrying an admin
 * session — the operator testing the flow — never to the public, who would
 * otherwise create orders that can never be recharged. Previews and local
 * runs are free to use it.
 */
export function moncashCheckoutAllowed(hasAdminSession: boolean): boolean {
  if (!moncashConfigured()) return false;
  return moncashMode() === 'live' || !isVercelProduction() || hasAdminSession;
}

/**
 * Creates a MonCash order through the active provider.
 *
 * The returned `providerRef` is what MUST be persisted to verify later — it is
 * our own order id for Digicel but Bazik's minted `BZK_…` id for Bazik, so a
 * caller that assumes it can re-derive it will silently break on a switch.
 */
export async function createMoncashOrder(
  input: MoncashCreateInput,
): Promise<MoncashOrder | MoncashFailure> {
  const provider = activeMoncashProvider();
  if (!provider) return { ok: false, message: 'not_configured' };
  return provider.createOrder(input);
}

/** Asks the active provider whether `providerRef` was actually paid. */
export async function retrieveMoncashOrder(
  providerRef: string,
): Promise<MoncashPayment | MoncashFailure> {
  const provider = activeMoncashProvider();
  if (!provider) return { ok: false, message: 'not_configured' };
  return provider.checkOrder(providerRef);
}

/**
 * Asks a SPECIFIC provider whether `providerRef` was paid, instead of
 * whichever one `activeMoncashProvider()` resolves to right now.
 *
 * WHY THIS EXISTS: `orders.provider` records which provider actually created
 * an order. Digicel and Bazik mint incompatible reference formats and neither
 * recognises the other's — so if the env-driven default changes between
 * order creation and settlement (MONCASH_PROVIDER edited, credentials
 * rotated), verifying through the fresh `activeMoncashProvider()` would ask
 * the WRONG company about a real, paid order and get back "not found". This
 * asks the one that actually minted the reference — and does so even when the
 * facade currently resolves to nothing (production without MONCASH_PROVIDER),
 * because an existing order's provider is a fact, not a preference.
 *
 * `providerId: null` falls back to the env-driven behaviour, for a row that
 * never recorded its provider.
 */
export async function retrieveMoncashOrderFrom(
  providerId: MoncashProviderId | null,
  providerRef: string,
): Promise<MoncashPayment | MoncashFailure> {
  if (!providerId) return retrieveMoncashOrder(providerRef);
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider || !provider.configured()) {
    // Never silently ask the OTHER provider — same rule as
    // `pickMoncashProvider`. The order was created through `providerId`; if
    // that one is gone, the honest answer is "can't verify", not a
    // false-negative from asking a company that never saw this payment.
    return { ok: false, message: 'order_provider_unavailable' };
  }
  return provider.checkOrder(providerRef);
}

/**
 * Looks a payment up by DIGICEL's transaction id and reports which of our
 * orders it belongs to (`orderId`, from `payment.reference`).
 *
 * Direct provider only: Digicel's fixed return URL can come back carrying
 * nothing but `?transactionId=…`, and this is how the retour route finds the
 * order. Bazik returns the customer to a per-order URL and offers no such
 * lookup, so through Bazik the answer is `unsupported_by_provider` — a "can't
 * tell", never a "not paid".
 */
export async function retrieveMoncashByTransactionId(
  transactionId: string,
): Promise<MoncashTransactionPayment | MoncashFailure> {
  const provider = activeMoncashProvider();
  if (!provider) return { ok: false, message: 'not_configured' };
  if (provider.id !== 'direct') return { ok: false, message: 'unsupported_by_provider' };
  return retrieveByTransactionId(transactionId);
}

/* ---------------------- direct-provider specifics ------------------------ */
/* Re-exported because the admin health page and the unit tests reason about
 * Digicel's own hosts and redirect URLs. Nothing in the order path uses these
 * — they are provider-specific by nature. */
export {
  directHost as moncashHost,
  directRedirectUrl as moncashRedirectUrl,
  directBasicAuth as moncashBasicAuth,
  isDirectPaid as isMoncashPaid,
  directMode,
  bazikMode,
  isBazikPaid,
};

/** Test seam: clear every provider's cached bearer. */
export function resetMoncashTokenCache(): void {
  resetDirectTokenCache();
  resetBazikTokenCache();
}
