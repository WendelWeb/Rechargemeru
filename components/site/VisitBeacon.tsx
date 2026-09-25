'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Tells `POST /api/visit` that a page of the public site was shown: once on
 * load, then on every client-side navigation (the pathname changes, the
 * layout that holds this component does not remount).
 *
 * What it sends is deliberately small — `{ path, referrer, locale, utm }` —
 * and the server trims it further; the device and visit ids live in HttpOnly
 * cookies the server sets, so nothing here can read or forge them.
 *
 * - `referrer` is `document.referrer` for the first view of the page load
 *   only. It never changes during client-side navigation, so repeating it on
 *   every page would credit each click inside the site to wherever the
 *   visitor first came from.
 * - `utm` is the `utm_source` of the current address (a link shared in a
 *   WhatsApp status, say), `''` when there is none.
 * - Automated browsers (`navigator.webdriver`) are skipped.
 *
 * Failures are swallowed: analytics must never cost the visitor anything —
 * no error, no retry, no delay. `keepalive` lets the request finish even when
 * the visitor is already leaving the page.
 *
 * Renders nothing.
 */

/**
 * Module scope, not a ref: « first view of the page load » must survive this
 * component remounting (mounted in the `[locale]` layout, it remounts when the
 * visitor switches language), and only a full page load resets a module.
 */
let referrerSent = false;

function utmSource(): string {
  try {
    return new URLSearchParams(window.location.search).get('utm_source') ?? '';
  } catch {
    return '';
  }
}

export function VisitBeacon({ locale }: { locale: string }) {
  const pathname = usePathname();
  // The last path reported. React StrictMode runs every effect twice in
  // development; without this, each page would be counted twice.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    lastSent.current = pathname;

    const referrer = referrerSent ? '' : document.referrer;
    referrerSent = true;

    try {
      fetch('/api/visit', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: pathname, referrer, locale, utm: utmSource() }),
      }).catch(() => {});
    } catch {
      // `fetch` itself can throw synchronously (a keepalive quota exceeded):
      // same answer, the view is simply not counted.
    }
  }, [pathname, locale]);

  return null;
}
