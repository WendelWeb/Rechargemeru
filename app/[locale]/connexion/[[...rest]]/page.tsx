import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { SignIn } from '@clerk/nextjs';
import { Link } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { clerkAppearance, clerkConfigured } from '@/lib/auth/clerk';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

/**
 * `/{locale}/connexion` — signing in is a convenience, never a gate.
 *
 * The catch-all segment is Clerk's requirement: the card walks through
 * sub-steps (code, second factor, reset) on child paths of this one. Around
 * it, the page is ours — display-font title, one centred column, the palette
 * — and it says in as many words that ordering does not need an account.
 */

type SignInPageProps = { params: Promise<{ locale: string; rest?: string[] }> };

const COPY: Record<AppLocale, {
  title: string;
  lead: string;
  guest: string;
  guestCta: string;
  offTitle: string;
  offBody: string;
  track: string;
  metaTitle: string;
  metaDescription: string;
}> = {
  fr: {
    title: 'Se connecter',
    lead: 'Retrouvez vos recharges et vos informations en un coup d’œil.',
    guest: 'Le compte n’est qu’un raccourci : on peut commander sans en créer un.',
    guestCta: 'Recharger sans compte',
    offTitle: 'Les comptes ne sont pas encore ouverts',
    offBody:
      'La connexion n’est pas disponible sur ce serveur. Vous pouvez commander normalement et suivre votre commande avec sa référence.',
    track: 'Suivre une commande',
    metaTitle: 'Se connecter',
    metaDescription: 'Connectez-vous pour retrouver vos recharges Meru. La commande sans compte reste possible.',
  },
  ht: {
    title: 'Konekte',
    lead: 'Jwenn tout rechaj ou yo ak enfòmasyon w yo yon sèl kote.',
    guest: 'Kont lan se yon rakousi sèlman : ou ka fè yon kòmand san ou pa gen youn.',
    guestCta: 'Rechaje san kont',
    offTitle: 'Kont yo poko louvri',
    offBody:
      'Koneksyon an pa disponib sou sèvè sa a. Ou ka fè kòmand ou nòmalman epi swiv li ak nimewo referans lan.',
    track: 'Swiv yon kòmand',
    metaTitle: 'Konekte',
    metaDescription: 'Konekte pou w jwenn rechaj Meru ou yo. Ou toujou ka kòmande san kont.',
  },
};

export async function generateMetadata({ params }: SignInPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const copy = COPY[locale];
  return { title: copy.metaTitle, description: copy.metaDescription, robots: { index: false, follow: true } };
}

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const copy = COPY[locale];

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{copy.title}</h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">{copy.lead}</p>
      </header>

      {clerkConfigured() ? (
        <div className="mt-8 flex justify-center">
          <SignIn
            routing="path"
            path={`/${locale}/connexion`}
            signUpUrl={`/${locale}/inscription`}
            fallbackRedirectUrl={`/${locale}/mes-commandes`}
            appearance={clerkAppearance}
          />
        </div>
      ) : (
        <Alert tone="info" className="mt-8" title={copy.offTitle}>
          {copy.offBody}
        </Alert>
      )}

      <div className="mt-8 space-y-3 text-center">
        <p className="text-sm leading-snug text-ink-soft">{copy.guest}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonClasses('ghost', 'sm')}>
            {copy.guestCta}
          </Link>
          <Link href="/suivi" className={buttonClasses('ghost', 'sm')}>
            {copy.track}
          </Link>
        </div>
      </div>
    </div>
  );
}
