import { defineRouting } from 'next-intl/routing';

/**
 * Public-site routing: French by default, Haitian Creole as the second
 * locale, both always prefixed (`/fr/…`, `/ht/…`). The admin lives outside
 * this segment (`/admin/…`) and never goes through next-intl.
 */
export const routing = defineRouting({
  locales: ['fr', 'ht'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/** Message namespaces, one JSON file each under `messages/{fr,ht}/`. */
export const NAMESPACES = ['common', 'home', 'order', 'track', 'faq', 'terms', 'account'] as const;
export type Namespace = (typeof NAMESPACES)[number];
