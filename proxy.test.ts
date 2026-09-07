import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { NextRequest, type NextFetchEvent, type NextResponse } from 'next/server';
import { unstable_doesMiddlewareMatch, getRedirectUrl } from 'next/experimental/testing/server';
import { routing } from '@/i18n/routing';

/**
 * next-intl's middleware is shipped as ESM that imports `next/server`
 * without an extension; Node's loader cannot resolve that when Vitest
 * externalises the package. This shim stands in for it, recording the routing
 * it was built from and every request it was handed, and applying the two
 * behaviours the site relies on: an unprefixed path redirects to the default
 * locale, a prefixed one passes through.
 */
const intl = vi.hoisted(() => ({
  routing: null as null | { locales: readonly string[]; defaultLocale: string; localePrefix?: unknown },
  handled: [] as string[],
}));

vi.mock('next-intl/middleware', async () => {
  const { NextResponse } = await import('next/server');
  return {
    default: (config: { locales: readonly string[]; defaultLocale: string; localePrefix?: unknown }) => {
      intl.routing = config;
      return (request: NextRequest) => {
        const { pathname } = request.nextUrl;
        intl.handled.push(pathname);
        const first = pathname.split('/')[1] ?? '';
        if (config.locales.includes(first)) return NextResponse.next();
        const target = pathname === '/' ? `/${config.defaultLocale}` : `/${config.defaultLocale}${pathname}`;
        return NextResponse.redirect(new URL(target, request.url));
      };
    },
  };
});

/**
 * Clerk stands in too — verifying a real session would need a real instance.
 * The stub records how many handlers were built (the proxy must build exactly
 * one, and reuse it), which requests reached it, and how often the handler
 * asked who is signed in: `/admin/login` must never ask.
 */
const clerk = vi.hoisted(() => ({
  built: 0,
  handled: [] as string[],
  authCalls: 0,
  userId: null as string | null,
  /** Set to make the Clerk handler throw the way a bad key or handshake does. */
  throws: null as string | null,
}));

vi.mock('@clerk/nextjs/server', async () => {
  type Handler = (
    auth: () => Promise<{ userId: string | null }>,
    request: NextRequest,
    event: NextFetchEvent,
  ) => unknown;
  return {
    clerkMiddleware: (handler: Handler) => {
      clerk.built += 1;
      return (request: NextRequest, event: NextFetchEvent) => {
        clerk.handled.push(request.nextUrl.pathname);
        // Clerk throws before it ever reaches the handler when the
        // publishable key is malformed or a handshake cannot be completed.
        if (clerk.throws !== null) throw new Error(clerk.throws);
        return handler(async () => {
          clerk.authCalls += 1;
          return { userId: clerk.userId };
        }, request, event);
      };
    },
  };
});

const { default: proxy, config, isAdminPath, isApiPath, isClerkPath, isGuardedAdminPath, loginUrl, LOGIN_PATH } = await import(
  './proxy'
);

const saved = { ...process.env };
const EVENT = {} as NextFetchEvent;

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

function withClerkKeys(): void {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_key';
  process.env.CLERK_SECRET_KEY = 'sk_test_key';
}

function withoutClerkKeys(): void {
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
}

/** `NextResponse.next()` marks the response so the router continues to the route. */
function passesThrough(res: unknown): boolean {
  const response = res as Response;
  return response.headers.get('x-middleware-next') === '1' && response.headers.get('location') === null;
}

beforeEach(() => {
  intl.handled.length = 0;
  clerk.handled.length = 0;
  clerk.authCalls = 0;
  clerk.userId = null;
  clerk.throws = null;
});

afterEach(() => {
  process.env = { ...saved };
});

describe('matcher', () => {
  it('covers the public pages, the admin area and the order API', () => {
    for (const url of [
      '/',
      '/fr',
      '/ht',
      '/ht/suivi',
      '/fr/connexion',
      '/fr/connexion/factor-two',
      '/ht/inscription',
      '/fr/commande/MR-ABCDEFGH',
      '/admin',
      '/admin/login',
      '/admin/commandes/abc',
      '/api/orders',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    }
  });

  it('leaves the money routes, Next internals and files alone', () => {
    for (const url of [
      '/api/webhooks/moncash',
      '/api/webhooks/natcash',
      '/api/payments/moncash/retour',
      '/api/payments/natcash/retour',
      '/api/cron/tick',
      '/_next/static/chunk.js',
      '/_vercel/insights/script.js',
      '/favicon.ico',
      '/robots.txt',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });
});

describe('path helpers', () => {
  it('recognises the admin area without swallowing lookalikes', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/')).toBe(true);
    expect(isAdminPath('/admin/commandes/abc')).toBe(true);
    expect(isAdminPath('/administration')).toBe(false);
    expect(isAdminPath('/fr/admin')).toBe(false);
    expect(isAdminPath('/')).toBe(false);
  });

  it('guards every admin path except the login page', () => {
    expect(isGuardedAdminPath('/admin')).toBe(true);
    expect(isGuardedAdminPath('/admin/parametres')).toBe(true);
    expect(isGuardedAdminPath(LOGIN_PATH)).toBe(false);
    expect(isGuardedAdminPath('/fr')).toBe(false);
  });

  it('recognises API paths without swallowing lookalikes', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/orders')).toBe(true);
    expect(isApiPath('/apidocs')).toBe(false);
    expect(isApiPath('/fr/api')).toBe(false);
  });

  it('remembers only an in-app pathname in `next`', () => {
    const url = loginUrl(request('/admin/commandes?statut=paid'));
    expect(url.pathname).toBe(LOGIN_PATH);
    expect(url.searchParams.get('next')).toBe('/admin/commandes');
    expect(url.toString()).toBe('http://localhost:3000/admin/login?next=%2Fadmin%2Fcommandes');
  });
});

describe('without Clerk keys', () => {
  beforeEach(withoutClerkKeys);

  it('builds the locale handler from the shared routing config', () => {
    expect(intl.routing).toMatchObject({
      locales: routing.locales,
      defaultLocale: routing.defaultLocale,
      localePrefix: routing.localePrefix,
    });
    expect(routing.locales).toEqual(['fr', 'ht']);
    expect(routing.defaultLocale).toBe('fr');
  });

  it('hands the bare root to next-intl, which redirects to the default locale', async () => {
    const res = await proxy(request('/'), EVENT);
    expect(intl.handled).toEqual(['/']);
    expect(getRedirectUrl(res as NextResponse)).toBe('http://localhost:3000/fr');
    expect(clerk.handled).toEqual([]);
  });

  it('hands a localised page to next-intl and lets it through', async () => {
    const res = await proxy(request('/ht/suivi'), EVENT);
    expect(intl.handled).toEqual(['/ht/suivi']);
    expect(passesThrough(res)).toBe(true);
  });

  it('leaves the admin to requireAdmin() instead of redirecting into a dead end', async () => {
    // With no way to sign in, bouncing to /admin/login would only loop; the
    // page itself explains which variables are missing.
    const res = await proxy(request('/admin/commandes'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(intl.handled).toEqual([]);
    expect(clerk.handled).toEqual([]);
  });

  it('never sends an API request through next-intl', async () => {
    const res = await proxy(request('/api/orders'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(intl.handled).toEqual([]);
  });
});

describe('with Clerk keys', () => {
  beforeEach(withClerkKeys);

  it('sends an anonymous visitor to the login page and remembers where they were going', async () => {
    const res = await proxy(request('/admin/commandes'), EVENT);
    expect(getRedirectUrl(res as NextResponse)).toBe('http://localhost:3000/admin/login?next=%2Fadmin%2Fcommandes');

    const root = await proxy(request('/admin'), EVENT);
    expect(getRedirectUrl(root as NextResponse)).toBe('http://localhost:3000/admin/login?next=%2Fadmin');
    expect(intl.handled).toEqual([]);
  });

  it('never redirects the login page itself, and never asks Clerk about it', async () => {
    const res = await proxy(request(LOGIN_PATH), EVENT);
    expect(passesThrough(res)).toBe(true);

    const withNext = await proxy(request(`${LOGIN_PATH}?next=%2Fadmin`), EVENT);
    expect(passesThrough(withNext)).toBe(true);

    expect(clerk.authCalls).toBe(0);
    expect(intl.handled).toEqual([]);
  });

  it('lets a signed-in visitor reach the admin — the email check is requireAdmin()’s job', async () => {
    clerk.userId = 'user_1';
    const res = await proxy(request('/admin/parametres'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(clerk.authCalls).toBe(1);
    expect(intl.handled).toEqual([]);
  });

  it('stamps the order API but keeps it away from next-intl', async () => {
    clerk.userId = 'user_1';
    const res = await proxy(request('/api/orders'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(clerk.handled).toEqual(['/api/orders']);
    expect(intl.handled).toEqual([]);
    expect(clerk.authCalls).toBe(0);
  });

  it('still hands public pages to next-intl, after Clerk has seen them', async () => {
    const res = await proxy(request('/fr/suivi'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(clerk.handled).toEqual(['/fr/suivi']);
    expect(intl.handled).toEqual(['/fr/suivi']);
  });

  it('builds the Clerk handler once and reuses it', () => {
    expect(clerk.built).toBe(1);
  });
});

/**
 * A bad publishable key or a handshake Clerk cannot complete throws OUTSIDE
 * the handler, and the matcher covers every public page: without a boundary
 * here, nobody could order or track. Paying never needed Clerk, so the proxy
 * falls back to next-intl alone.
 */
describe('when Clerk itself throws', () => {
  beforeEach(() => {
    withClerkKeys();
    clerk.throws = 'Publishable key not valid.';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still renders a public page instead of turning it into a 500', async () => {
    const res = await proxy(request('/fr/commande/MR-ABCDEFGH'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(intl.handled).toEqual(['/fr/commande/MR-ABCDEFGH']);
  });

  it('still sends the bare root to the default locale', async () => {
    const res = await proxy(request('/'), EVENT);
    expect(getRedirectUrl(res as NextResponse)).toBe('http://localhost:3000/fr');
  });

  it('leaves the admin to requireAdmin() rather than 500-ing the login page', async () => {
    const res = await proxy(request('/admin/parametres'), EVENT);
    expect(passesThrough(res)).toBe(true);
    expect(intl.handled).toEqual([]);
  });

  it('logs the reason without leaking a key or a token', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await proxy(request('/fr'), EVENT);
    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain('Publishable key not valid.');
    expect(message).not.toContain('pk_test_key');
    expect(message).not.toContain('sk_test_key');
  });
});

describe("isClerkPath", () => {
  it("recognises Clerk own auto-proxy path", () => {
    expect(isClerkPath("/__clerk")).toBe(true);
    expect(isClerkPath("/__clerk/handshake")).toBe(true);
    expect(isClerkPath("/__clerknot")).toBe(false);
    expect(isClerkPath("/fr")).toBe(false);
  });
  it("is covered by the matcher", () => {
    expect(config.matcher).toContain("/__clerk/:path*");
  });
});
