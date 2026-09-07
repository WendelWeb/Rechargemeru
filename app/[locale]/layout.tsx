import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { clerkConfigured, currentUserId } from '@/lib/auth/clerk';
import { siteUrl } from '@/lib/site-url';
import { getSettings } from '@/lib/settings/store';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SandboxBanner } from '@/components/site/SandboxBanner';

export const dynamic = 'force-dynamic';

type LocaleParams = { params: Promise<{ locale: string }> };
type LocaleLayoutProps = LocaleParams & { children: React.ReactNode };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'common' });
  const brand = t('brand');
  const description = t('tagline');
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: brand, template: `%s · ${brand}` },
    description,
    openGraph: {
      title: brand,
      description,
      siteName: brand,
      type: 'website',
      locale: locale === 'ht' ? 'ht_HT' : 'fr_HT',
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [settings, userId] = await Promise.all([getSettings(), currentUserId()]);

  // Resolved here, not in the header: reading the session needs Clerk's
  // server module, and the header's file is also part of the browser bundle
  // (`whatsappLink` is imported by client components). `null` means accounts
  // are switched off, and the header then looks exactly as it did before.
  const account = clerkConfigured() ? { signedIn: userId !== null } : null;

  return (
    <NextIntlClientProvider>
      <SiteHeader
        businessName={settings.businessName}
        supportWhatsapp={settings.supportWhatsapp}
        account={account}
      />
      <SandboxBanner />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter businessName={settings.businessName} supportWhatsapp={settings.supportWhatsapp} />
    </NextIntlClientProvider>
  );
}
