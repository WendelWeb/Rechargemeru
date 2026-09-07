import createIntlMiddleware from 'next-intl/middleware';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextProxy, type NextRequest, type ProxyConfig } from 'next/server';
import { routing } from '@/i18n/routing';
import { clerkConfigured } from '@/lib/auth/clerk';

/**
 * Request guard in front of every page.
 *
 * Two middlewares share one request. Clerk runs first — it resolves the
 * session cookie and stamps the request, which is what lets `auth()` work
 * later inside a Server Component, a Server Action or `/api/orders`. Then, for
 * public pages only, next-intl enforces the `/fr` / `/ht` prefix and tells the
 * app which locale was matched.
 *
 * Three shapes of path, three treatments:
 *
 * - **`/admin/**` (except the login page)** needs a signed-in user, and gets
 *   sent to `/admin/login?next=…` when there is none. Only *signed in* is
 *   checked here: whether that account is an administrator is decided by
 *   `requireAdmin()`, because answering it needs Clerk's Backend API and the
 *   proxy must stay a cookie-only, no-network hop.
 * - **`/api/orders`** is matched so Clerk stamps it (the route asks whether
 *   the operator's own browser is calling before offering a sandbox rail),
 *   but it must never reach next-intl — there is no `/fr/api/…`. Every other
 *   API route — the payment webhooks, the payment returns, the cron — stays
 *   out of the matcher entirely: nothing about them needs a session, and the
 *   money path should not gain a dependency it does not use.
 * - **everything else** goes to next-intl.
 *
 * Without Clerk keys the whole Clerk half is skipped and the site behaves
 * exactly as it did before: next-intl alone, admin pages left to
 * `requireAdmin()`, which sends the operator to the « connexion non
 * configurée » screen.
 */

const handleIntl = createIntlMiddleware(routing);

export const LOGIN_PATH = '/admin/login';

/** The one API route the proxy covers (see the note above). */
export const CLERK_AWARE_API_PATH = '/api/orders';

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Clerk's own auto-proxy path. The SDK routes its handshake and satellite
 * traffic through `/__clerk/*`, so two things must hold: the proxy has to run
 * on it (see `config.matcher`), and next-intl must never see it — a locale
 * redirect to `/fr/__clerk/…` would break the handshake and, with it, every
 * sign-in.
 */
export function isClerkPath(pathname: string): boolean {
  return pathname === '/__clerk' || pathname.startsWith('/__clerk/');
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Admin paths that require a session. The login page is deliberately excluded:
 * gating it would loop the redirect it is the destination of.
 */
export function isGuardedAdminPath(pathname: string): boolean {
  return isAdminPath(pathname) && pathname !== LOGIN_PATH;
}

/**
 * `/admin/login?next=…`. `next` carries a pathname only — never a full URL —
 * so the login page cannot be talked into bouncing a visitor off-site.
 */
export function loginUrl(request: NextRequest): URL {
  const url = new URL(LOGIN_PATH, request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  return url;
}

/** next-intl alone: what ran before Clerk, and what still runs without keys. */
function withoutClerk(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isApiPath(pathname) || isAdminPath(pathname) || isClerkPath(pathname)) return NextResponse.next();
  return handleIntl(request);
}

/**
 * Built on first use rather than at module load, so importing this file (a
 * test, a tool) never constructs a Clerk handler that will not be used.
 */
let clerkProxy: NextProxy | null = null;

function withClerk(): NextProxy {
  clerkProxy ??= clerkMiddleware(async (auth, request) => {
    const { pathname } = request.nextUrl;

    // Clerk has stamped the request by now; the route handler can call auth().
    // `/__clerk/*` belongs to the SDK itself and must reach it untouched.
    if (isApiPath(pathname) || isClerkPath(pathname)) return NextResponse.next();

    if (isAdminPath(pathname)) {
      if (!isGuardedAdminPath(pathname)) return NextResponse.next();
      const { userId } = await auth();
      return userId ? NextResponse.next() : NextResponse.redirect(loginUrl(request));
    }

    return handleIntl(request);
  });
  return clerkProxy;
}

/**
 * Clerk runs *inside* a try/catch, and a failure degrades to the no-Clerk
 * path instead of 500-ing the request.
 *
 * `clerkMiddleware` only wraps the handler we pass it: `assertKey`,
 * `parsePublishableKey` and `authenticateRequest` throw straight through
 * (« Publishable key not valid. » for a key with a character transposed on
 * Vercel, « handshake status without redirect » for a state the SDK cannot
 * complete). The matcher covers every public page, so an uncaught throw here
 * would turn `/fr`, `/ht`, `/fr/suivi` and every `/fr/commande/MR-…` into a
 * 500 — nobody could order or track — over a dependency nothing about paying
 * needs. This is the same rule `lib/auth/clerk.ts` states and now the proxy
 * keeps too.
 *
 * Safe for the admin: the fallback only skips the proxy's « signed in? » hop.
 * `requireAdmin()` in `app/admin/(protected)/layout.tsx` and in every Server
 * Action still closes the door, because `currentUserId()` catches the same
 * failure and answers `null`.
 */
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Awaited<ReturnType<NextProxy>>> {
  if (!clerkConfigured()) return withoutClerk(request);
  try {
    return await withClerk()(request, event);
  } catch (err) {
    // The message only — never the key, never the token.
    console.error(`[proxy] clerk middleware failed: ${err instanceof Error ? err.message : String(err)}`);
    return withoutClerk(request);
  }
}

export const config: ProxyConfig = {
  // `/__clerk/:path*` is Clerk's auto-proxy path (its own setup guide requires
  // this entry, after the API one). `isClerkPath` then keeps next-intl off it.
  matcher: [
    '/((?!api|admin|_next|_vercel|.*\\..*).*)',
    '/admin/:path*',
    '/api/orders',
    '/__clerk/:path*',
  ],
};
