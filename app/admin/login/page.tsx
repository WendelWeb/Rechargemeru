import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut, ShieldAlert, ShieldX, TriangleAlert } from 'lucide-react';
import { SignIn, SignOutButton } from '@clerk/nextjs';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { ADMIN_LOGIN_PATH, adminConfigProblems, isAdminEmail } from '@/lib/auth/admin';
import { clerkAppearance, currentUserEmailResult, currentUserId } from '@/lib/auth/clerk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Connexion' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Only an in-app admin path is ever followed after signing in: an open
 * redirect on a login page is how a stolen session starts.
 */
function safeNext(raw: string | string[] | undefined): string {
  const value = first(raw);
  return typeof value === 'string' && value.startsWith('/admin') && !value.startsWith('//') ? value : '/admin';
}

/**
 * The one door into the admin. It sits OUTSIDE `(protected)`, so the
 * layout's `requireAdmin()` never runs here — which is what keeps the
 * redirect from looping.
 *
 * Four states, decided server-side:
 *
 * - the server has no Clerk keys (or no `ADMIN_EMAILS`) ⇒ say exactly which
 *   variables are missing, and show no form that could not work;
 * - somebody is signed in with an account that is not an administrator ⇒ a
 *   plain refusal and a way to sign out, never a second password prompt;
 * - somebody is signed in but Clerk could not be asked who they are ⇒ « nous
 *   n'avons pas pu lire votre compte », and a way to retry: an outage must
 *   never read as a refusal;
 * - nobody is signed in ⇒ Clerk's sign-in card, framed by our own page.
 */
export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const refused = first(sp.refuse) === '1';
  const unreadable = first(sp.erreur) === 'lecture';

  const problems = adminConfigProblems();

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Administration</h1>
        <p className="mt-1 text-[15px] leading-snug text-ink-soft">
          Espace réservé à l’opérateur. Les envois de dollars se font depuis ici.
        </p>

        {problems.length > 0 ? (
          <NotConfigured problems={problems} />
        ) : (
          <SignedInOrForm next={next} refused={refused} unreadable={unreadable} />
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/" className="rounded underline underline-offset-4 hover:text-ink">
            Retour au site
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Signed in ⇒ straight to the admin, a refusal, or « illisible ». Signed out ⇒ the form. */
async function SignedInOrForm({
  next,
  refused,
  unreadable,
}: {
  next: string;
  refused: boolean;
  unreadable: boolean;
}) {
  const userId = await currentUserId();

  if (userId === null) {
    return (
      <div className="mt-6">
        {unreadable ? (
          <Alert tone="warning" className="mb-4">
            Nous n’avons pas pu lire votre compte auprès de Clerk. Reconnectez-vous, puis réessayez.
          </Alert>
        ) : refused ? (
          <Alert tone="warning" className="mb-4">
            Connectez-vous avec le compte autorisé pour ouvrir l’administration.
          </Alert>
        ) : null}
        <div className="flex justify-center">
          {/* Hash routing: `/admin/login` is a plain page, not a catch-all, so
              Clerk's sub-steps live in the URL fragment instead of child paths. */}
          <SignIn routing="hash" fallbackRedirectUrl={next} appearance={clerkAppearance} />
        </div>
      </div>
    );
  }

  // The state is re-read here rather than trusted from the query string: if
  // Clerk has recovered since the redirect, the operator simply goes through.
  const read = await currentUserEmailResult();
  if (read.status === 'unavailable') return <Unavailable next={next} />;

  const email = read.status === 'ok' ? read.email : null;
  if (isAdminEmail(email)) redirect(next);

  return <Refused email={email} />;
}

/** Signed in, but Clerk could not say who this is. Nothing is decided — retry. */
function Unavailable({ next }: { next: string }) {
  return (
    <Card className="mt-6" padding="lg">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-6 shrink-0 text-sun-deep" aria-hidden="true" />
        <div className="min-w-0">
          <CardTitle as="h2">Nous n’avons pas pu lire votre compte</CardTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Votre session est bien là, mais Clerk n’a pas répondu quand nous lui avons demandé à qui elle appartient.
            Ce n’est pas un refus : votre accès n’a pas changé.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Réessayez dans un instant. Si cela dure, vérifiez l’état de Clerk et les clés du projet.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={next} className={buttonClasses('dark', 'md')}>
          Réessayer
        </Link>
        <SignOutButton redirectUrl={ADMIN_LOGIN_PATH}>
          <button type="button" className={buttonClasses('ghost', 'md')}>
            <LogOut className="size-4" aria-hidden="true" />
            Se déconnecter
          </button>
        </SignOutButton>
      </div>
    </Card>
  );
}

/** Signed in, but this account is not on the `ADMIN_EMAILS` list. */
function Refused({ email }: { email: string | null }) {
  return (
    <Card className="mt-6" padding="lg">
      <div className="flex items-start gap-3">
        <ShieldX className="mt-0.5 size-6 shrink-0 text-coral" aria-hidden="true" />
        <div className="min-w-0">
          <CardTitle as="h2">Ce compte n’a pas accès à l’administration</CardTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {email ? (
              <>
                Vous êtes connecté avec <span className="font-semibold text-ink">{email}</span>. Cette adresse ne
                figure pas dans la liste des administrateurs.
              </>
            ) : (
              <>Ce compte ne porte aucune adresse email vérifiée, il ne peut donc pas être reconnu comme administrateur.</>
            )}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Déconnectez-vous, puis reconnectez-vous avec le compte de l’opérateur. Si l’adresse est la bonne, ajoutez-la
            à <code className="rounded bg-mist px-1 py-0.5 text-[0.85em]">ADMIN_EMAILS</code> puis redéployez.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <SignOutButton redirectUrl={ADMIN_LOGIN_PATH}>
          <button type="button" className={buttonClasses('dark', 'md')}>
            <LogOut className="size-4" aria-hidden="true" />
            Se déconnecter
          </button>
        </SignOutButton>
        <Link href="/" className={buttonClasses('ghost', 'md')}>
          Retour au site
        </Link>
      </div>
    </Card>
  );
}

/** No Clerk keys, or no administrator listed: name the variables, show no form. */
function NotConfigured({ problems }: { problems: string[] }) {
  return (
    <Card className="mt-6" padding="lg">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-6 shrink-0 text-sun-deep" aria-hidden="true" />
        <div className="min-w-0">
          <CardTitle as="h2">Connexion non configurée</CardTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            L’administration s’ouvre avec un compte Clerk. Ce serveur n’a pas encore de quoi en vérifier un.
          </p>
        </div>
      </div>

      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-snug text-ink-soft">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>

      <Alert tone="info" className="mt-5" title="Ce qu’il faut définir">
        <ul className="mt-1 space-y-1">
          <li>
            <code className="rounded bg-paper/70 px-1 py-0.5 text-[0.85em]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> et{' '}
            <code className="rounded bg-paper/70 px-1 py-0.5 text-[0.85em]">CLERK_SECRET_KEY</code> — les deux clés de
            l’application Clerk (tableau de bord Clerk, « API keys »).
          </li>
          <li>
            <code className="rounded bg-paper/70 px-1 py-0.5 text-[0.85em]">ADMIN_EMAILS</code> — les adresses
            autorisées, séparées par des virgules.
          </li>
        </ul>
        <p className="mt-2">Ajoutez-les à l’environnement puis redéployez.</p>
      </Alert>
    </Card>
  );
}
