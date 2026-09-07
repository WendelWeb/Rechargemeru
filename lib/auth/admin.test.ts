import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

/**
 * `@clerk/nextjs/server` is replaced wholesale: these tests are about the
 * *rule* — which email opens the admin — not about Clerk. The two functions
 * the module actually calls are stubbed, and each test sets what the session
 * currently says.
 *
 * The stub models one thing Clerk's real payload carries and the old mock did
 * not: every address has a `verification.status`, and the primary one is named
 * by id (`primaryEmailAddressId`), which is `null` on an account created with
 * a username, a phone number or an OAuth identity. Both are what stops an
 * address somebody merely *added* from opening the admin.
 */
type MockAddress = { id: string; emailAddress: string; verified: boolean };

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  addresses: [] as { id: string; emailAddress: string; verified: boolean }[],
  primaryId: null as string | null,
  authThrows: false,
  userThrows: false,
  userCalls: 0,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => {
    if (clerk.authThrows) throw new Error('Clerk is down');
    return { userId: clerk.userId };
  },
  currentUser: async () => {
    clerk.userCalls += 1;
    if (clerk.userThrows) throw new Error('Backend API unavailable');
    return clerk.userId === null
      ? null
      : {
          id: clerk.userId,
          firstName: 'Stanley',
          lastName: 'Joseph',
          fullName: 'Stanley Joseph',
          primaryEmailAddressId: clerk.primaryId,
          emailAddresses: clerk.addresses.map((address) => ({
            id: address.id,
            emailAddress: address.emailAddress,
            verification: { status: address.verified ? 'verified' : 'unverified' },
          })),
        };
  },
}));

const {
  ADMIN_REFUSED_PATH,
  ADMIN_UNAVAILABLE_PATH,
  adminConfigProblems,
  adminConfigured,
  adminEmails,
  currentAdmin,
  isAdminEmail,
  requireAdmin,
} = await import('./admin');
const { clerkConfigured, currentUserEmail, currentUserId, currentUserName } = await import('./clerk');

const saved = { ...process.env };

/** Everything the operator would set on Vercel for the admin to work. */
function configure(emails = 'stanleywendeljoseph@gmail.com'): void {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_key';
  process.env.CLERK_SECRET_KEY = 'sk_test_key';
  process.env.ADMIN_EMAILS = emails;
}

/** Signs `email` in for the current test, as a verified primary address. */
function signIn(email: string | null, userId = 'user_1'): void {
  signInWith(email === null ? [] : [{ id: 'idn_1', emailAddress: email, verified: true }], userId);
}

/**
 * Signs a fuller account in: any set of addresses, and a primary named by id
 * only when one of them is it (Clerk leaves `primaryEmailAddressId` null on a
 * username-, phone- or OAuth-created account).
 */
function signInWith(addresses: MockAddress[], userId = 'user_1', primaryId: string | null = null): void {
  clerk.userId = userId;
  clerk.addresses = addresses;
  clerk.primaryId = primaryId ?? (addresses.length > 0 && addresses[0].verified ? addresses[0].id : null);
}

/** The path a `redirect()` aimed at, read off the digest it throws. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return digest.split(';')[2] ?? digest;
    }
    throw err;
  }
  throw new Error('expected a redirect, none was thrown');
}

beforeEach(() => {
  clerk.userId = null;
  clerk.addresses = [];
  clerk.primaryId = null;
  clerk.authThrows = false;
  clerk.userThrows = false;
  clerk.userCalls = 0;
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe('adminEmails', () => {
  it('is empty when ADMIN_EMAILS is unset or blank', () => {
    delete process.env.ADMIN_EMAILS;
    expect(adminEmails()).toEqual([]);
    process.env.ADMIN_EMAILS = '   ';
    expect(adminEmails()).toEqual([]);
  });

  it('splits, trims, lowercases and de-duplicates', () => {
    process.env.ADMIN_EMAILS = ' Ops@Meru.HT , second@meru.ht ,, OPS@meru.ht ';
    expect(adminEmails()).toEqual(['ops@meru.ht', 'second@meru.ht']);
  });

  it('accepts a list written on several lines or with semicolons', () => {
    process.env.ADMIN_EMAILS = 'one@meru.ht;\ntwo@meru.ht';
    expect(adminEmails()).toEqual(['one@meru.ht', 'two@meru.ht']);
  });
});

describe('isAdminEmail', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'Stanley@Meru.HT';
  });

  it('matches whatever the casing and the spacing', () => {
    expect(isAdminEmail('stanley@meru.ht')).toBe(true);
    expect(isAdminEmail('STANLEY@MERU.HT')).toBe(true);
    expect(isAdminEmail('  Stanley@Meru.ht  ')).toBe(true);
  });

  it('refuses anything else, including nothing at all', () => {
    expect(isAdminEmail('someone@meru.ht')).toBe(false);
    expect(isAdminEmail('stanley@meru.ht.evil.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail('   ')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('refuses everyone when no administrator is configured', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('stanley@meru.ht')).toBe(false);
  });
});

describe('configuration', () => {
  it('needs both Clerk keys', () => {
    process.env.ADMIN_EMAILS = 'ops@meru.ht';
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    expect(clerkConfigured()).toBe(false);
    expect(adminConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_key';
    expect(clerkConfigured()).toBe(false);

    process.env.CLERK_SECRET_KEY = 'sk_test_key';
    expect(clerkConfigured()).toBe(true);
    expect(adminConfigured()).toBe(true);
  });

  it('needs at least one administrator', () => {
    configure('');
    expect(clerkConfigured()).toBe(true);
    expect(adminConfigured()).toBe(false);
  });

  it('names every missing variable, in French, and nothing else', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.ADMIN_EMAILS;
    const problems = adminConfigProblems();
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(problems.join(' ')).toContain('CLERK_SECRET_KEY');
    expect(problems.join(' ')).toContain('ADMIN_EMAILS');

    configure();
    expect(adminConfigProblems()).toEqual([]);
  });
});

describe('reading the session', () => {
  it('answers null for everything when Clerk is not configured', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    signIn('stanleywendeljoseph@gmail.com');
    expect(await currentUserId()).toBeNull();
    expect(await currentUserEmail()).toBeNull();
    expect(await currentUserName()).toBeNull();
    expect(await currentAdmin()).toBeNull();
  });

  it('lowercases the primary email and reads the display name', async () => {
    configure();
    signIn('Stanleywendeljoseph@Gmail.com');
    expect(await currentUserId()).toBe('user_1');
    expect(await currentUserEmail()).toBe('stanleywendeljoseph@gmail.com');
    expect(await currentUserName()).toBe('Stanley Joseph');
  });

  it('degrades to null instead of throwing when Clerk fails', async () => {
    configure();
    signIn('stanleywendeljoseph@gmail.com');
    clerk.authThrows = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await currentUserId()).toBeNull();
    expect(await currentUserEmail()).toBeNull();
    expect(await currentAdmin()).toBeNull();
  });

  it('degrades to null when the Backend API cannot produce the account', async () => {
    configure();
    signIn('stanleywendeljoseph@gmail.com');
    clerk.userThrows = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await currentUserId()).toBe('user_1');
    expect(await currentUserEmail()).toBeNull();
    expect(await currentUserName()).toBeNull();
    expect(await currentAdmin()).toBeNull();
  });

  it('never asks the Backend API about a visitor who is not signed in', async () => {
    configure();
    expect(await currentUserEmail()).toBeNull();
    expect(await currentUserName()).toBeNull();
    expect(clerk.userCalls).toBe(0);
  });
});

/**
 * The gate compares one string, so that string must be one the account has
 * actually proved. Clerk stores an address the moment it is added — before any
 * code is entered — so an unverified address is a claim, not a credential.
 */
describe('unverified email addresses', () => {
  // Wrapped: a hook is handed the test context, which would land in ADMIN_EMAILS.
  beforeEach(() => configure());

  it('refuses an unverified address, even when it is the one in ADMIN_EMAILS', async () => {
    signInWith([{ id: 'idn_1', emailAddress: 'stanleywendeljoseph@gmail.com', verified: false }]);
    expect(await currentUserEmail()).toBeNull();
    expect(await currentAdmin()).toBeNull();
    expect(await redirectedTo(requireAdmin)).toBe(ADMIN_REFUSED_PATH);
  });

  it('refuses an unverified address added to an account with no primary email', async () => {
    // Username- or phone-created account: `primaryEmailAddressId` is null, so
    // the old `emailAddresses[0]` fallback would have handed the admin over.
    signInWith(
      [
        { id: 'idn_1', emailAddress: 'stanleywendeljoseph@gmail.com', verified: false },
        { id: 'idn_2', emailAddress: 'mallory@example.com', verified: false },
      ],
      'user_mallory',
      null,
    );
    expect(await currentUserEmail()).toBeNull();
    expect(await redirectedTo(requireAdmin)).toBe(ADMIN_REFUSED_PATH);
  });

  it('ignores an unverified primary and keeps the verified address', async () => {
    signInWith(
      [
        { id: 'idn_1', emailAddress: 'stanleywendeljoseph@gmail.com', verified: false },
        { id: 'idn_2', emailAddress: 'ops@meru.ht', verified: true },
      ],
      'user_1',
      'idn_1',
    );
    expect(await currentUserEmail()).toBe('ops@meru.ht');
    expect(await currentAdmin()).toBeNull();
  });

  it('prefers the verified primary over another verified address', async () => {
    process.env.ADMIN_EMAILS = 'stanleywendeljoseph@gmail.com,ops@meru.ht';
    signInWith(
      [
        { id: 'idn_1', emailAddress: 'ops@meru.ht', verified: true },
        { id: 'idn_2', emailAddress: 'stanleywendeljoseph@gmail.com', verified: true },
      ],
      'user_1',
      'idn_2',
    );
    expect(await currentUserEmail()).toBe('stanleywendeljoseph@gmail.com');
  });
});

describe('currentAdmin', () => {
  it('returns the operator when the signed-in email is listed', async () => {
    configure();
    signIn('stanleywendeljoseph@gmail.com');
    expect(await currentAdmin()).toEqual({ email: 'stanleywendeljoseph@gmail.com' });
  });

  it('returns null for a signed-in customer', async () => {
    configure();
    signIn('cliente@example.com');
    expect(await currentAdmin()).toBeNull();
  });

  it('returns null for an anonymous visitor', async () => {
    configure();
    expect(await currentAdmin()).toBeNull();
  });
});

describe('requireAdmin', () => {
  it('lets the operator through', async () => {
    configure();
    signIn('STANLEYWENDELJOSEPH@gmail.com');
    await expect(requireAdmin()).resolves.toEqual({ email: 'stanleywendeljoseph@gmail.com' });
  });

  it('sends an anonymous visitor to the login page', async () => {
    configure();
    expect(await redirectedTo(requireAdmin)).toBe('/admin/login');
  });

  it('sends a signed-in non-administrator to the refusal screen', async () => {
    configure();
    signIn('cliente@example.com');
    expect(await redirectedTo(requireAdmin)).toBe('/admin/login?refuse=1');
  });

  it('refuses an account with no email address at all', async () => {
    configure();
    signIn(null);
    expect(await redirectedTo(requireAdmin)).toBe('/admin/login?refuse=1');
  });

  it('says « illisible », not « refusé », when Clerk cannot answer', async () => {
    // A Clerk hiccup must not tell the operator their account lost access
    // while paid orders wait for « Marquer rechargée ».
    configure();
    signIn('stanleywendeljoseph@gmail.com');
    clerk.userThrows = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await redirectedTo(requireAdmin)).toBe(ADMIN_UNAVAILABLE_PATH);
    expect(ADMIN_UNAVAILABLE_PATH).not.toBe(ADMIN_REFUSED_PATH);
  });

  it('sends everyone to the login page when the server is not configured', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.ADMIN_EMAILS;
    signIn('stanleywendeljoseph@gmail.com');
    expect(await redirectedTo(requireAdmin)).toBe('/admin/login');
  });
});
