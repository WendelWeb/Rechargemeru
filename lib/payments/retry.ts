/**
 * lib/payments/retry.ts — asking a provider again, but only when it helps.
 *
 * Two failures used to strand a customer who had really paid:
 *
 *   1. A TRANSIENT PROVIDER ERROR. A timeout during the return callback ended
 *      the request with "error", and nothing re-checked until the cron —
 *      money taken, order still `pending_payment`, customer staring at it.
 *   2. A "NOT PAID YET" ANSWER. Bazik can still report an order as pending for
 *      a moment after the customer confirms on their handset. Reading that as
 *      "they backed out" invites a SECOND payment for an order already paid.
 *
 * `retrieveWithRetry` is bounded on purpose: with the default schedule it
 * costs at most ~1.3 s of extra wait inside the customer's own redirect
 * before answering honestly. The reconciliation cron covers everything past
 * that. It is generic over the provider result so both rails share it, and
 * the caller decides what "settled" means (paid, a final failure, and —
 * when it chooses — an unpaid answer).
 *
 * `fn` is expected to honour the never-throw contract of every provider
 * module; this helper adds no try/catch of its own because it cannot invent a
 * failure value for an arbitrary `T`.
 */

/**
 * A provider failure worth asking again about, as opposed to an answer.
 *
 * `timeout`, `network` and 5xx mean Bazik/Digicel/Kobara had a bad second,
 * not that the money didn't move. Everything else (`not_found`,
 * `not_configured`, `order_provider_unavailable`, `unsupported_by_provider`,
 * a 4xx) is a real answer: asking again would only get the same one, slower.
 */
export function isTransient(message: string): boolean {
  return (
    message === 'timeout' ||
    message === 'network' ||
    /^HTTP 5\d\d/.test(message) ||
    /fetch|network|ECONN|socket/i.test(message)
  );
}

/** Attempt schedule in milliseconds — the pause BEFORE attempt 2 and 3. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [400, 900];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `fn`, and calls it again after each delay in `delaysMs` until
 * `isSettled` accepts the answer or the schedule runs out. Always returns the
 * LAST answer, so an exhausted retry still reports what the provider said.
 */
export async function retrieveWithRetry<T extends { ok: boolean }>(
  fn: () => Promise<T>,
  isSettled: (r: T) => boolean,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<T> {
  let last = await fn();
  for (const delay of delaysMs) {
    if (isSettled(last)) return last;
    await sleep(delay);
    last = await fn();
  }
  return last;
}

/**
 * The usual "settled" rule for a payment retrieval: a paid answer is final,
 * an unpaid answer is final unless the caller asked to wait for the wallet
 * to catch up (`retryOnUnpaid`), and a failure is final unless transient.
 */
export function paymentSettled(
  r: { ok: true; paid: boolean } | { ok: false; message: string },
  opts: { retryOnUnpaid?: boolean } = {},
): boolean {
  if (r.ok) return r.paid || !opts.retryOnUnpaid;
  return !isTransient(r.message);
}
