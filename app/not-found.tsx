import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Root 404, for requests that never enter a locale segment (paths the
 * proxy's matcher skips, such as a stray `/something.php`). There is no
 * locale signal here, so the copy is static and bilingual.
 */
export default function RootNotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-10 px-4 py-20 sm:px-6 sm:py-28">
      <div lang="fr" className="space-y-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Page introuvable</h1>
        <p className="text-lg leading-relaxed text-ink-soft">
          Cette page n&apos;existe pas ou a été déplacée. Revenez à l&apos;accueil pour recharger votre compte Meru.
        </p>
        <Link href="/fr" className={buttonClasses('dark', 'md')}>
          Retour à l&apos;accueil
        </Link>
      </div>
      <div lang="ht" className="space-y-3 border-t border-line pt-8">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Paj sa a pa egziste</h2>
        <p className="text-lg leading-relaxed text-ink-soft">
          Paj sa a pa egziste oswa li deplase. Tounen lakay pou rechaje kont Meru ou.
        </p>
        <Link href="/ht" className={buttonClasses('ghost', 'md')}>
          Tounen lakay
        </Link>
      </div>
    </section>
  );
}
