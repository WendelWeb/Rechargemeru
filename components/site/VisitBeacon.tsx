'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { cleanLabel, kindLabel, linkTarget } from '@/lib/analytics/click-label';
import { disableTracking, flush, newViewId, setCurrentView, track, trackingEnabled } from '@/lib/analytics/client';

/**
 * The visitor journey, measured from the browser.
 *
 * For each page shown it reports:
 *   - the page view itself (`POST /api/visit`, with a view id so everything
 *     that happens on that page is filed under it, plus the screen size, the
 *     connection type and the browser language);
 *   - the ACTIVE time spent on it: counted only while the tab is visible and
 *     somebody is there — two minutes without a touch, a scroll or a key
 *     pauses the clock (thirty seconds after the last sign of life), a
 *     background tab does not count, and a page never counts more than
 *     thirty minutes. The time already measured is reported each time the
 *     tab goes to the background (a phone locking often never comes back),
 *     then only what was added since: the server sums the pieces;
 *   - how far down it was scrolled;
 *   - every button and link pressed, by its NAME — the words on it, its
 *     `aria-label`, or `data-track` when a component names it on purpose —
 *     and a link by its destination. Nothing typed into a field is read,
 *     and a name that looks like an address or a phone number is dropped
 *     (see lib/analytics/click-label.ts).
 *
 * The device and visit ids live in HttpOnly cookies set by the server; this
 * component cannot read them and does not need to. Automated browsers
 * (`navigator.webdriver`) are not measured at all. Renders nothing.
 */

/**
 * Module scope, not a ref: « first view of the page load » must survive this
 * component remounting (it remounts when the visitor switches language), and
 * only a full page load resets a module.
 */
let referrerSent = false;

const IDLE_AFTER_MS = 120_000;
const IDLE_GRACE_MS = 30_000;
const PAGE_CAP_MS = 30 * 60_000;
const MIN_REPORT_MS = 500;

type Clock = {
  activeMs: number;
  reportedMs: number;
  visibleSince: number | null;
  lastInteraction: number;
  maxScroll: number;
  reportedScroll: number;
};

function freshClock(): Clock {
  const now = performance.now();
  return {
    activeMs: 0,
    reportedMs: 0,
    visibleSince: document.visibilityState === 'visible' ? now : null,
    lastInteraction: now,
    maxScroll: 0,
    reportedScroll: 0,
  };
}

function pauseAt(clock: Clock, at: number): void {
  if (clock.visibleSince === null) return;
  clock.activeMs += Math.max(0, at - clock.visibleSince);
  clock.visibleSince = null;
}

/** Queues the active time and scroll measured since the last report. */
function report(clock: Clock): void {
  const running = clock.visibleSince === null ? 0 : performance.now() - clock.visibleSince;
  const total = Math.min(PAGE_CAP_MS, clock.activeMs + running);
  const delta = Math.round(total - clock.reportedMs);
  if (delta >= MIN_REPORT_MS) {
    track('page_end', 'temps', { value: delta });
    clock.reportedMs += delta;
  }
  if (clock.maxScroll > clock.reportedScroll) {
    track('scroll', 'défilement', { value: clock.maxScroll });
    clock.reportedScroll = clock.maxScroll;
  }
}

function utmSource(): string {
  try {
    return new URLSearchParams(window.location.search).get('utm_source') ?? '';
  } catch {
    return '';
  }
}

type NetworkInformation = { effectiveType?: string };

/** The element a click was really meant for, and what to call it. */
const CLICKABLE =
  '[data-track],a[href],button,summary,label,select,[role="button"],[role="switch"],[role="radio"],[role="tab"]';

export function VisitBeacon({ locale }: { locale: string }) {
  const pathname = usePathname();
  // The last path reported. React StrictMode runs every effect twice in
  // development; without this, each page would be counted twice.
  const lastSent = useRef<string | null>(null);
  const clock = useRef<Clock | null>(null);

  // Page-wide listeners, once.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      disableTracking();
      return;
    }

    let lastClick = { name: '', at: 0 };
    function onClick(event: MouseEvent) {
      const start = event.target instanceof Element ? event.target : null;
      if (!start || start.closest('[data-no-track]')) return;
      const el = start.closest(CLICKABLE);
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      const name =
        cleanLabel(el.getAttribute('data-track')) ??
        cleanLabel(el.getAttribute('aria-label')) ??
        cleanLabel(el instanceof HTMLElement ? el.innerText : el.textContent) ??
        cleanLabel(el.getAttribute('title')) ??
        kindLabel(tag, el.getAttribute('type'));
      // A click on a <label> fires a second one on its input: count it once.
      const now = performance.now();
      if (lastClick.name === name && now - lastClick.at < 400) return;
      lastClick = { name, at: now };
      const target = tag === 'a' ? linkTarget(el.getAttribute('href'), window.location.origin) : null;
      track('click', name, { target });
    }

    function touch() {
      const c = clock.current;
      if (!c) return;
      c.lastInteraction = performance.now();
      if (c.visibleSince === null && document.visibilityState === 'visible') c.visibleSince = c.lastInteraction;
    }

    let scrollFrame = 0;
    function onScroll() {
      touch();
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const c = clock.current;
        if (!c) return;
        const height = Math.max(1, document.documentElement.scrollHeight);
        const pct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
        if (pct > c.maxScroll) c.maxScroll = pct;
      });
    }

    function onVisibility() {
      const c = clock.current;
      if (!c) return;
      if (document.visibilityState === 'hidden') {
        pauseAt(c, performance.now());
        report(c);
        flush(true);
      } else {
        touch();
      }
    }

    function onPageHide() {
      const c = clock.current;
      if (c) {
        pauseAt(c, performance.now());
        report(c);
      }
      flush(true);
    }

    // Idle: two minutes without a sign of life pauses the clock at thirty
    // seconds after the last one — reading a receipt is time on the page, a
    // phone forgotten on a table is not.
    const idle = setInterval(() => {
      const c = clock.current;
      if (!c || c.visibleSince === null) return;
      if (performance.now() - c.lastInteraction > IDLE_AFTER_MS) pauseAt(c, c.lastInteraction + IDLE_GRACE_MS);
    }, 15_000);

    document.addEventListener('click', onClick, { capture: true, passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch, { passive: true });
    window.addEventListener('touchstart', touch, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(idle);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('touchstart', touch);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // One page view per path: close the previous one, open the next.
  useEffect(() => {
    if (!pathname || lastSent.current === pathname || !trackingEnabled()) return;
    lastSent.current = pathname;

    if (clock.current) {
      pauseAt(clock.current, performance.now());
      report(clock.current);
    }
    const viewId = newViewId();
    setCurrentView({ id: viewId, path: pathname });
    clock.current = freshClock();

    const referrer = referrerSent ? '' : document.referrer;
    referrerSent = true;
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    try {
      fetch('/api/visit', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: pathname,
          referrer,
          locale,
          utm: utmSource(),
          viewId,
          screen: `${window.screen.width}x${window.screen.height}`,
          net: connection?.effectiveType ?? '',
          lang: navigator.language ?? '',
        }),
      }).catch(() => {});
    } catch {
      // `fetch` itself can throw synchronously (a keepalive quota exceeded):
      // the view is simply not counted.
    }
  }, [pathname, locale]);

  return null;
}
