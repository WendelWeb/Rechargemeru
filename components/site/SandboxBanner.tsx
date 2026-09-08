import { getTranslations } from 'next-intl/server';
import { currentAdmin } from '@/lib/auth/admin';
import { moncashCheckoutAllowed, moncashMode } from '@/lib/payments/moncash';
import { natcashCheckoutAllowed, natcashMode } from '@/lib/payments/natcash';
import { Chip } from '@/components/ui/Chip';

/**
 * True when at least one rail this browser may pay through points at a
 * sandbox. On the production deployment that only ever happens for the
 * operator's own browser (see `moncashCheckoutAllowed`); locally and on
 * previews it is the normal state.
 */
export async function sandboxRailOffered(): Promise<boolean> {
  const hasAdminSession = (await currentAdmin()) !== null;
  return (
    (moncashCheckoutAllowed(hasAdminSession) && moncashMode() === 'sandbox') ||
    (natcashCheckoutAllowed(hasAdminSession) && natcashMode() === 'sandbox')
  );
}

/** Says, on every public page, that payments are simulated and no dollars will move. */
export async function SandboxBanner() {
  if (!(await sandboxRailOffered())) return null;
  const t = await getTranslations('common');
  return (
    <div role="status" className="border-b border-coral/30 bg-coral-soft">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-gutter py-2.5 text-sm text-ink">
        <Chip tone="test" className="mt-0.5">
          {t('test')}
        </Chip>
        <p>
          <span className="font-semibold">{t('sandbox.title')}</span>
          <span aria-hidden="true"> — </span>
          {t('sandbox.banner')}
        </p>
      </div>
    </div>
  );
}
