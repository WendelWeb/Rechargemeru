import { MessageCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatPhone } from '@/lib/phone';
import { Wordmark, whatsappLink } from './SiteHeader';

const NAV = [
  { href: '/', key: 'home' },
  { href: '/suivi', key: 'track' },
  { href: '/faq', key: 'faq' },
  { href: '/conditions', key: 'terms' },
] as const;

export type SiteFooterProps = {
  businessName: string;
  supportWhatsapp: string | null;
};

export async function SiteFooter({ businessName, supportWhatsapp }: SiteFooterProps) {
  const t = await getTranslations('common');
  const support = whatsappLink(supportWhatsapp);
  const supportNumber = supportWhatsapp && supportWhatsapp.startsWith('+') ? formatPhone(supportWhatsapp) : supportWhatsapp;
  const year = new Date().getFullYear();

  return (
    <footer data-surface="dark" className="mt-section bg-ink text-paper/80">
      <div className="mx-auto max-w-6xl px-gutter py-section">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1.2fr]">
          <div className="space-y-4">
            <Wordmark name={businessName} tone="paper" />
            <p className="max-w-sm text-[15px] leading-relaxed">{t('tagline')}</p>
            <p className="max-w-sm text-sm text-paper/60">{t('currencyNote')}</p>
          </div>

          {/* `min-h-tap` is what makes these four links touchable: bare
              text at 15px with no padding was an 18px target, ten pixels from
              the next one. The height also does the spacing, so the list has
              none of its own. */}
          <nav aria-label={t('nav.footer')}>
            <ul>
              {NAV.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-tap items-center rounded-lg text-body text-paper/85 transition-colors hover:text-sun"
                  >
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-[15px] leading-relaxed">{t('footer.support')}</p>
            {support && supportNumber ? (
              <a
                href={support}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-paper/10 px-4 font-semibold text-paper transition-colors hover:bg-paper/15"
              >
                <MessageCircle className="size-4 text-sun" aria-hidden="true" />
                <span className="tnum">{supportNumber}</span>
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-10 space-y-2 border-t border-paper/15 pt-6 text-sm text-paper/60">
          <p>{t('footer.notAffiliated', { business: businessName })}</p>
          <p>{t('footer.rights', { year, business: businessName })}</p>
        </div>
      </div>
    </footer>
  );
}
