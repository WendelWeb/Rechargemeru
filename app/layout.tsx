import type { Metadata, Viewport } from 'next';
import { getLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { frFR } from '@clerk/localizations';
import { clerkConfigured } from '@/lib/auth/clerk';
import { fontVariables } from '@/lib/fonts';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

/**
 * The single root layout. The public site (`app/[locale]/`) and the admin
 * (`app/admin/`) both render inside it; `lang` follows the locale next-intl
 * matched for the request (French when the request is outside the locale
 * segment, i.e. the admin). No message provider here — the locale layout owns
 * that one.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'Recharge Meru', template: '%s · Recharge Meru' },
  description: 'Rechargez votre compte Meru en dollars US avec MonCash ou NatCash.',
  applicationName: 'Recharge Meru',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E1B3D',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  // The provider is mounted only when both Clerk keys are set: without them it
  // would refuse to render, and the public site — which needs no account for
  // anything — must keep working and keep building. Clerk's own strings are
  // French; there is no Kreyòl bundle, so `ht` visitors see the French labels
  // inside the sign-in card and our own copy around it.
  //
  // It sits INSIDE `<body>`, not around `<html>`, as Clerk's Next.js setup
  // requires: wrapping the document element makes the provider own the html
  // tag React hydrates, which is what breaks `lang` and the font variables.
  const body = clerkConfigured() ? (
    <ClerkProvider localization={frFR}>{children}</ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang={locale} className={`${fontVariables} h-full`}>
      <body className="flex min-h-full flex-col bg-paper font-body text-ink">{body}</body>
    </html>
  );
}
