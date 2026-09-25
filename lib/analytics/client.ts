/**
 * lib/analytics/client.ts — the browser half of the visitor journeys.
 *
 * Events (a click, a form step, a refused field, the time spent on a page)
 * wait in a small queue and leave in batches: four seconds after the first
 * one, at fifty, or at once when the visitor leaves (then through
 * `sendBeacon`, which survives the page closing). Each event carries its age
 * rather than the phone's clock, so a phone set to the wrong time still
 * lands every event at the right moment on the server.
 *
 * Only ever imported by client components; every function is a no-op on the
 * server and once tracking is switched off (automated browsers).
 */

export type TrackType = 'click' | 'step' | 'error' | 'submit' | 'page_end' | 'scroll';

type Queued = {
  type: TrackType;
  name: string;
  target?: string;
  value?: number;
  path: string;
  viewId?: string;
  at: number;
};

const ENDPOINT = '/api/events';
const BATCH = 50;
const FLUSH_DELAY_MS = 4000;

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let view: { id: string; path: string } | null = null;
let enabled = true;

/** Stops everything (automated browsers): nothing is queued or sent any more. */
export function disableTracking(): void {
  enabled = false;
  queue = [];
}

export function trackingEnabled(): boolean {
  return enabled;
}

/** The page being viewed: every event is filed under it. */
export function setCurrentView(next: { id: string; path: string } | null): void {
  view = next;
}

/** A short random id for one page view. */
export function newViewId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, 24);
}

/** Queues one event. `name` is a label, never something the visitor typed. */
export function track(
  type: TrackType,
  name: string,
  extra: { target?: string | null; value?: number | null } = {},
): void {
  if (!enabled || typeof window === 'undefined' || !name) return;
  queue.push({
    type,
    name,
    target: extra.target ?? undefined,
    value: extra.value ?? undefined,
    path: view?.path ?? window.location.pathname,
    viewId: view?.id,
    at: Date.now(),
  });
  if (queue.length >= BATCH) {
    flush();
    return;
  }
  timer ??= setTimeout(() => flush(), FLUSH_DELAY_MS);
}

/**
 * Sends what is queued. `leaving` uses `sendBeacon` first — the only request
 * a closing page is sure to finish — and `fetch` with `keepalive` otherwise.
 * Failures are swallowed: measuring must never cost the visitor anything.
 */
export function flush(leaving = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!enabled || queue.length === 0 || typeof window === 'undefined') return;
  const now = Date.now();
  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH);
    const body = JSON.stringify({
      events: batch.map(({ at, ...event }) => ({ ...event, age: Math.max(0, now - at) })),
    });
    let sent = false;
    if (leaving && typeof navigator.sendBeacon === 'function') {
      try {
        sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } catch {
        sent = false;
      }
    }
    if (!sent) {
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          keepalive: true,
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body,
        }).catch(() => {});
      } catch {
        // `fetch` can throw synchronously (keepalive quota): the batch is lost, nothing else.
      }
    }
  }
}
