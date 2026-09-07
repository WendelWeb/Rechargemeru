/**
 * lib/env.ts — the one place that answers "is X configured?" from the
 * environment. Values are read at call time (never at module load) so a test
 * can set them per case and a serverless instance never caches a stale view.
 * Nothing here logs a value or hands one to the browser.
 */

/** `process.env[name]`, trimmed; `undefined` when unset or blank. */
export function envTrim(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** True only when a database read is worth attempting (`DATABASE_URL` set). */
export function dbConfigured(): boolean {
  return envTrim('DATABASE_URL') !== undefined;
}

/** Node build mode: `next build` / `next start`, as opposed to dev and tests. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** The Vercel production deployment (not a preview, not a local build). */
export function isVercelProduction(): boolean {
  return envTrim('VERCEL_ENV') === 'production';
}
