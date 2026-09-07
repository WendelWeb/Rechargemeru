import { redirect } from 'next/navigation';
import { envTrim } from '@/lib/env';
import { clerkConfigured, currentUserEmail, currentUserEmailResult, currentUserId } from '@/lib/auth/clerk';

/**
 * lib/auth/admin.ts — who is allowed into `/admin`.
 *
 * There is no admin password any more: an administrator is simply a Clerk user
 * whose **verified** email address is listed in `ADMIN_EMAILS` (comma
 * separated). Verified is the load-bearing word: Clerk stores an address as
 * soon as it is added, so anything less would let a stranger claim the
 * operator's address from their own profile. Removing an operator is an
 * environment change, not a database write, and no secret ever has to be
 * rotated to lock somebody out.
 *
 * `isAdminEmail` is pure and case-insensitive so it can be unit-tested on its
 * own (`lib/auth/admin.test.ts`); everything above it is a thin wrapper over
 * `lib/auth/clerk.ts`, which never throws.
 */

export type AdminSession = { email: string };

export const ADMIN_LOGIN_PATH = '/admin/login';

/** `?refuse=1` on the login page: signed in, but with an account that has no access. */
export const ADMIN_REFUSED_PATH = `${ADMIN_LOGIN_PATH}?refuse=1`;

/**
 * `?erreur=lecture`: signed in, but Clerk could not be asked who this is.
 * Nothing is proved either way, so the operator is told to retry rather than
 * told their account was refused — which would send them hunting for a
 * configuration problem that does not exist while paid orders wait.
 */
export const ADMIN_UNAVAILABLE_PATH = `${ADMIN_LOGIN_PATH}?erreur=lecture`;

/**
 * The configured administrators, lowercased and de-duplicated. Empty when
 * `ADMIN_EMAILS` is unset — which means nobody gets in, never everybody.
 */
export function adminEmails(): string[] {
  const raw = envTrim('ADMIN_EMAILS');
  if (!raw) return [];
  const emails = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const email = part.trim().toLowerCase();
    if (email.length > 0) emails.add(email);
  }
  return [...emails];
}

/** True when `email` is one of the configured administrators. Pure, case- and space-insensitive. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const candidate = email.trim().toLowerCase();
  if (candidate.length === 0) return false;
  return adminEmails().includes(candidate);
}

/** Clerk keys present **and** at least one administrator listed. */
export function adminConfigured(): boolean {
  return clerkConfigured() && adminEmails().length > 0;
}

/** French sentences naming exactly what is missing; empty when the admin is usable. */
export function adminConfigProblems(): string[] {
  const problems: string[] = [];
  if (envTrim('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') === undefined) {
    problems.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY manquante : le formulaire de connexion ne peut pas s’afficher.');
  }
  if (envTrim('CLERK_SECRET_KEY') === undefined) {
    problems.push('CLERK_SECRET_KEY manquante : le serveur ne peut pas vérifier les sessions.');
  }
  if (adminEmails().length === 0) {
    problems.push('ADMIN_EMAILS manquante : aucun compte n’a accès à l’administration.');
  }
  return problems;
}

/**
 * The signed-in administrator for this request, or `null` — for code that
 * merely wants to know (the home page, the sandbox banner). Never redirects,
 * never throws.
 */
export async function currentAdmin(): Promise<AdminSession | null> {
  if (!adminConfigured()) return null;
  const email = (await currentUserEmail())?.trim().toLowerCase() ?? '';
  return isAdminEmail(email) ? { email } : null;
}

/**
 * The lock every admin page, layout and Server Action opens with. `proxy.ts`
 * already turns anonymous requests away, but a route group is not a security
 * boundary and a Server Action is an endpoint of its own — so the check is
 * repeated here, where it is authoritative.
 *
 * The three refusals are deliberately distinct: an anonymous visitor gets the
 * sign-in form; somebody signed in with the wrong account gets `?refuse=1`,
 * which the login page answers with « ce compte n'a pas accès » instead of a
 * form they have already filled in correctly; and a session Clerk could not
 * resolve gets `?erreur=lecture`, because a Clerk hiccup must never be
 * reported to the operator as « votre compte est refusé ».
 */
export async function requireAdmin(): Promise<AdminSession> {
  const userId = adminConfigured() ? await currentUserId() : null;
  if (!userId) redirect(ADMIN_LOGIN_PATH);

  const read = await currentUserEmailResult();
  if (read.status === 'unavailable') redirect(ADMIN_UNAVAILABLE_PATH);
  if (read.status !== 'ok' || !isAdminEmail(read.email)) redirect(ADMIN_REFUSED_PATH);

  return { email: read.email };
}
