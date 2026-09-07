import { cache } from 'react';
import type { ComponentProps } from 'react';
import type { SignIn } from '@clerk/nextjs';
import { auth, currentUser, type User } from '@clerk/nextjs/server';
import { envTrim } from '@/lib/env';

/**
 * lib/auth/clerk.ts — the only module that talks to Clerk.
 *
 * Three rules hold for everything below.
 *
 * 1. **Never throw.** The public site asks « is somebody signed in? » on every
 *    render (the home page decides which rails to offer, the sandbox banner
 *    decides whether to warn). A missing key, a request the proxy did not
 *    stamp, or a Clerk outage must degrade that answer to `null` — never turn
 *    a page a customer is trying to pay from into a 500.
 * 2. **Read the environment at call time.** `clerkConfigured()` is the single
 *    answer to « are the keys set? »; the root layout, the proxy and
 *    `lib/auth/admin.ts` all ask it rather than reading `process.env`
 *    themselves, so there is one place to change.
 * 3. **Only a proved address counts.** An email is an admin credential here,
 *    and Clerk stores an address the moment it is *added*, verified or not.
 *    `currentUserEmail()` therefore looks at `verification.status` and ignores
 *    everything that is not `verified`.
 *
 * Nothing here logs a key, a token or an email address: a failure is reported
 * as the call that failed plus the error message, and nothing else.
 */

/**
 * Both keys are needed: the publishable key boots the browser SDK (and the
 * `<ClerkProvider>` refuses to render without it), the secret key is what
 * verifies the session server-side. One without the other is not a usable
 * install, so the app treats it as « not configured » and keeps running
 * exactly as it did before Clerk existed.
 */
export function clerkConfigured(): boolean {
  return (
    envTrim('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') !== undefined && envTrim('CLERK_SECRET_KEY') !== undefined
  );
}

/** The shape `<SignIn>` and `<SignUp>` accept for `appearance`. */
export type ClerkAppearance = ComponentProps<typeof SignIn>['appearance'];

/**
 * Clerk's card, wearing the site's palette and type. Only theme *variables*
 * are set — never element class names — so a Clerk update cannot silently
 * unstyle the form: at worst a colour reverts to Clerk's default. The logo is
 * removed because the page around the card already carries the brand.
 *
 * Type-only imports above keep this file free of any client component: it is
 * also imported by `proxy.ts`.
 */
export const clerkAppearance: ClerkAppearance = {
  options: { logoPlacement: 'none' },
  variables: {
    colorPrimary: '#0e1b3d',
    colorPrimaryForeground: '#ffffff',
    colorForeground: '#0e1b3d',
    colorMutedForeground: '#4a5578',
    colorBorder: '#d9e0ec',
    colorDanger: '#dc3d43',
    colorSuccess: '#159f6c',
    colorWarning: '#e8ad00',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-figtree), Figtree, ui-sans-serif, system-ui, sans-serif',
  },
};

function warn(what: string, err: unknown): void {
  const reason = err instanceof Error && err.message ? err.message : String(err);
  console.warn(`[auth/clerk] ${what}: ${reason}`);
}

/** What reading the session produced. `ok: false` means Clerk could not answer. */
type SessionRead = { ok: boolean; userId: string | null };

/**
 * The session cookie, read once per request.
 *
 * `auth()` makes no Backend API call — it verifies the token the proxy already
 * stamped — but a page asks « who is this? » several times (the layout's
 * sandbox banner, the page itself, an action), and `cache()` collapses those
 * into one, exactly as `lib/settings/store.ts` does for the settings row.
 * Outside a React request (a unit test) `cache` is a pass-through, so nothing
 * leaks from one test to the next.
 */
const readSession = cache(async (): Promise<SessionRead> => {
  if (!clerkConfigured()) return { ok: true, userId: null };
  try {
    const { userId } = await auth();
    return { ok: true, userId: userId ?? null };
  } catch (err) {
    warn('auth()', err);
    return { ok: false, userId: null };
  }
});

/**
 * The signed-in Clerk user id for this request, or `null`.
 *
 * Cheap: it reads the session cookie the proxy already verified and makes no
 * call to Clerk's Backend API. Use it whenever the question is only « signed
 * in or not ».
 */
export async function currentUserId(): Promise<string | null> {
  return (await readSession()).userId;
}

/**
 * What reading the account produced:
 *
 * - `anonymous` — nobody is signed in (or Clerk is not configured here);
 * - `user` — the account, read from Clerk;
 * - `unavailable` — there is a session, but Clerk could not be asked about it.
 *
 * The third case is deliberately distinct: « we could not read your account »
 * is not « your account was refused », and `requireAdmin()` says so.
 */
type UserRead = { status: 'anonymous' } | { status: 'user'; user: User } | { status: 'unavailable' };

/**
 * The full user record. This one DOES call the Backend API — `currentUser()`
 * is not memoised by Clerk, it calls `users.getUser()` every time — so the
 * dedup below is ours: one round trip per request however many callers ask.
 * A signed-out visitor (the overwhelming majority on the public site) costs
 * nothing, because the session is checked first.
 */
const readUser = cache(async (): Promise<UserRead> => {
  const session = await readSession();
  if (!session.ok) return { status: 'unavailable' };
  if (session.userId === null) return { status: 'anonymous' };
  try {
    const user = await currentUser();
    // A live session whose account cannot be produced is a Clerk problem, not
    // a verdict on the account: say « unavailable », never « refused ».
    return user ? { status: 'user', user } : { status: 'unavailable' };
  } catch (err) {
    warn('currentUser()', err);
    return { status: 'unavailable' };
  }
});

/**
 * The signed-in user's **verified** email, lowercased — the form
 * `ADMIN_EMAILS` is compared against.
 *
 * `primaryEmailAddressId` is `null` on any account created with a username, a
 * phone number or an OAuth identity, and Clerk keeps every address that was
 * merely *added* in `emailAddresses` while it is still `unverified`. Reading
 * either one blindly would let anybody type the operator's address into their
 * own profile and become an administrator, so both are filtered through
 * `verification.status` and only a proved address is ever returned.
 */
function verifiedEmail(user: User): string | null {
  const addresses = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const verified = addresses.filter((address) => address.verification?.status === 'verified');
  const primaryId = user.primaryEmailAddressId;
  // `primaryId` is compared only when it exists: `undefined === undefined`
  // would otherwise match an address that carries no id at all.
  const chosen = (primaryId ? verified.find((address) => address.id === primaryId) : undefined) ?? verified[0];
  const email = chosen?.emailAddress.trim().toLowerCase() ?? '';
  return email.length > 0 ? email : null;
}

/** The email lookup, with the « Clerk could not answer » case kept apart. */
export type EmailRead =
  | { status: 'ok'; email: string }
  /** Read the account: it carries no verified address (so it is nobody's admin). */
  | { status: 'none' }
  /** Could not read the account. Nothing is proved either way — retry. */
  | { status: 'unavailable' };

/** The full answer, for the two callers that must tell a refusal from an outage. */
export async function currentUserEmailResult(): Promise<EmailRead> {
  const read = await readUser();
  if (read.status === 'unavailable') return { status: 'unavailable' };
  if (read.status === 'anonymous') return { status: 'none' };
  const email = verifiedEmail(read.user);
  return email === null ? { status: 'none' } : { status: 'ok', email };
}

/**
 * The verified email of the signed-in user, trimmed and lowercased, or `null`
 * — which covers « signed out », « no verified address » and « Clerk is down »
 * alike. Callers that need to tell those apart use `currentUserEmailResult()`.
 */
export async function currentUserEmail(): Promise<string | null> {
  const read = await currentUserEmailResult();
  return read.status === 'ok' ? read.email : null;
}

/** The display name of the signed-in user, or `null` when the account has none. */
export async function currentUserName(): Promise<string | null> {
  const read = await readUser();
  if (read.status !== 'user') return null;
  const { user } = read;
  const raw = user.fullName ?? [user.firstName, user.lastName].filter((part) => Boolean(part)).join(' ');
  const name = raw.trim();
  return name.length > 0 ? name : null;
}
