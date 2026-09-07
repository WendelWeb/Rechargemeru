import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { SignUp } from '@clerk/nextjs';
import { Link } from '@/i18n/navigation';
import { routing, type AppLocale } from '@/i18n/routing';
import { clerkAppearance, clerkConfigured } from '@/lib/auth/clerk';
import { Alert } from '@/components/ui/Alert';
import { buttonClasses } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

/**
 * `/{locale}/inscription` — the sibling of `/connexion`, same frame.
 *
 * An account buys three things and no more: a prefilled form, the history of
 * one's recharges, and orders attached to a name. It buys nothing at the
 * till, and the page says so twice — once in the lead, once above the button
 * that goes straight back to the calculator.
 */

type SignUpPageProps = { params: Promise<{ locale: string; rest?: string[] }> };

const COPY: Record<AppLocale, {
  title: string;
  lead: string;
  guest: string;
  guestCta: string;
  signIn: string;
  offTitle: string;
  offBody: string;
  metaTitle: string;
  metaDescription: string;
}> = {
  fr: {
    title: 'Créer un compte',
    lead: 'Vos informations enregistrées une fois, et l’historique de toutes vos recharges.',
    guest: 'Créer un compte reste facultatif : la recharge fonctionne sans.',
    guestCta: 'Recharger sans compte',
    signIn: 'J’ai déjà un compte',
    offTitle: 'Les comptes ne sont pas encore ouverts',
    offBody:
      'La création de compte n’est pas disponible sur ce serveur. Vous pouvez commander normalement et suivre votre commande avec sa référence.',
    metaTitle: 'Créer un compte',
    metaDescription: 'Créez un compte pour garder vos informations et l’historique de vos recharges Meru.',
  },
  ht: {
    title: 'Kreye yon kont',
    lead: 'Enfòmasyon w yo anrejistre yon sèl fwa, ak istorik tout rechaj ou yo.',
    guest: 'Kreye yon kont se yon chwa : rechaj la mache menm san li.',
    guestCta: 'Rechaje san kont',
    signIn: 'Mwen gen yon kont deja',
    offTitle: 'Kont yo poko louvri',
    offBody:
      'Ou pa ka kreye yon kont sou sèvè sa a pou kounye a. Ou ka fè kòmand ou nòmalman epi swiv li ak nimewo referans lan.',
    metaTitle: 'Kreye yon kont',
    metaDescription: 'Kreye yon kont pou w kenbe enfòmasyon w yo ak istorik rechaj Meru ou yo.',
  },
};

export async function generateMetadata({ params }: SignUpPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const copy = COPY[locale];
  return { title: copy.metaTitle, description: copy.metaDescription, robots: { index: false, follow: true } };
}

export default async function SignUpPage({ params }: SignUpPageProps) {
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
          <SignUp
            routing="path"
            path={`/${locale}/inscription`}
            signInUrl={`/${locale}/connexion`}
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
          <Link href="/connexion" className={buttonClasses('ghost', 'sm')}>
            {copy.signIn}
          </Link>
        </div>
      </div>
    </div>
  );
}
