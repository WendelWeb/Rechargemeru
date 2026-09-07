# Recharge Meru Implementation Plan (révision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js 16.3.4 web app where Haitian customers pay in gourdes (MonCash or NatCash) to have US dollars sent to their Meru account by the operator, with a full admin back-office, settings-driven pricing, and automatic email + WhatsApp notifications — built so that no sandbox order, duplicate callback, or mistyped identifier can make the operator send real dollars by mistake.

**Architecture:** App Router with one root layout (`app/layout.tsx`, `<html lang={await getLocale()}>`), a public site under `app/[locale]/` (next-intl fr/ht) and a French admin under `app/admin/` guarded by a signed cookie. A pure, isomorphic pricing engine computes the quote in the browser and on the server; the server freezes it onto each order and refuses a stale quote (409). Provider adapters (Digicel direct / Bazik for MonCash, Kobara for NatCash — ported from pnice-academy) are never-throw. `settleOrder` is the single path from callback to `paid`, uses compare-and-set updates (neon-http has no transactions) and injectable dependencies for tests. `notifyOrder` dedupes with a partial unique index and fans out to Resend + WhatsApp (Meta templates or Twilio) and a manual `wa.me` channel.

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript 5 strict, Tailwind CSS 4, next-intl 4.14, Drizzle ORM 0.45 + drizzle-kit 0.31 + @neondatabase/serverless 1.1, Zod 4.5, Vitest 5, lucide-react 1.41, tsx, dotenv.

**Spec:** `docs/superpowers/specs/2026-09-06-recharge-meru-design.md` (révision 2)

## Global Constraints

- Next.js **16.3.4** conventions only: `proxy.ts` (never `middleware.ts`, never `export const runtime` in it); `await params`, `await searchParams`, `await cookies()`, `await headers()`; no `next lint`; `PageProps<'/route'>` / `LayoutProps<'/route'>` global helpers may be used after `next typegen`. Read `node_modules/next/dist/docs/` when unsure.
- `cacheComponents` stays **off**. No `generateStaticParams`, no `setRequestLocale`. `app/[locale]/layout.tsx`, `app/admin/(protected)/layout.tsx` and every page that reads the database export `export const dynamic = 'force-dynamic'`.
- **neon-http has no transactions.** Every status change is one `UPDATE … WHERE id = ? AND status IN (…) RETURNING *`; zero rows ⇒ someone else won ⇒ do nothing more.
- Money: USD in **integer cents**, HTG in **integer gourdes**; FX rate read as `number` from `numeric(10,4)` with `mode: 'number'` and converted once to integer ten-thousandths for arithmetic; percent fees to integer hundredths. Invariant `baseHtg + Σ lines = totalHtg`.
- Provider and notification modules are **never-throw**: every failure is `{ ok: false, message }` or `{ sent: false, error }`.
- Secrets are read from `process.env` at call time, never logged, never sent to the browser.
- Sandbox orders (`orders.mode = 'sandbox'`) never appear in « à recharger » lists or totals, carry a « TEST » chip, and every notification about them starts with « [TEST — aucun argent réel, ne rien envoyer] ».
- Public copy in **French and Haitian Creole** via `messages/{fr,ht}/*.json` (same keys in both); admin copy in French, inline. Money labels: fr « 20 $ US », ht « 20 dola US », gourdes « 2 985 HTG » everywhere; never a bare « $ » or « dola ».
- Dates shown to humans use timezone **America/Port-au-Prince**.
- Admin code (`app/admin/**`, `components/admin/**`, `lib/admin/**`) never imports `@/i18n/navigation` (ESLint `no-restricted-imports`).
- Design: palette encre `#0E1B3D`, papier `#FFFFFF`, gris-bleu `#EEF2F8`, soleil `#FFC531` (single accent), menthe `#159F6C`, corail `#DC3D43`, MonCash `#E4002B`, NatCash `#F7941D`; fonts `Bricolage Grotesque` (display) + `Figtree` (body) via `next/font/google`; no all-caps labels, no decorative numbering, no entrance animations, visible focus rings, `prefers-reduced-motion` respected. Beautiful, professional, trustworthy.
- Tests: Vitest; `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` (with **no** `DATABASE_URL`) must all pass.
- Do not commit. The operator commits.
- File ownership: each task lists the files it may create or modify. Never edit a file owned by another task; if an interface is missing, stop and report.

---

## Already done (Wave 0)

`create-next-app@16.3.4` scaffold (TypeScript, Tailwind 4, ESLint flat config, App Router, `@/*` alias, no `src/`), all runtime and dev dependencies installed, `vitest.config.ts`, `drizzle.config.ts`, npm scripts (`dev build start lint typecheck test test:watch db:generate db:migrate db:push db:studio admin:hash`). `npm run typecheck` and `npm test` pass on the empty project. `app/layout.tsx` and `app/page.tsx` are the scaffold defaults (Task 8 replaces them).

## Reference code to port (read-only)

`C:/Users/stanl/Desktop/Personal Projects/pnice-academy/` — `lib/payments/gateway.ts`, `lib/payments/moncash.ts`, `lib/payments/moncash/{types,direct,bazik}.ts`, `lib/payments/natcash.ts`, `lib/payments/natcash/kobara.ts`, their `*.test.ts`, `lib/payments/moncash-order.ts` (retry logic), `lib/rate-limit.ts`, `lib/cron/auth.ts`, `lib/email/resend.ts`, `db/index.ts`, `i18n/*`. Copy what the task says, then adapt; never import from that project.

---

## Wave 1 — foundations (independent tasks, disjoint files)

### Task 1: Shared utilities — env, site URL, rate limit, cron auth, phone, format

**Files:**
- Create: `lib/env.ts`, `lib/site-url.ts`, `lib/site-url.test.ts`, `lib/rate-limit.ts`, `lib/rate-limit.test.ts`, `lib/cron/auth.ts`, `lib/cron/auth.test.ts`, `lib/phone.ts`, `lib/phone.test.ts`, `lib/format.ts`, `lib/format.test.ts`

**Interfaces (produces):**
- `lib/env.ts`: `envTrim(name): string | undefined`; `dbConfigured(): boolean`; `isProduction(): boolean` (`NODE_ENV === 'production'`); `isVercelProduction(): boolean` (`VERCEL_ENV === 'production'`).
- `lib/site-url.ts`: `siteUrl(): string` — `NEXT_PUBLIC_SITE_URL` (no trailing slash) → else if `VERCEL_ENV !== 'production'` and `VERCEL_URL` set → `https://${VERCEL_URL}` → else `http://localhost:3000`.
- `lib/rate-limit.ts`: `RateWindow`, `allowHit(hits, key, now, w)`, `rateLimit(bucket, key, w, now?)`, `ipFromHeaders(h: Headers)`, `RATE_LIMITS = { orderIp: { max: 60, windowMs: 600_000 }, orderPhone: { max: 5, windowMs: 600_000 }, recheck: { max: 30, windowMs: 60_000 }, retour: { max: 20, windowMs: 300_000 }, track: { max: 20, windowMs: 300_000 }, login: { max: 10, windowMs: 900_000 } } as const`.
- `lib/cron/auth.ts`: `checkCronAuth(authHeader): 'ok' | 'not_configured' | 'unauthorized'`; `cronAuthStatus(r): 503 | 401 | null`.
- `lib/phone.ts`: `normalizePhone(input: string): string | null` — strips non-digits, drops leading `00`; 8 digits ⇒ Haitian (`+509`), `509` + 8 ⇒ Haitian, `1` + 10 ⇒ NANP (`+1…`), `+1`/`+509` prefixes accepted; Haitian local part must match `/^[2-5]\d{7}$/`; `isHaitian(e164): boolean`; `maskPhone(e164): string` (`+509 •••• 1234`, `+1 ••• ••• 1234`); `formatPhone(e164): string` (`+509 3700 1234`, `+1 555 123 4567`); `lastFour(e164): string`.
- `lib/format.ts`: `TIME_ZONE = 'America/Port-au-Prince'`; `formatHtg(htg): string` (`2 985 HTG`); `formatUsd(cents, locale: 'fr' | 'ht'): string` (fr `20,00 $ US`, ht `20,00 dola US`); `formatUsdShort(cents, locale)` (`20 $ US` / `20 dola US` when whole); `formatRate(rate: number, locale): string` (fr `1 $ US = 132,50 HTG`, ht `1 dola US = 132,50 HTG`); `formatDateTime(d: Date): string` (Port-au-Prince, `6 sept. 2026, 14:05`); `startOfDayPortAuPrince(now: Date): Date`; `startOfMonthPortAuPrince(now: Date): Date`; `localDayRange(yyyyMmDd: string): { from: Date; to: Date }` (Port-au-Prince day).

- [ ] **Step 1: Write the failing tests** (`lib/rate-limit.test.ts`, `lib/cron/auth.test.ts` as in pnice-academy but for the new `RATE_LIMITS` keys; plus):

```ts
// lib/phone.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, isHaitian, maskPhone, formatPhone, lastFour } from './phone';
describe('normalizePhone', () => {
  it('accepts Haitian numbers in every common spelling', () => {
    for (const s of ['3700 1234', '37-00-12-34', '+509 3700 1234', '50937001234', '0050937001234', '509 37001234']) {
      expect(normalizePhone(s)).toBe('+50937001234');
    }
  });
  it('accepts North American WhatsApp numbers', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('15551234567')).toBe('+15551234567');
  });
  it('rejects wrong lengths, leading 0/1 locals and other countries', () => {
    expect(normalizePhone('370012')).toBeNull();
    expect(normalizePhone('07001234')).toBeNull();
    expect(normalizePhone('17001234')).toBeNull();
    expect(normalizePhone('+33 6 12 34 56 78')).toBeNull();
  });
});
describe('helpers', () => {
  it('detects Haitian numbers', () => { expect(isHaitian('+50937001234')).toBe(true); expect(isHaitian('+15551234567')).toBe(false); });
  it('masks and formats', () => {
    expect(maskPhone('+50937001234')).toBe('+509 •••• 1234');
    expect(maskPhone('+15551234567')).toBe('+1 ••• ••• 4567');
    expect(formatPhone('+50937001234')).toBe('+509 3700 1234');
    expect(formatPhone('+15551234567')).toBe('+1 555 123 4567');
    expect(lastFour('+50937001234')).toBe('1234');
  });
});
```
```ts
// lib/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatHtg, formatUsd, formatUsdShort, formatRate, formatDateTime, startOfDayPortAuPrince, startOfMonthPortAuPrince, localDayRange } from './format';
const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');
describe('format', () => {
  it('gourdes', () => expect(norm(formatHtg(2985))).toBe('2 985 HTG'));
  it('dollars per locale', () => {
    expect(norm(formatUsd(2000, 'fr'))).toBe('20,00 $ US');
    expect(norm(formatUsd(2000, 'ht'))).toBe('20,00 dola US');
    expect(norm(formatUsdShort(2000, 'fr'))).toBe('20 $ US');
    expect(norm(formatUsdShort(2050, 'ht'))).toBe('20,50 dola US');
  });
  it('rate', () => expect(norm(formatRate(132.5, 'fr'))).toBe('1 $ US = 132,50 HTG'));
  it('dates in Port-au-Prince time', () => expect(formatDateTime(new Date('2026-09-06T18:05:00Z'))).toContain('14:05'));
  it('local day and month starts', () => {
    expect(startOfDayPortAuPrince(new Date('2026-09-06T18:05:00Z')).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(startOfDayPortAuPrince(new Date('2026-09-07T02:30:00Z')).toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(startOfMonthPortAuPrince(new Date('2026-09-06T18:05:00Z')).toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(startOfDayPortAuPrince(new Date('2026-01-15T12:00:00Z')).toISOString()).toBe('2026-01-15T05:00:00.000Z'); // winter, UTC-5
  });
  it('day range', () => {
    const r = localDayRange('2026-09-06');
    expect(r.from.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-09-07T04:00:00.000Z');
  });
});
```
```ts
// lib/site-url.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { siteUrl } from './site-url';
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });
describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL', () => { process.env.NEXT_PUBLIC_SITE_URL = 'https://x.y/'; expect(siteUrl()).toBe('https://x.y'); });
  it('uses VERCEL_URL outside production', () => { delete process.env.NEXT_PUBLIC_SITE_URL; process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_URL = 'abc.vercel.app'; expect(siteUrl()).toBe('https://abc.vercel.app'); });
  it('falls back to localhost', () => { delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.VERCEL_URL; expect(siteUrl()).toBe('http://localhost:3000'); });
});
```

- [ ] **Step 2: Run** — `npx vitest run lib` → FAIL (modules missing).
- [ ] **Step 3: Implement.** `lib/rate-limit.ts`: copy `pnice-academy/lib/rate-limit.ts`, replace `RATE_LIMITS`, rename the second parameter of `rateLimit` to `key` (callers pass an IP or a phone). `lib/cron/auth.ts`: copy verbatim. `lib/phone.ts`:
```ts
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) return haitian(digits);
  if (digits.length === 11 && digits.startsWith('509')) return haitian(digits.slice(3));
  if (digits.length === 11 && digits.startsWith('1')) return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+${digits}` : null;
  return null;
}
function haitian(local: string): string | null { return /^[2-5]\d{7}$/.test(local) ? `+509${local}` : null; }
export function isHaitian(e164: string): boolean { return e164.startsWith('+509'); }
export function lastFour(e164: string): string { return e164.slice(-4); }
export function maskPhone(e164: string): string { return isHaitian(e164) ? `+509 •••• ${lastFour(e164)}` : `+1 ••• ••• ${lastFour(e164)}`; }
export function formatPhone(e164: string): string {
  if (isHaitian(e164)) { const l = e164.slice(4); return `+509 ${l.slice(0, 4)} ${l.slice(4)}`; }
  const l = e164.slice(2); return `+1 ${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}`;
}
```
`lib/format.ts`: `Intl.NumberFormat('fr-FR')` for numbers; `formatUsd` uses 2 decimals, `formatUsdShort` drops decimals when `cents % 100 === 0`; the Port-au-Prince helpers use `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', … }).formatToParts` to read the wall clock and derive the zone offset (`offsetMs = now - Date.UTC(wall parts)`), then `Date.UTC(y, m, d) + offsetMs` for day/month starts; `localDayRange` builds `from` from the local midnight of that date and `to = startOfDay(from + 36 h)`.
- [ ] **Step 4: Run** — `npx vitest run lib` PASS; `npx tsc --noEmit` clean.

### Task 2: Database schema, client, migration, settings and order types

**Files:**
- Create: `db/schema.ts`, `db/index.ts`, `db/migrations/*` (generated), `lib/settings/types.ts`, `lib/settings/defaults.ts`, `lib/settings/schema.ts`, `lib/settings/schema.test.ts`, `lib/orders/types.ts`

**Interfaces (produces):**
- `lib/orders/types.ts`:
```ts
import type { orders, orderEvents, notifications, webhookLogs } from '@/db/schema';
export const ORDER_STATUSES = ['pending_payment', 'paid', 'needs_review', 'fulfilled', 'failed', 'expired', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_METHODS = ['moncash', 'natcash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ProviderId = 'direct' | 'bazik' | 'kobara';
export type GatewayMode = 'sandbox' | 'live';
export type Locale = 'fr' | 'ht';
export type Actor = 'system' | 'customer' | 'admin' | 'provider';
export const MERU_ACCOUNT_TYPES = ['email', 'username'] as const; // décision opérateur : email ou nom d'utilisateur Meru, jamais un téléphone
export type MeruAccountType = (typeof MERU_ACCOUNT_TYPES)[number];
export type QuoteLine = { id: string; label: string; kind: 'percent' | 'fixed'; value: number; basis: 'base' | 'subtotal'; amountHtg: number };
export type NotificationChannel = 'email' | 'whatsapp' | 'whatsapp_manual';
export type NotificationTemplate = 'created' | 'paid' | 'fulfilled' | 'failed' | 'expired' | 'needs_review' | 'refunded' | 'reminder_24h';
export type OrderRow = typeof orders.$inferSelect; export type NewOrder = typeof orders.$inferInsert;
export type OrderEventRow = typeof orderEvents.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect; export type NewNotification = typeof notifications.$inferInsert;
export type WebhookLogRow = typeof webhookLogs.$inferSelect;
```
- `lib/settings/types.ts`: `FeeRule = { id; label; kind: 'percent' | 'fixed'; value: number; basis: 'base' | 'subtotal'; minHtg?: number | null; maxHtg?: number | null; appliesTo: 'all' | 'moncash' | 'natcash'; enabled: boolean }`; `Settings = { fxRateHtg; feeRules; amountToleranceHtg; minUsdCents; maxUsdCents; orderTtlMinutes; adminEmails: string[]; adminWhatsappNumbers: string[]; notifyAdminEvents: NotificationTemplate[]; notifyCustomerEvents: NotificationTemplate[]; meruAccountTypes: MeruAccountType[]; businessName; supportWhatsapp: string | null; supportHours; fulfilmentSlaFr; fulfilmentSlaHt; meruHelpFr; meruHelpHt; updatedAt: Date | null }`.
- `lib/settings/defaults.ts`: `DEFAULT_SETTINGS` (fx 132, one rule `{ id: 'service', label: 'Frais de service', kind: 'percent', value: 5, basis: 'base', appliesTo: 'all', enabled: true }`, tolerance 0, min 500, max 50000, ttl 30, empty recipients, admin events `['paid','needs_review','failed']`, customer events `['created','paid','fulfilled','failed','needs_review','refunded']`, account types `['email', 'username']`, businessName 'Recharge Meru', supportWhatsapp null, supportHours '8 h – 20 h, 7 j/7', sla fr 'moins de 2 heures', ht 'mwens pase 2 èdtan', help texts: fr « Ouvrez l'application Meru, touchez votre profil et copiez l'email ou le nom d'utilisateur de votre compte. C'est cet identifiant que nous utilisons pour vous envoyer les dollars. » ht « Louvri aplikasyon Meru a, peze pwofil ou epi kopye imel oswa non itilizatè kont ou. Se idantifyan sa a nou itilize pou voye dola yo ba ou. », updatedAt null).
- `lib/settings/schema.ts`: `feeRuleSchema`, `settingsInputSchema` (Zod 4; rate `> 0`, `≤ 10000`, at most 4 decimals; percent value 0–100 with at most 2 decimals; fixed integer 0–75000; `minHtg ≤ maxHtg` when both; tolerance integer 0–5000; min ≥ 100, max ≥ min, max ≤ 1_000_000; ttl 5–1440; emails ≤ 10; E.164 `/^\+[1-9]\d{6,14}$/` ≤ 10; events arrays of `NotificationTemplate`; account types non-empty subset; strings bounded), `SettingsInput` type.
- `db/schema.ts` — tables exactly per spec §5. Key Drizzle details: `numeric('fx_rate_htg', { precision: 10, scale: 4, mode: 'number' })`; jsonb columns `.$type<…>()` with `.default([])` / `.default(['paid','needs_review','failed'])`; `orders` constraints `unique('orders_provider_ref_uq').on(t.provider, t.providerRef)`, `index('orders_status_created_idx').on(t.status, t.createdAt)`, `index('orders_phone_idx').on(t.customerPhone)`, `index('orders_mode_idx').on(t.mode)`; `notifications`: `uniqueIndex('notifications_dedupe_uq').on(t.orderId, t.template, t.audience, t.channel, t.recipient).where(sql\`status in ('pending','sent') and resend_of is null\`)`, plus `index('notifications_order_idx')`, `index('notifications_created_idx')`; `webhook_logs.matchedBy` text nullable.
- `db/index.ts`: `db`, `schema`, `isUniqueViolation(err)` (code `23505`, unwrapped from `cause`).

- [ ] **Step 1: Test** `lib/settings/schema.test.ts` (accepts defaults; refuses max < min, percent 101, non-E.164 WhatsApp, empty `meruAccountTypes`, a rule with `minHtg > maxHtg`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** all files. **Step 4:** `npx drizzle-kit generate --name init` (no DB needed) and inspect the SQL for the partial unique index and `numeric(10, 4)`. **Step 5:** `npx vitest run lib/settings` PASS; `npx tsc --noEmit` clean.

### Task 3: Pricing — integer money math and the isomorphic quote engine

**Files:**
- Create: `lib/pricing/money.ts`, `lib/pricing/money.test.ts`, `lib/pricing/quote.ts`, `lib/pricing/quote.test.ts`

**Interfaces (produces):**
- `money.ts`: `HTG_WALLET_MAX = 75_000`; `rateToE4(rate: number): number` (`Math.round(rate * 10_000)`); `usdCentsToHtg(cents: number, rate: number): number` (`max(1, round(cents * rateToE4(rate) / 1_000_000))`, 0 for non-positive input); `percentOf(amountHtg: number, percent: number): number` (`round(amountHtg * round(percent * 100) / 10_000)`); `effectiveRateHtg(totalHtg: number, usdCents: number): number` (`round(totalHtg * 1_000_000 / usdCents) / 10_000`).
- `quote.ts` (no imports from `db/`): `QUICK_AMOUNTS_USD = [5, 10, 20, 50, 100] as const`; `QuoteSettings = { fxRateHtg: number; feeRules: FeeRule[]; minUsdCents: number; maxUsdCents: number; settingsUpdatedAt: string | null }` (ISO string so it can cross the RSC boundary); `Quote = { usdCents; fxRateHtg; baseHtg; lines: QuoteLine[]; totalHtg; effectiveRateHtg; settingsUpdatedAt: string | null }`; `QuoteError = 'bad_amount' | 'below_minimum' | 'above_maximum' | 'wallet_limit'`; `QuoteResult`; `computeQuote({ usdCents, method, settings }): QuoteResult`.

- [ ] **Step 1: Tests**
```ts
// lib/pricing/quote.test.ts
import { describe, it, expect } from 'vitest';
import { computeQuote } from './quote';
const settings = {
  fxRateHtg: 132.5, minUsdCents: 500, maxUsdCents: 50000, settingsUpdatedAt: '2026-09-06T00:00:00.000Z',
  feeRules: [
    { id: 'svc', label: 'Frais de service', kind: 'percent' as const, value: 5, basis: 'base' as const, appliesTo: 'all' as const, enabled: true },
    { id: 'mc', label: 'Frais MonCash', kind: 'fixed' as const, value: 25, basis: 'base' as const, appliesTo: 'moncash' as const, enabled: true },
    { id: 'tax', label: 'Taxe', kind: 'percent' as const, value: 10, basis: 'subtotal' as const, appliesTo: 'all' as const, enabled: true },
    { id: 'off', label: 'Inactif', kind: 'fixed' as const, value: 999, basis: 'base' as const, appliesTo: 'all' as const, enabled: false },
  ],
};
describe('computeQuote', () => {
  it('computes base, percent on base, fixed per method, percent on subtotal', () => {
    const r = computeQuote({ usdCents: 2000, method: 'moncash', settings });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.quote.baseHtg).toBe(2650);
    expect(r.quote.lines.map((l) => l.amountHtg)).toEqual([133, 25, 281]); // 5 % of 2650 → 133 ; 10 % of (2650+133+25)=2808 → 281
    expect(r.quote.totalHtg).toBe(3089);
    expect(r.quote.baseHtg + r.quote.lines.reduce((a, l) => a + l.amountHtg, 0)).toBe(r.quote.totalHtg);
    expect(r.quote.effectiveRateHtg).toBe(154.45);
    expect(r.quote.settingsUpdatedAt).toBe(settings.settingsUpdatedAt);
  });
  it('skips another method’s fee', () => { const r = computeQuote({ usdCents: 2000, method: 'natcash', settings }); expect(r.ok && r.quote.totalHtg).toBe(3061); });
  it('applies min/max caps on a rule', () => {
    const s = { ...settings, feeRules: [{ ...settings.feeRules[0], minHtg: 200, maxHtg: 300 }] };
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: s }).ok && (computeQuote({ usdCents: 1000, method: 'moncash', settings: s }) as { ok: true; quote: { lines: { amountHtg: number }[] } }).quote.lines[0].amountHtg).toBe(200);
    expect((computeQuote({ usdCents: 50000, method: 'moncash', settings: { ...s, maxUsdCents: 100000 } }) as { ok: false; error: string }).error).toBe('wallet_limit');
  });
  it('refuses bad input', () => {
    expect(computeQuote({ usdCents: 400, method: 'moncash', settings })).toEqual({ ok: false, error: 'below_minimum' });
    expect(computeQuote({ usdCents: 60000, method: 'moncash', settings })).toEqual({ ok: false, error: 'above_maximum' });
    expect(computeQuote({ usdCents: 10.5, method: 'moncash', settings })).toEqual({ ok: false, error: 'bad_amount' });
    expect(computeQuote({ usdCents: 1000, method: 'moncash', settings: { ...settings, fxRateHtg: 0 } })).toEqual({ ok: false, error: 'bad_amount' });
  });
  it('uses integer math (no double rounding surprises)', () => {
    const r = computeQuote({ usdCents: 1999, method: 'natcash', settings: { ...settings, fxRateHtg: 132.1234, feeRules: [] } });
    expect(r.ok && r.quote.baseHtg).toBe(2641); // 1999 × 1321234 / 1e6 = 2641.147…
  });
});
```
`money.test.ts`: `rateToE4(132.5) === 1325000`; `usdCentsToHtg(2000, 132.5) === 2650`; `usdCentsToHtg(1, 0.001) === 1`; `usdCentsToHtg(0, 132) === 0`; `percentOf(2650, 5) === 133`; `percentOf(2650, 2.5) === 66`; `effectiveRateHtg(3089, 2000) === 154.45`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per Interfaces (lines carry `basis`; subtotal = `baseHtg + Σ previous lines`; apply `minHtg`/`maxHtg` after computing; `totalHtg > HTG_WALLET_MAX` ⇒ `wallet_limit`). **Step 4:** `npx vitest run lib/pricing` PASS; typecheck clean.

### Task 4: Payment providers (port from pnice-academy) + retry helper

**Files:**
- Create: `lib/payments/gateway.ts`, `lib/payments/moncash/types.ts`, `lib/payments/moncash/direct.ts`, `lib/payments/moncash/bazik.ts`, `lib/payments/moncash.ts`, `lib/payments/natcash/kobara.ts`, `lib/payments/natcash.ts`, `lib/payments/retry.ts`, `lib/payments/moncash.test.ts`, `lib/payments/moncash-provider.test.ts`, `lib/payments/kobara.test.ts`, `lib/payments/retry.test.ts`

**Interfaces (produces):**
- `gateway.ts`: as pnice, but `export { HTG_WALLET_MAX, usdCentsToHtg } from '@/lib/pricing/money'` (no local definitions).
- `moncash.ts`: pnice API (`moncashConfigured`, `moncashMode`, `moncashLabel`, `moncashProviderId`, `createMoncashOrder`, `retrieveMoncashOrder`, `retrieveMoncashOrderFrom`, `pickMoncashProvider`, `resetMoncashTokenCache`, re-exports `moncashHost`, `moncashBasicAuth`, `isMoncashPaid`, `directMode`, `bazikMode`, `isBazikPaid`) with two changes: (1) `pickMoncashProvider(requested, configured, production: boolean)` — when `production` is true and `requested` is empty ⇒ `null` (fail closed); `activeMoncashProvider()` passes `isProduction()`; (2) **new** `retrieveMoncashByTransactionId(transactionId: string): Promise<(MoncashPayment & { orderId: string | null }) | MoncashFailure>` — direct provider only (`POST /Api/v1/RetrieveTransactionPayment`, `orderId = payment.reference`); returns `{ ok: false, message: 'unsupported_by_provider' }` for Bazik.
- `moncash/direct.ts`, `moncash/bazik.ts`: byte-for-byte logic from pnice; description default `'Recharge Meru'`; `direct.ts` additionally exports `retrieveByTransactionId`.
- `natcash/kobara.ts`: pnice logic; `verifyKobaraSignature` **requires** a numeric `t` within 5 minutes (missing `t` ⇒ false); `checkKobaraOrder` returns the raw body and, additionally, `matchedOrderId: string | null` (from `metadata.order_id`) and `matchedPaymentId: string | null` (from `id ?? kobara_reference`) so settle can apply the strict rule.
- `natcash.ts`: pnice API (`natcashConfigured`, `natcashMode`, `natcashLabel`, `natcashProviderId`, `createNatcashOrder`, `retrieveNatcashOrder`).
- Both facades: `moncashCheckoutAllowed(hasAdminSession: boolean): boolean` / `natcashCheckoutAllowed(hasAdminSession: boolean)` ⇒ configured ∧ (`mode === 'live'` ∨ `!isVercelProduction()` ∨ `hasAdminSession`).
- `retry.ts`: `isTransient(message: string): boolean`; `retrieveWithRetry<T extends { ok: boolean }>(fn: () => Promise<T>, isSettled: (r: T) => boolean, delaysMs?: number[]): Promise<T>` (default `[400, 900]`).

- [ ] **Step 1:** Copy and adapt pnice's tests (`moncash.test.ts`, `moncash-provider.test.ts`, `natcash/kobara.test.ts`) — fix imports, drop pnice-only cases, add: `pickMoncashProvider(undefined, { direct: true, bazik: true }, true) === null`; `verifyKobaraSignature(body, 'v1=<valid hmac>', secret, now) === false` (no `t`); `retry.test.ts` (transient classification; retries until settled with `[0, 0]`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Port** per Interfaces. **Step 4:** `npx vitest run lib/payments` PASS; typecheck + eslint clean.

### Task 5: Admin authentication — hashing, bound session, guard, hash script

**Files:**
- Create: `lib/admin/auth.ts`, `lib/admin/auth.test.ts`, `lib/admin/session.ts`, `lib/admin/session.test.ts`, `lib/admin/guard.ts`, `scripts/admin-hash.ts`

**Interfaces (produces):**
- `auth.ts`: `hashPassword(password): string` (`scrypt:<salt hex>:<hash hex>`, `scryptSync(pw, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })`); `verifyPassword(password, stored): boolean` (constant-time; also runs scrypt on a dummy when `stored` is malformed so timing does not reveal it); `adminConfigured(): boolean`; `checkAdminCredentials(email, password): boolean` (constant-time email compare, always runs `verifyPassword`); `passwordVersion(): string` (first 8 hex of sha256(`ADMIN_PASSWORD_HASH`), `''` when unset).
- `session.ts`: `SESSION_COOKIE = 'meru_admin'`; `SESSION_TTL_S = 7 * 24 * 3600`; `createSessionToken(payload: { sub: string; iat: number; exp: number; v: string }, secret): string`; `verifySessionToken(token, secret, expectedVersion: string, nowMs?): { email: string } | null` (signature, `exp`, and `v === expectedVersion`); `setSessionCookie(email)`, `clearSessionCookie()`, `currentAdmin(): Promise<{ email: string } | null>` (uses `passwordVersion()`); `hasAdminSessionCookie(cookieHeaderValue: string | undefined): boolean` (pure helper for route handlers: parses the raw `Cookie` header and verifies).
- `guard.ts`: `requireAdmin(): Promise<{ email: string }>` (redirects to `/admin/login`).
- `scripts/admin-hash.ts`: prints `ADMIN_PASSWORD_HASH=…`; usage error without argument.

- [ ] **Step 1: Tests** — `auth.test.ts` (round trip; wrong password; malformed stored; no `$` in the hash); `session.test.ts` (valid; tampered; wrong secret; expired; wrong version ⇒ null; missing token/secret ⇒ null).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (session body = base64url JSON, signature = HMAC-SHA256 base64url over the body, `timingSafeEqual`; cookie `httpOnly`, `sameSite: 'lax'`, `secure: isProduction()`, `path: '/'`, `maxAge`). **Step 4:** `npx vitest run lib/admin` PASS; `npm run admin:hash -- test` prints a hash; typecheck clean.

### Task 6: Order primitives — reference, transitions, expiry, Meru identifier

**Files:**
- Create: `lib/orders/reference.ts`, `lib/orders/reference.test.ts`, `lib/orders/transitions.ts`, `lib/orders/transitions.test.ts`, `lib/orders/meru-account.ts`, `lib/orders/meru-account.test.ts`

**Interfaces (produces):**
- `reference.ts`: `REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`; `REFERENCE_LENGTH = 8`; `generateReference(rand?: (max: number) => number): string` (`MR-` + 8 chars, default `randomInt` from `node:crypto`); `normalizeReference(input): string | null` (uppercase, strip spaces/dashes, with or without `MR`, exactly 8 alphabet chars ⇒ `MR-XXXXXXXX`).
- `transitions.ts`: `TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]>` per spec; `canTransition(from, to)`; `allowedFrom(to: OrderStatus): OrderStatus[]` (every `from` whose list contains `to`); `isExpired(order: Pick<OrderRow, 'status' | 'expiresAt'>, now?: Date): boolean`; `ACTIONABLE_STATUSES = ['paid', 'needs_review']`; `statusLabelFr(s)`; `PENDING_CHECK_WINDOW_MS = 15 * 60_000`; `inCheckingWindow(order: Pick<OrderRow, 'status' | 'returnedAt' | 'redirectExpiresAt' | 'createdAt' | 'lastVerifiedAt'>, lastUnpaidAt: Date | null, now?: Date): boolean` — true when status is `pending_payment` and (`returnedAt` within the window, or (`createdAt` within the window and `lastUnpaidAt` is null)).
- `meru-account.ts`: `normalizeMeruAccount(type: MeruAccountType, raw: string): string | null` (email: lowercase, trim, must match a simple email regex; username: strip leading `@`/`$`, `/^[a-z0-9._-]{3,40}$/i`); `maskMeruAccount(type, value): string` (`je•••@ma•••.com`, `je•••`); `meruAccountLabelFr(type)`.

- [ ] **Step 1: Tests** (reference: format, determinism with `() => 0` ⇒ `MR-AAAAAAAA`, normalization; transitions: allowed/refused pairs, `allowedFrom('needs_review')` contains the six sources, `isExpired`, `inCheckingWindow` cases; meru-account: each type's normalization and masking).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS; typecheck clean.

### Task 7: Notification channels and templates

**Files:**
- Create: `lib/notifications/email.ts`, `lib/notifications/whatsapp/meta.ts`, `lib/notifications/whatsapp/twilio.ts`, `lib/notifications/whatsapp.ts`, `lib/notifications/whatsapp.test.ts`, `lib/notifications/templates.ts`, `lib/notifications/templates.test.ts`

**Interfaces (produces):**
- `email.ts`: `SendEmailResult`; `emailConfigured()` (`RESEND_API_KEY` and `RESEND_FROM`); `sendEmail({ to, subject, html, text?, replyTo? })` — Resend REST via fetch, 15 s timeout, never throws; `skipped` when not configured.
- `whatsapp.ts`: `WhatsAppSendResult = { sent: boolean; skipped: boolean; id?: string; error?: string; reason?: string }`; `WhatsAppMessage = { to: string; template: NotificationTemplate; locale: Locale; params: string[]; text: string; audience: 'admin' | 'customer' }`; `WhatsAppProviderId = 'meta' | 'twilio'`; `pickWhatsAppProvider(requested, configured)`; `whatsappConfigured()`; `whatsappLabel()`; `sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppSendResult>` — Twilio in sandbox (`TWILIO_SANDBOX === 'true'` or `TWILIO_WHATSAPP_FROM === '+14155238886'`) and `audience === 'customer'` ⇒ `{ sent: false, skipped: true, reason: 'twilio_sandbox_customer' }`.
- `whatsapp/meta.ts`: `metaConfigured()`; `metaTemplateName(template, locale): string | null` (from `WHATSAPP_META_TEMPLATES` JSON `{ "<template>": { "fr": "name", "ht": "name" } }`, falling back to the `fr` entry); `sendMetaWhatsApp(msg)` — template message when a name exists (`components: [{ type: 'body', parameters: params.map(text) }]`, `language.code = WHATSAPP_META_TEMPLATE_LANG ?? 'fr'`), else `text` message; Graph API v21.0; returns `messages[0].id`.
- `whatsapp/twilio.ts`: `twilioConfigured()`; `sendTwilioWhatsApp(msg)` — `Body = msg.text`.
- `templates.ts`: `Message = { subject: string; text: string; html: string; params: string[] }`; `TEST_PREFIX = '[TEST — aucun argent réel, ne rien envoyer] '` (ht customer: `'[TÈS — pa gen lajan reyèl] '`); `buildAdminMessage(order, template, ctx: { siteUrl; businessName })`; `buildCustomerMessage(order, template, ctx: { siteUrl; businessName; supportWhatsapp; slaFr; slaHt; supportHours })`; `textToHtml(text)`. Params order per template (documented in `docs/whatsapp-templates.md` by Task 13): created `[name, reference, usd, htg, method, url]`, paid `[name, htg, method, usd, sla, url]`, fulfilled `[name, usd, meruAccount, meruRef, business, url]`, failed `[name, reference, reason, support, url]`, expired `[name, reference, url]`, needs_review `[name, reference, url]`, refunded `[name, htg, wallet, reference]`. Money via `formatUsdShort` / `formatHtg`; dates via `formatDateTime`. Sandbox orders get the prefix on subject and text. Admin `paid` text: « 💰 PAYÉE {ref} — envoyer {usd} sur Meru. Reçu {paidHtg} (attendu {htg}) par {method}, tx {tx}, payeur {payer}. Compte Meru : {meruType} {meru} — {name}, tél. {phone}. Ouvrir : {url} ». Admin `needs_review` text names the reason from `order.failureReason ?? 'montant ou délai à vérifier'`. Admin `failed` (creation error) text: « ⚠️ Création impossible {ref} : {reason} ». Admin `reminder_24h`: « ⏰ Toujours à recharger : {ref} ({usd}) payée il y a 24 h. {url} ». Customer texts fr/ht per spec révision 1 §9 plus `refunded` (fr « Nous vous avons remboursé {htg} sur le portefeuille {wallet} pour la commande {ref}. » / ht « Nou ranbouse w {htg} sou bous {wallet} pou kòmand {ref}. ») and the SLA sentence in `paid`.

- [ ] **Step 1: Tests** — `templates.test.ts` (admin paid contains Meru account, both amounts, admin link; ht customer paid contains « Mèsi » and the ht tracking link and the ht SLA; sandbox order text starts with the prefix; params lengths per template); `whatsapp.test.ts` (`pickWhatsAppProvider` cases; `metaTemplateName` parses the JSON env and falls back to fr; Twilio sandbox + customer ⇒ skipped without a network call — inject via env only).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS; typecheck + eslint clean.

### Task 8: i18n, design system, layouts, proxy

**Files:**
- Create: `i18n/routing.ts`, `i18n/navigation.ts`, `i18n/request.ts`, `messages/fr/common.json`, `messages/ht/common.json`, `proxy.ts`, `proxy.test.ts`, `app/[locale]/layout.tsx`, `app/[locale]/not-found.tsx`, `app/[locale]/[...rest]/page.tsx`, `app/admin/layout.tsx`, `app/admin/not-found.tsx`, `app/not-found.tsx`, `lib/fonts.ts`, `lib/cn.ts`, `components/ui/{Button,Input,Select,Field,Card,StatusPill,MethodBadge,Alert,Table,CopyButton,Chip}.tsx`, `components/site/{SiteHeader,SiteFooter,LocaleSwitcher,SandboxBanner,TrustLine}.tsx`
- Modify: `app/layout.tsx`, `app/globals.css`, `next.config.ts`, `eslint.config.mjs`
- Delete: `app/page.tsx`, `public/*.svg`

**Interfaces (produces):**
- `i18n/routing.ts`: `routing = defineRouting({ locales: ['fr', 'ht'], defaultLocale: 'fr', localePrefix: 'always' })`; `NAMESPACES = ['common', 'home', 'order', 'track', 'faq', 'terms'] as const`.
- `i18n/request.ts`: `getRequestConfig(async ({ requestLocale }) => { const requested = await requestLocale; const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale; messages = merge of every existing messages/${locale}/${ns}.json (missing file ⇒ skipped) })`.
- `app/layout.tsx` (root, async): `const locale = await getLocale()` (from `next-intl/server`); `<html lang={locale} className={fonts}>`, `<body>`; no providers.
- `app/[locale]/layout.tsx`: `export const dynamic = 'force-dynamic'`; `await params`, `hasLocale` else `notFound()`; `NextIntlClientProvider`; `<SiteHeader businessName supportWhatsapp/>`, `<SandboxBanner/>`, `<main>`, `<SiteFooter/>`; `generateMetadata` from `common.brand` / `common.tagline`, `metadataBase = new URL(siteUrl())`. It reads settings through `getSettings()` — **Task 9 owns that function**; until it exists import `DEFAULT_SETTINGS` from `lib/settings/defaults.ts` and leave a `// TODO(task9)` marker that Task 9 must replace (the only allowed cross-task edit, listed in Task 9's files).
- `app/admin/layout.tsx`: `<div className="min-h-screen bg-mist text-ink">{children}</div>` (root html comes from `app/layout.tsx`).
- `app/not-found.tsx` (root, French/Kreyòl bilingual static), `app/[locale]/not-found.tsx` (translated), `app/[locale]/[...rest]/page.tsx` ⇒ `notFound()`, `app/admin/not-found.tsx`.
- `proxy.ts`: default export `proxy(request)`; `pathname.startsWith('/admin')`: `/admin/login` ⇒ next; else verify `SESSION_COOKIE` via `verifySessionToken(token, AUTH_SECRET, passwordVersion())` ⇒ next or redirect `/admin/login?next=<pathname>`; otherwise `createMiddleware(routing)(request)`. `config.matcher = ['/((?!api|admin|_next|_vercel|.*\\..*).*)', '/admin/:path*']`.
- `eslint.config.mjs`: add a block `{ files: ['app/admin/**', 'components/admin/**', 'lib/admin/**'], rules: { 'no-restricted-imports': ['error', { paths: [{ name: '@/i18n/navigation', message: 'Admin lives outside the locale segment: use next/link and next/navigation.' }] }] } }`.
- `messages/*/common.json` (`common` namespace): `brand`, `tagline`, `nav.{home,track,faq,terms}`, `footer.{notAffiliated,support,rights}`, `trust.{feesVisible,verified,tracking,support}`, `sandbox.banner`, `method.{moncash,natcash}`, `status.{pending_payment,paid,needs_review,fulfilled,failed,expired,cancelled,refunded}`, `notFound.{title,body,back}`, `switchLocale`, `copy`, `copied`, `currencyNote`, `test`.
- UI components as in révision 1 (Button, Input, Select, Field, Card, StatusPill, MethodBadge, Alert, Table) plus `CopyButton` (client; copies a value, shows « Copié »; `label`, `value`), `Chip` (`tone: 'test' | 'neutral' | 'sun'`), `TrustLine` (icon + short sentence, used on home and order page).
- `app/globals.css`: Tailwind 4 tokens per Global Constraints; `.tnum`; focus ring; reduced motion; light theme only.
- `next.config.ts`: `createNextIntlPlugin('./i18n/request.ts')`, `reactStrictMode`, security headers.

- [ ] **Step 1: Test** `proxy.test.ts` (`/` ⇒ redirect `/fr`; anonymous `/admin/commandes` ⇒ `/admin/login?next=%2Fadmin%2Fcommandes`; valid session with matching version ⇒ pass; `/admin/login` ⇒ pass; `/api/orders` is outside the matcher — assert with `unstable_doesProxyMatch` from `next/experimental/testing/server`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npx vitest run proxy.test.ts` PASS; `npx tsc --noEmit`; `npx eslint .`; `npx next build` succeeds (only 404 pages exist yet).

---

## Wave 2a — the service layer (single task; depends on Wave 1)

### Task 9: Settings store, order events/queries with CAS, create, settle, expire, dispatch, public actions

**Files:**
- Create: `lib/settings/store.ts`, `lib/orders/events.ts`, `lib/orders/queries.ts`, `lib/orders/resolve.ts`, `lib/orders/create.ts`, `lib/orders/settle.ts`, `lib/orders/settle.test.ts`, `lib/orders/expire.ts`, `lib/orders/public.ts`, `lib/orders/public.test.ts`, `lib/orders/actions.ts`, `lib/orders/reconcile.ts`, `lib/notifications/dispatch.ts`, `lib/notifications/dispatch.test.ts`, `lib/payments/checkout.ts`
- Modify: `app/[locale]/layout.tsx` (replace the `DEFAULT_SETTINGS` marker with `getSettings()`)

**Interfaces (produces):**
- `lib/settings/store.ts`: `getSettings(): Promise<Settings>` (never throws; defaults + `NEXT_PUBLIC_USD_TO_HTG` override without DB); `updateSettings(input: SettingsInput): Promise<Settings>`; `toQuoteSettings(s: Settings): QuoteSettings` (`settingsUpdatedAt = s.updatedAt?.toISOString() ?? null`); `recordLoginFailure(now?): Promise<{ lockedUntil: Date | null }>` (increments `login_failures`; at 10 sets `login_locked_until = now + 15 min` and resets the counter); `clearLoginFailures()`; `loginLockedUntil(): Promise<Date | null>` — all three no-ops without DB.
- `lib/payments/checkout.ts`: `MethodAvailability = { method; available: boolean; mode: GatewayMode; label: string }`; `availableMethods(hasAdminSession: boolean): MethodAvailability[]`; `methodAvailable(m, hasAdminSession)`.
- `lib/orders/events.ts`: `OrderEventType` = `'created' | 'redirect_issued' | 'provider_error' | 'callback_received' | 'verified_paid' | 'verified_unpaid' | 'verification_failed' | 'amount_mismatch' | 'amount_unreported' | 'paid_after_expiry' | 'paid_after_refund' | 'status_changed' | 'notification_sent' | 'notification_failed' | 'notification_skipped' | 'admin_note' | 'meru_account_corrected' | 'fulfilled' | 'marked_failed' | 'cancelled' | 'refunded' | 'expired' | 'review_flagged' | 'reconcile_gave_up'`; `appendEvent(ev)` (never throws); `logWebhook(entry)` (never throws); `lastEventOfType(orderId, type): Promise<OrderEventRow | null>`.
- `lib/orders/queries.ts`: `getOrderById`, `getOrderByReference`, `getOrderEvents`, `getOrderNotifications`, `listOrders(filters: { status?: OrderStatus | 'all'; method?; mode?: GatewayMode | 'all'; q?; from?: Date; to?: Date; limit?; offset? })`, `updateOrder(id, patch)` (no status change allowed here — throws if `patch.status` present), **`transitionOrder(id, to: OrderStatus, patch: Partial<NewOrder>): Promise<OrderRow | null>`** (`UPDATE … SET status = to, …patch, updated_at = now() WHERE id = ? AND status IN allowedFrom(to) RETURNING *`; null when zero rows), `listReconcileCandidates({ now, minAgeMs, maxAgeMs, notVerifiedSinceMs, maxAttempts, limit })` (statuses `pending_payment`, `expired`), `listExpiredPending(now, limit)`, `listActionable({ includeSandbox: boolean; limit })`, `listAdminReminders(now)` (paid/needs_review live orders with no `sent` admin notification for their template older than 30 min, and those paid > 24 h with no `reminder_24h`).
- `lib/orders/resolve.ts`: `resolveOrder(hint: { orderId?: string | null; providerRef?: string | null; reference?: string | null; transactionId?: string | null; cookieReference?: string | null }): Promise<{ order: OrderRow; matchedBy: 'id' | 'provider_ref' | 'reference' | 'transaction' | 'cookie' } | null>` (order of attempts as listed; `transaction` uses `retrieveMoncashByTransactionId`).
- `lib/orders/public.ts`: `PublicOrder` (limited fields: `reference, status, method, mode, usdCents, totalHtg, baseHtg, feeLines, fxRateHtg, effectiveRateHtg, firstName, maskedPhone, maskedMeruAccount, meruAccountType, createdAt, expiresAt, paidAt, fulfilledAt, returnedAt, redirectExpiresAt, hasRedirect, locale, orderId, providerTransactionId, failureReason, checking: boolean`) and `FullOrder = PublicOrder & { customerName, customerPhone, customerEmail, meruAccount, meruReference, refundHtg, refundWallet, fulfilledUsdCents }`; `toPublicOrder(o, lastUnpaidAt: Date | null, now?)`; `toFullOrder(o, …)`; `canSeeFullOrder(o, cookieReference: string | null | undefined): boolean`.
- `lib/orders/create.ts`: `createOrderSchema = z.object({ usdCents: int > 0, method, customerName 2–80, customerPhone 8–20, customerEmail email|null|undefined, meruAccountType: enum, meruAccount 3–120, locale, expectedTotalHtg: int > 0, settingsUpdatedAt: string | null })`; `CreateOrderError = 'not_configured' | 'method_unavailable' | 'bad_phone' | 'bad_meru_account' | 'account_type_disabled' | QuoteError | 'quote_changed' | 'provider_unreachable' | 'provider_error' | 'db_error'`; `createOrder(input: CreateOrderInput & { origin: string; hasAdminSession: boolean }): Promise<{ ok: true; order: OrderRow; redirectUrl: string; quote: Quote } | { ok: false; error; message?; quote?: Quote }>`. Algorithm: checks (db, method, phone, account type enabled, normalized account) → `getSettings` → `computeQuote` → if `quote.totalHtg !== expectedTotalHtg || quote.settingsUpdatedAt !== settingsUpdatedAt` ⇒ `quote_changed` with the fresh quote → insert (reference retry ×5 on unique violation; `expiresAt = now + ttl`; `mode` from the rail) → event `created` → provider create with `orderId = order.id`, `amountHtg = totalHtg`, `description = 'Recharge Meru ' + reference`, `successUrl = ${origin}/api/payments/${method}/retour?orderId=${id}`, `errorUrl = ${origin}/${locale}/commande/${reference}?cancelled=1`, `webhookUrl = ${origin}/api/webhooks/${method}?orderId=${id}` → failure: `transitionOrder(id, 'failed', { failureReason })`, event `provider_error`, `notifyOrder(order, 'failed')`, return `provider_unreachable` (transient) or `provider_error` → success: `updateOrder({ provider, providerRef, mode: result.mode, redirectUrl, redirectExpiresAt: now + 10 min })`, event `redirect_issued`, `notifyOrder(order, 'created')`.
- `lib/orders/settle.ts`: exactly spec §7. Signature `settleOrder(orderId, opts: { proof?: SettleProof; actor: Actor; source: 'webhook' | 'retour' | 'recheck' | 'admin' | 'cron'; retryOnUnpaid?: boolean }, deps?: SettleDeps): Promise<SettleResult>` with `SettleStatus = 'granted' | 'already' | 'unpaid' | 'pending' | 'review' | 'unknown_order' | 'not_configured' | 'error'`, `SettleDeps = { loadOrder; transitionOrder; updateOrder; appendEvent; lastEventOfType; retrieveMoncash; retrieveNatcash; notify; now; retryDelaysMs?: number[]; amountToleranceHtg: () => Promise<number> }`, `defaultSettleDeps`.
- `lib/orders/expire.ts`: `expireStaleOrders({ now, limit, verifyFirst: (id) => Promise<SettleResult> }): Promise<{ expired: number; recovered: number }>` — for each stale pending MonCash order run one last `settleOrder` (source `cron`); if still unpaid ⇒ `transitionOrder(id, 'expired')` + event; NatCash ⇒ expire directly.
- `lib/orders/reconcile.ts`: `reconcile({ now, budgetMs, limit }): Promise<{ checked; granted; review; unpaid; pending; failed; remaining; gaveUp }>` (sequential; stops at `budgetMs`; marks `reconcile_gave_up` at `maxAttempts`).
- `lib/orders/actions.ts` (`'use server'`): `recheckOrder(reference: string): Promise<{ status: SettleStatus | 'rate_limited' | 'throttled'; orderStatus: OrderStatus | null }>` (rate-limit by IP from `await headers()`; throttle: if `lastVerifiedAt` < 20 s ago ⇒ `throttled` with current status; else `settleOrder(id, { actor: 'customer', source: 'recheck', retryOnUnpaid: false })`; `revalidatePath` for both locales); `lookupOrder(prev, formData): Promise<{ error?: 'not_found' | 'rate_limited' }>` (normalize reference and phone; compare `customerPhone`; set `rm_order` cookie; `redirect` to the order page); `resumeReference(): Promise<string | null>` (reads `rm_order`).
- `lib/notifications/dispatch.ts`: `notifyOrder(order, template, opts?: { force?: boolean; resendOf?: string | null }, deps?)`; matrix from settings; sandbox prefix; per recipient: insert `pending` row with `onConflictDoNothing` (skipped ⇒ event `notification_skipped` only when `force` is false and nothing was inserted), send, update to `sent`/`failed`, event; returns `{ attempted, sent, skipped, failed }`. `recordManualWhatsApp(orderId, recipient, template)` inserts a `whatsapp_manual` `sent` row.

- [ ] **Step 1: Tests** — `settle.test.ts` with in-memory deps: unknown; already for paid/fulfilled/needs_review; MonCash paid exact ⇒ granted + paid + notify paid once; transient then paid; unpaid ⇒ unpaid + one `verified_unpaid` (second call within 5 min adds none); short amount ⇒ review + `amount_mismatch`; null amount ⇒ review + `amount_unreported`; overpaid ⇒ granted + `amount_mismatch`; expired-then-paid ⇒ review + `paid_after_expiry`; refunded-then-paid ⇒ review + `paid_after_refund`; NatCash retrieve-only strict match ⇒ granted, non-strict ⇒ review; NatCash `unsupported_by_provider` ⇒ pending; concurrent (deps.transitionOrder returns null) ⇒ already and no notification; `retryOnUnpaid` retries once on unpaid. `dispatch.test.ts`: matrix respected; sandbox prefix; duplicate ⇒ skipped; `force` ⇒ sends with `resendOf`; twilio sandbox customer ⇒ skipped; failures recorded. `public.test.ts`: limited vs full fields, masking, `checking` flag.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npx vitest run lib` PASS; typecheck + eslint clean.

---

## Wave 2b — surfaces (parallel; depend on Task 9)

### Task 10: API routes and the cron tick

**Files:**
- Create: `app/api/orders/route.ts`, `app/api/webhooks/moncash/route.ts`, `app/api/webhooks/natcash/route.ts`, `app/api/payments/moncash/retour/route.ts`, `app/api/payments/natcash/retour/route.ts`, `app/api/cron/tick/route.ts`, `vercel.json`, `lib/orders/cookie.ts`, `lib/orders/cookie.test.ts`

**Interfaces:**
- `lib/orders/cookie.ts`: `ORDER_COOKIE = 'rm_order'`; `orderCookieOptions(ttlMinutes): { httpOnly: true; sameSite: 'lax'; secure: boolean; path: '/'; maxAge: number }`; `readOrderCookie(cookieHeader: string | null): string | null` (pure parse + `normalizeReference`).
- `POST /api/orders`: JSON → `createOrderSchema.safeParse`; rate-limit `orderIp` (IP) and `orderPhone` (normalized phone); `hasAdminSession = hasAdminSessionCookie(req.headers.get('cookie'))`; `createOrder({ …, origin: req.nextUrl.origin, hasAdminSession })`; responses: 200 `{ ok: true, reference, orderId, redirectUrl, totalHtg, expiresAt, quote }` + `Set-Cookie rm_order`; 409 `{ ok: false, error: 'quote_changed', quote }`; 400 validation / `bad_phone` / `bad_meru_account` / `account_type_disabled` / quote errors; 429; 503 `not_configured` / `method_unavailable`; 502 provider errors; 500 `db_error`. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
- Webhooks and retour routes per spec §3.6 and §8 (retour: resolution chain `orderId` → `transactionId` → cookie; `updateOrder({ returnedAt })` + event `callback_received` with the raw query; `settleOrder(id, { actor: 'customer', source: 'retour', retryOnUnpaid: true })`; redirect 303 to `/${locale}/commande/${reference}?checked=1`; nothing resolvable ⇒ `/${fr}/suivi?checking=1`).
- `GET /api/cron/tick`: cron auth; `reconcile({ budgetMs: 45_000, limit: 30 })` → `expireStaleOrders` → admin reminders (`listAdminReminders` ⇒ `notifyOrder(order, 'paid' | 'needs_review' | 'reminder_24h')`); `maxDuration = 60`; JSON tally.
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/tick", "schedule": "0 * * * *" }], "functions": { "app/api/cron/tick/route.ts": { "maxDuration": 60 } } }`.

- [ ] **Step 1:** `cookie.test.ts` (parse, normalize, missing). **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; typecheck; eslint; `npx next build` without `DATABASE_URL`.

### Task 11: Public site

**Files:**
- Create: `app/[locale]/page.tsx`, `app/[locale]/commande/[reference]/page.tsx`, `app/[locale]/suivi/page.tsx`, `app/[locale]/faq/page.tsx`, `app/[locale]/conditions/page.tsx`, `components/site/RechargeWidget.tsx` (client), `components/site/QuoteReceipt.tsx`, `components/site/ConfirmStep.tsx`, `components/site/CreatedStep.tsx`, `components/site/HowItWorks.tsx`, `components/site/TrustStrip.tsx`, `components/site/ResumeBanner.tsx`, `components/site/OrderStatusView.tsx`, `components/site/CheckingPoller.tsx` (client), `components/site/RecheckButton.tsx` (client), `components/site/TrackForm.tsx` (client), `messages/{fr,ht}/{home,order,track,faq,terms}.json`

**Behaviour:**
- **Home**: server reads `settings`, `availableMethods(hasAdminSession)` (via `currentAdmin()`), `resumeReference()`; renders `ResumeBanner` (when the cookie's order is not terminal), two-column layout, `RechargeWidget` with `{ quoteSettings, methods, locale, quickAmounts, meruHelp, meruAccountTypes, supportWhatsapp }`, `HowItWorks`, `TrustStrip`.
- **RechargeWidget** steps: (1) amount + method + form with live `QuoteReceipt` (`computeQuote` locally); (2) `ConfirmStep` (identifier + name warning, « Corriger » / « Confirmer »); on confirm `POST /api/orders`; on 409 show « Le taux a changé » with the new receipt and a « Confirmer le nouveau montant » button; (3) `CreatedStep` (reference in display font, `CopyButton`, tracking link, `wa.me` support link prefilled, big « Payer {total} avec {method} » → `window.location.assign(redirectUrl)`, expiry note). Error mapping keys `home.errors.*`. Sandbox note when the method's mode is sandbox.
- **Order page**: `normalizeReference` ⇒ order ⇒ `lastUnpaidAt = lastEventOfType(id,'verified_unpaid')`; `full = canSeeFullOrder(order, cookie)`; `OrderStatusView` per spec §3.7 with `CheckingPoller` (calls `recheckOrder` every 5 s up to 24 times, then stops and shows `RecheckButton`), `RecheckButton` (`useActionState`), pay-now link (stored `redirectUrl` only when `full && hasRedirect && redirectExpiresAt > now && !checking`), receipt, support link, `TrustLine`s, not-affiliated line. `robots: { index: false }`. `searchParams.cancelled` ⇒ info alert; `searchParams.checked` ⇒ nothing special (the status speaks).
- **Suivi**: `TrackForm` with `useActionState(lookupOrder)`; `?checking=1` ⇒ alert « Nous n'avons pas pu identifier votre commande ; entrez votre référence ».
- **FAQ / Conditions** from messages (FAQ 9 items incl. « Quel identifiant Meru donner ? » and « J'ai payé mais la page dit en attente »; terms sections incl. délai, remboursement sous 48 h en gourdes, données, non-affiliation).
- Messages: all keys in both locales; ht written natively.

- [ ] **Step 1:** Write the message files. **Step 2:** Build. **Step 3:** typecheck, eslint, `next build`. **Step 4:** `npx next dev -p 3100`; curl `/fr`, `/ht`, `/fr/faq`, `/fr/conditions`, `/fr/suivi` (200) and `/fr/commande/MR-ZZZZZZZZ` (404); stop the server.

### Task 12: Admin back-office

**Files:**
- Create: `app/admin/login/page.tsx`, `app/admin/(protected)/layout.tsx`, `app/admin/(protected)/page.tsx`, `app/admin/(protected)/commandes/page.tsx`, `app/admin/(protected)/commandes/[id]/page.tsx`, `app/admin/(protected)/parametres/page.tsx`, `app/admin/(protected)/sante/page.tsx`, `app/admin/(protected)/notifications/page.tsx`, `lib/admin/actions.ts`, `lib/admin/queries.ts`, `lib/admin/queries.test.ts`, `lib/admin/health.ts`, `components/admin/{AdminShell,LoginForm,StatCard,OrdersTable,OrderFilters,OrderTimeline,FulfilPanel,OrderActions,SettingsForm,FeeRulesEditor,QuotePreview,HealthCard,NotificationsTable,RawJson,SweepButton}.tsx`

**Interfaces:**
- `lib/admin/actions.ts` (`'use server'`, every action starts with `await requireAdmin()` except `loginAction`): `loginAction(prev, formData)` (checks `loginLockedUntil()`, IP limiter, `checkAdminCredentials`; failure ⇒ `recordLoginFailure()`; success ⇒ `clearLoginFailures()`, `setSessionCookie`, `redirect(next startsWith '/admin' ? next : '/admin')`); `logoutAction()`; `markFulfilledAction(orderId, formData: { meruReference?, fulfilledUsdCents })` (`transitionOrder(id,'fulfilled',{ meruReference, fulfilledUsdCents, fulfilledAt })`, null ⇒ « déjà traitée »; events `fulfilled` + `status_changed`; `notifyOrder(order,'fulfilled')`); `markFailedAction(orderId, { reason })`; `cancelAction(orderId, { reason })` (from `pending_payment` only); `markRefundedAction(orderId, { refundHtg, refundWallet })`; `recheckAction(orderId)`; `resendNotificationsAction(orderId)` (template from status; `force`, `resendOf` = last row id); `addNoteAction(orderId, { note })`; `correctMeruAccountAction(orderId, { meruAccountType, meruAccount })` (normalize; event `meru_account_corrected` with old/new); `recordManualWhatsAppAction(orderId, template)`; `saveSettingsAction(prev, formData)`; `sendTestEmailAction()`, `sendTestWhatsAppAction()`, `probeMoncashAction()`; `sweepAction()` (`reconcile({ budgetMs: 20_000, limit: 10 })`).
- `lib/admin/queries.ts`: `dashboardStats(now)` (excludes sandbox; `todayHtg/monthHtg` from `paidHtg`, `todayUsdCents/monthUsdCents` from `fulfilledUsdCents ?? usdCents` of fulfilled orders, `feesHtg = Σ (paidHtg − baseHtg)` over paid/fulfilled), `parseOrderFilters(sp)` (pure; dates via `localDayRange`), `listRecentNotifications(limit)`, `lastAdminNotificationByChannel()`.
- `lib/admin/health.ts`: `integrationStatuses()` (adds `email` state `off` ⇒ red « obligatoire pour les alertes admin », `moncash` warn when sandbox in production or `MONCASH_PROVIDER` unset in production, `whatsapp` detail names the provider and the Twilio sandbox limitation).
- Pages per spec §4: dashboard (stats, « À recharger maintenant » list with `FulfilPanel` shortcut, « En attente > 10 min » with `SweepButton`, recent orders; TEST chips; sandbox rows only under a « Afficher les tests » toggle); orders list with filters incl. mode; order detail with `FulfilPanel` (customer name large, `CopyButton`s for Meru account and `usd.toFixed(2)`, Meru reference optional, USD sent field default, « Marquer rechargée » with confirm, then `wa.me` button with the prefilled fulfilled message that also calls `recordManualWhatsAppAction`), cards, `OrderActions`, `OrderTimeline`, `NotificationsTable`, `RawJson`; settings form (all fields incl. matrix checkboxes, account types, SLA/hours, tolerance; `FeeRulesEditor` with basis/min/max; `QuotePreview`); health; notifications.
- Login page shows the lock state and « Admin non configuré » guidance.

- [ ] **Step 1:** `queries.test.ts` for `parseOrderFilters`. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** tests, typecheck, eslint (the admin import rule must pass), `next build`; `npx next dev -p 3101` with `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` set: `/admin` ⇒ 307 to login; `/admin/login` ⇒ 200; stop.

### Task 13: Documentation and environment template

**Files:**
- Create: `.env.example`, `docs/api-keys-guide.md`, `docs/exploitation.md`, `docs/whatsapp-templates.md`
- Modify: `README.md`

Content: README (FR) — product, operator flow, local setup, scripts, callbacks to declare per provider (Digicel: fixed portal URLs — dedicated merchant account; Bazik/Kobara per request; Kobara dashboard webhook `/api/webhooks/natcash`), « clés d'identification renvoyées par chaque fournisseur : à vérifier avec un paiement sandbox et à noter ici », Vercel (env, single cron hourly on Pro / daily on Hobby, previews use `VERCEL_URL`), WhatsApp (Meta templates required outside 24 h; Twilio sandbox = admin only, re-join every 72 h; manual `wa.me` channel), email mandatory for admin alerts, sandbox safety rules, security notes, not-affiliated. `.env.example` with every variable from spec §12 and one-line comments. `docs/api-keys-guide.md` (Neon, MonCash Business, Bazik, Kobara, Resend, Meta WhatsApp, Twilio). `docs/exploitation.md` (daily routine from the phone, statuses, `needs_review` handling, refunds, rate/fees changes, what « TEST » means). `docs/whatsapp-templates.md` — the exact fr and ht bodies with `{{1}}…{{n}}` for each template, in the parameter order defined in Task 7, ready to submit to Meta (category Utility), and the `WHATSAPP_META_TEMPLATES` JSON to paste.

- [ ] **Step 1:** Write. **Step 2:** `grep -rhoE "envTrim\('[A-Z_0-9]+'\)|process\.env\.[A-Z_0-9]+" lib app proxy.ts | sort -u` — every name appears in `.env.example`.

---

## Wave 3 — integration and review

### Task 14: Full verification and fixes
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (no `DATABASE_URL`) all green.
- [ ] Dev smoke: `/fr`, `/ht`, `/fr/faq`, `/fr/conditions`, `/fr/suivi`, `/admin/login` 200; `/admin` redirects; `POST /api/orders` without DB ⇒ 503; `GET /api/cron/tick` without secret ⇒ 503; `/api/webhooks/natcash` without secret ⇒ 503.

### Task 15: Adversarial review (three lenses) and remediation
Payments correctness & security; UX/copy/i18n (both locales complete, money labels, mobile, focus, contrast, trust); Next.js 16 conventions and build hygiene. Fix confirmed findings; re-run Task 14.
