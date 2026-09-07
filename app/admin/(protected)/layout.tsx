import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/auth/admin';
import { getSettings } from '@/lib/settings/store';

/**
 * Second lock on every admin page. `proxy.ts` already rejects anonymous
 * requests to `/admin/*`, but a route group is not a security boundary on its
 * own: this layout re-checks with Clerk server-side — and, unlike the proxy,
 * checks that the signed-in email is on the ADMIN_EMAILS list — while each
 * Server Action checks a third time.
 *
 * `force-dynamic` because every page below reads the database on each request
 * — and because `next build` must succeed with no `DATABASE_URL` at all.
 */
export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const settings = await getSettings();

  return (
    <AdminShell email={admin.email} businessName={settings.businessName}>
      {children}
    </AdminShell>
  );
}
