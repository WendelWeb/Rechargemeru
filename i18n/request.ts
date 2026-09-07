import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { TIME_ZONE } from '@/lib/format';
import { NAMESPACES, routing, type Namespace } from './routing';

type MessageTree = Record<string, unknown>;

/**
 * Loads one namespace file. A namespace that has no file for this locale
 * yet is simply absent from the merged messages instead of breaking the
 * request.
 */
async function loadNamespace(locale: string, namespace: Namespace): Promise<MessageTree | null> {
  try {
    const mod = (await import(`../messages/${locale}/${namespace}.json`)) as { default: MessageTree };
    return mod.default;
  } catch {
    return null;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const messages: Record<string, MessageTree> = {};
  for (const namespace of NAMESPACES) {
    const tree = await loadNamespace(locale, namespace);
    if (tree) messages[namespace] = tree;
  }

  return { locale, messages, timeZone: TIME_ZONE };
});
