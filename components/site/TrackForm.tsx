'use client';

import { useActionState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lookupOrder, type LookupState } from '@/lib/orders/actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, fieldDescribedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Reference plus the exact WhatsApp number: the only way, apart from the
 * browser that created the order, to open its full details. « Inconnu » and
 * « ne correspond pas » give the same answer on purpose, so the form cannot
 * be used to test whether a reference exists.
 */
export type TrackFormProps = {
  /** Pre-filled from the `rm_order` cookie when the visitor has one. */
  defaultReference?: string | null;
};

const INITIAL: LookupState = {};

export function TrackForm({ defaultReference }: TrackFormProps) {
  const t = useTranslations('track');
  const [state, formAction, pending] = useActionState(lookupOrder, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <Alert tone="danger">{t(`errors.${state.error}`)}</Alert> : null}

      <Field htmlFor="reference" label={t('form.reference')} hint={t('form.referenceHint')}>
        <Input
          id="reference"
          name="reference"
          mono
          required
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={defaultReference ?? ''}
          placeholder={t('form.referencePlaceholder')}
          aria-describedby={fieldDescribedBy('reference', { hint: true })}
        />
      </Field>

      <Field htmlFor="phone" label={t('form.phone')} hint={t('form.phoneHint')}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          mono
          required
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="send"
          placeholder={t('form.phonePlaceholder')}
          aria-describedby={fieldDescribedBy('phone', { hint: true })}
        />
      </Field>

      <Button type="submit" variant="dark" size="lg" className="w-full" loading={pending} loadingLabel={t('form.submitting')}>
        <Search className="size-4" aria-hidden="true" />
        {t('form.submit')}
      </Button>
    </form>
  );
}
