import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';

export default function AdminNotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-20 sm:px-6 sm:py-28">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Page introuvable</h1>
      <p className="max-w-md text-lg leading-relaxed text-ink-soft">
        Cette page n&apos;existe pas dans l&apos;administration. La commande a peut-être été supprimée, ou
        l&apos;adresse est incomplète.
      </p>
      <Link href="/admin" className={buttonClasses('dark', 'lg')}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour au tableau de bord
      </Link>
    </section>
  );
}
