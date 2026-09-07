import type { Metadata } from 'next';

/** The admin is never indexed; the root layout already provides html/body and fonts. */
export const metadata: Metadata = {
  title: { default: 'Administration · Recharge Meru', template: '%s · Administration' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-mist text-ink">{children}</div>;
}
