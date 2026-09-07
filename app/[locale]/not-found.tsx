import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Localised 404 for everything under `/fr` and `/ht`: unknown paths (through
 * `[...rest]/page.tsx`) and `notFound()` calls from pages. The locale comes
 * from the request config, so no params are needed here.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('common');
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-20 sm:px-6 sm:py-28">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t('notFound.title')}</h1>
      <p className="max-w-md text-lg leading-relaxed text-ink-soft">{t('notFound.body')}</p>
      <Link href="/" className={buttonClasses('dark', 'lg')}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('notFound.back')}
      </Link>
    </section>
  );
}
