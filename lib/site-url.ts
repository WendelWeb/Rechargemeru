/**
 * lib/site-url.ts — the absolute origin used in links we send out of the app
 * (notification emails and WhatsApp messages). Callback URLs handed to the
 * payment providers do NOT use this: they derive from the request origin so
 * every Vercel preview stays isolated.
 *
 * Resolution: `NEXT_PUBLIC_SITE_URL` (canonical, trailing slash dropped) →
 * `https://<VERCEL_URL>` outside production (previews get working links) →
 * `http://localhost:3000`. In production the canonical domain must be set
 * explicitly, so a stale `*.vercel.app` host never reaches a customer.
 */
import { envTrim, isVercelProduction } from '@/lib/env';

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

export function siteUrl(): string {
  // Read literally so Next.js can inline it in client bundles as well.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return stripTrailingSlashes(explicit);

  const vercelUrl = envTrim('VERCEL_URL');
  if (vercelUrl && !isVercelProduction()) {
    return `https://${stripTrailingSlashes(vercelUrl)}`;
  }

  return 'http://localhost:3000';
}
