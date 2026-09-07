import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation for the public site only. Admin code
 * (`app/admin/**`, `components/admin/**`, `lib/admin/**`) must use
 * `next/link` and `next/navigation` instead — an ESLint rule enforces it.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
