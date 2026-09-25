/**
 * lib/analytics/visitor.ts — the pure half of the visitor analytics: which
 * cookies say « same device » and « same visit », and how a raw beacon
 * (`POST /api/visit`) is cut down to the few harmless facts `page_views`
 * keeps.
 *
 * WHAT IS KEPT, AND WHAT IS NOT. A device is a random UUID the site put in a
 * first-party cookie, never a fingerprint; a visit is a random id in a
 * rolling 30-minute cookie. The page is its pathname only (a query string can
 * carry a phone number or an order reference someone pasted), the referrer
 * is its host name only, the user-agent is reduced to « Android · Chrome ».
 * The screen size, the network class (« 3g ») and the browser's language are
 * kept only in their ordinary shapes. No IP address is stored anywhere.
 *
 * Everything here is total: it takes whatever a browser (or a script
 * pretending to be one) sent and answers a clean value or `null`, and never
 * throws.
 */
import { isProduction } from '@/lib/env';

/** Random UUID of the browser, 400 days (the longest any browser keeps a cookie). */
export const DEVICE_COOKIE = 'rm_device';
/** Random id of the current visit, re-set on every page view so it lapses after 30 idle minutes. */
export const VISIT_COOKIE = 'rm_visit';

/** A visit ends after this long without a page view. */
export const VISIT_IDLE_MS = 30 * 60_000;

/** Chrome caps every cookie at 400 days; asking for more buys nothing. */
const DEVICE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const MAX_PATH_LENGTH = 200;
const MAX_REFERRER_HOST_LENGTH = 100;
const MAX_UTM_LENGTH = 60;
const MAX_CITY_LENGTH = 80;
/** One label part (« Samsung Internet », « Opera Mini »…); anything longer is noise. */
const MAX_LABEL_PART_LENGTH = 30;
/** A beacon is ~200 bytes; anything past this is not ours and is not read. */
export const MAX_VISIT_BODY_BYTES = 8_192;

/* -------------------------------------------------------------------------- */
/* Cookies                                                                    */
/* -------------------------------------------------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIT_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

/** True for an 8-4-4-4-12 hexadecimal UUID, whatever its case — what `crypto.randomUUID()` minted. */
export function isDeviceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** True for a visit id we could have minted: 8 to 40 URL-safe characters. */
export function isVisitId(value: string | null | undefined): value is string {
  return typeof value === 'string' && VISIT_ID_RE.test(value);
}

/**
 * True for a page-view id the browser could have minted: the same 8 to 40
 * URL-safe characters as a visit id. It arrives in a request body rather than
 * a cookie, so it is checked, never trusted — an id of any other shape is
 * simply dropped (`null`), which costs the row nothing but its link to the
 * page's time on screen.
 */
export function isViewId(value: unknown): value is string {
  return typeof value === 'string' && VISIT_ID_RE.test(value);
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * A fresh visit id: 16 URL-safe characters, 96 random bits. Each random byte
 * is folded onto the 64-letter alphabet with `& 63`, which is unbiased
 * because 256 is a multiple of 64.
 */
export function newVisitId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte & 63];
  return id;
}

/**
 * Who sent a beacon (`/api/visit` or `/api/events`): the two cookies' values
 * when well-formed, fresh ids otherwise. The device id is lower-cased so a
 * hand-edited cookie cannot split one browser into two devices.
 */
export function visitorIds(
  deviceCookie: string | null | undefined,
  visitCookie: string | null | undefined,
): { deviceId: string; visitId: string } {
  return {
    deviceId: isDeviceId(deviceCookie) ? deviceCookie.toLowerCase() : globalThis.crypto.randomUUID(),
    visitId: isVisitId(visitCookie) ? visitCookie : newVisitId(),
  };
}

export type VisitorCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  /** Seconds. */
  maxAge: number;
};

/**
 * Same attributes as `rm_order` (lib/orders/cookie.ts): HttpOnly — the page
 * never needs to read it, the server sets it on every beacon — Lax, Secure in
 * production only (local dev is plain http), root path.
 */
function visitorCookieOptions(maxAge: number): VisitorCookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge };
}

export function deviceCookieOptions(): VisitorCookieOptions {
  return visitorCookieOptions(DEVICE_MAX_AGE_SECONDS);
}

export function visitCookieOptions(): VisitorCookieOptions {
  return visitorCookieOptions(VISIT_IDLE_MS / 1000);
}

/* -------------------------------------------------------------------------- */
/* Device                                                                     */
/* -------------------------------------------------------------------------- */

export type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'other';

export const DEVICE_KINDS: readonly DeviceKind[] = ['mobile', 'tablet', 'desktop', 'other'];

/** The subset of Next's `userAgent(req)` this module reads (ua-parser-js field names). */
export type UserAgentLike = {
  os?: { name?: string };
  browser?: { name?: string };
  device?: { type?: string; vendor?: string };
};

function clip(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * ua-parser leaves `device.type` undefined for a desktop browser; a console,
 * a smart TV, a watch or an embedded screen all become `other`.
 */
function deviceKindOf(type: string | undefined): DeviceKind {
  if (!type) return 'desktop';
  if (type === 'mobile') return 'mobile';
  if (type === 'tablet') return 'tablet';
  return 'other';
}

/** « iPhone », « Samsung Android », « Windows »… — the name the operator would say out loud. */
function osPart(ua: UserAgentLike, kind: DeviceKind): string | null {
  const name = ua.os?.name?.trim();
  if (!name) return null;
  switch (name) {
    case 'iOS':
      return kind === 'tablet' ? 'iPad' : 'iPhone';
    case 'Mac OS':
    case 'macOS':
      return 'Mac';
    case 'Windows':
      return 'Windows';
    case 'Android': {
      // The maker is what tells two Android phones apart at a glance, and it
      // is only known for phones and tablets whose user-agent names a model.
      const vendor = clip(ua.device?.vendor, MAX_LABEL_PART_LENGTH);
      const handheld = kind === 'mobile' || kind === 'tablet';
      return handheld && vendor && vendor.toLowerCase() !== 'apple' ? `${vendor} Android` : 'Android';
    }
    case 'Linux':
      return 'Linux';
    case 'Chrome OS':
    case 'Chromium OS':
      return 'Chromebook';
    default:
      return clip(name, MAX_LABEL_PART_LENGTH);
  }
}

/**
 * ua-parser's browser names, folded onto what a person calls them: the
 * mobile or embedded flavour of a browser is still that browser. In-app
 * browsers (« Facebook », « Instagram ») keep their name on purpose — they
 * say where the visitor tapped the link.
 */
const BROWSER_NAMES: Record<string, string> = {
  'Mobile Safari': 'Safari',
  'Chrome WebView': 'Chrome',
  'Chrome Mobile': 'Chrome',
  'Chrome Headless': 'Chrome',
  'Samsung Browser': 'Samsung Internet',
  'Mobile Firefox': 'Firefox',
  'Firefox Mobile': 'Firefox',
  'Edge WebView': 'Edge',
};

function browserPart(ua: UserAgentLike): string | null {
  const name = ua.browser?.name?.trim();
  if (!name) return null;
  return BROWSER_NAMES[name] ?? clip(name, MAX_LABEL_PART_LENGTH);
}

/**
 * The kind of device and a short human label for it: « Android · Chrome »,
 * « iPhone · Safari », « Samsung Android · Chrome », « Windows · Edge »,
 * « Mac · Safari ». The label is `null` when neither the system nor the
 * browser is known.
 */
export function describeDevice(ua: UserAgentLike): { kind: DeviceKind; label: string | null } {
  const kind = deviceKindOf(ua.device?.type);
  const parts = [osPart(ua, kind), browserPart(ua)].filter((part): part is string => part !== null);
  return { kind, label: parts.length > 0 ? parts.join(' · ') : null };
}

/**
 * A client no real browser would be: ua-parser recognised neither a system
 * nor a browser (`curl`, `python-requests`, a hand-rolled script), or it is
 * headless Chrome. Next's `isBot` only knows crawlers that announce
 * themselves, so this is the second net.
 */
export function isAutomatedAgent(ua: UserAgentLike): boolean {
  const browser = ua.browser?.name?.trim() ?? '';
  const os = ua.os?.name?.trim() ?? '';
  if (!browser && !os) return true;
  return /headless|phantom/i.test(browser);
}

/* -------------------------------------------------------------------------- */
/* Page, referrer, campaign, place                                            */
/* -------------------------------------------------------------------------- */

/** Control characters and spaces: a real pathname arrives percent-encoded and holds neither. */
const CONTROL_OR_SPACE_RE = /[\u0000- \u007f]/;

function isUnder(path: string, prefix: string): boolean {
  const lower = path.toLowerCase();
  return lower === prefix || lower.startsWith(`${prefix}/`);
}

/**
 * The pathname a beacon reported, or `null` when it is not one worth
 * keeping: it must start with a single `/` (`//host` is a protocol-relative
 * URL, not a path), the `?…` and `#…` parts are dropped, it is cut at 200
 * characters, and the back-office and the API are never recorded — the
 * operator's own clicks are not visits.
 */
export function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cut = raw.search(/[?#]/);
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (CONTROL_OR_SPACE_RE.test(path)) return null;
  if (isUnder(path, '/admin') || isUnder(path, '/api')) return null;
  // One entry for every tracking page: « /fr/commande/MR-… » would otherwise
  // crowd the top pages with one line per order — and an order reference has
  // no business in a visit log.
  return path.replace(/\/commande\/[^/]+/, '/commande/*').slice(0, MAX_PATH_LENGTH);
}

/** Host prefixes that name the same site: `l.facebook.com` is Facebook's link shim, `m.` its mobile site. */
const HOST_PREFIXES = ['www.', 'm.', 'l.', 'lm.', 'mobile.'] as const;

function stripHostPrefixes(host: string): string {
  let current = host;
  for (let changed = true; changed; ) {
    changed = false;
    for (const prefix of HOST_PREFIXES) {
      const rest = current.slice(prefix.length);
      // Only while a real domain remains: `m.com` stays `m.com`.
      if (current.startsWith(prefix) && rest.includes('.')) {
        current = rest;
        changed = true;
      }
    }
  }
  return current;
}

/** The host name alone, lower-cased, without port or trailing dot; `''` when unusable. */
function hostnameOf(hostOrHostPort: string): string {
  try {
    return new URL(`http://${hostOrHostPort.trim()}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function withoutWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/**
 * Android apps that open a link in the system browser send
 * `android-app://<package>/` as the referrer. The packages that matter here
 * get their everyday name; any other becomes its first meaningful segment
 * (`com.example.app` → `example`).
 */
const ANDROID_APPS: Record<string, string> = {
  'com.whatsapp': 'whatsapp',
  'com.whatsapp.w4b': 'whatsapp',
  'com.facebook.katana': 'facebook',
  'com.facebook.lite': 'facebook',
  'com.facebook.orca': 'messenger',
  'com.facebook.mlite': 'messenger',
  'com.instagram.android': 'instagram',
  'com.instagram.lite': 'instagram',
  'org.telegram.messenger': 'telegram',
  'com.google.android.gm': 'gmail',
  'com.google.android.googlequicksearchbox': 'google',
  'com.zhiliaoapp.musically': 'tiktok',
  'com.ss.android.ugc.trill': 'tiktok',
  'com.twitter.android': 'twitter',
};

const PACKAGE_TLDS = new Set(['com', 'org', 'net', 'io', 'app', 'co']);

function androidAppName(pkg: string): string | null {
  const name = pkg.toLowerCase();
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(name)) return null;
  const known = ANDROID_APPS[name];
  if (known) return known;
  const segments = name.split('.');
  const meaningful = segments.length > 1 && PACKAGE_TLDS.has(segments[0]) ? segments[1] : segments[0];
  return meaningful.slice(0, MAX_REFERRER_HOST_LENGTH) || null;
}

/**
 * Where the visitor came from, as a host name: `https://l.facebook.com/l.php?u=…`
 * → `facebook.com`, `android-app://com.whatsapp/` → `whatsapp`. `null` for
 * a direct visit (no referrer), anything that is not an http(s) page, and a
 * page of this very site (`ownHost`, with or without `www.`) — moving from one
 * of our pages to another is not a source.
 */
export function referrerHost(raw: unknown, ownHost: string): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === 'android-app:') return androidAppName(url.hostname);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  const own = hostnameOf(ownHost);
  if (own && withoutWww(host) === withoutWww(own)) return null;
  return stripHostPrefixes(host).slice(0, MAX_REFERRER_HOST_LENGTH);
}

/**
 * The `utm_source` tag, trimmed and lower-cased (`Facebook` and `facebook` are
 * one campaign), or `null` unless it is 1 to 60 characters of `[a-z0-9._-]` —
 * a tag is a word we chose, never free text.
 */
export function cleanUtm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > MAX_UTM_LENGTH) return null;
  return /^[a-z0-9._-]+$/.test(value) ? value : null;
}

/**
 * `x-vercel-ip-city` arrives URI-encoded (`P%C3%A9tion-Ville`). Decoded,
 * trimmed and cut at 80 characters; `null` when absent, blank or not valid
 * percent-encoding.
 */
export function decodeCity(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // A city name never holds control characters; a decoded `%0A` would.
  const clean = decoded.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean ? clean.slice(0, MAX_CITY_LENGTH) : null;
}

/** `x-vercel-ip-country`: two capital letters (ISO 3166-1 alpha-2), else `null`. */
export function cleanCountry(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^[A-Z]{2}$/.test(value) ? value : null;
}

/** The site's two locales; anything else is `null`. */
export function cleanLocale(raw: unknown): 'fr' | 'ht' | null {
  return raw === 'fr' || raw === 'ht' ? raw : null;
}

/* -------------------------------------------------------------------------- */
/* Screen, network, language                                                  */
/* -------------------------------------------------------------------------- */

/** `navigator.connection.effectiveType` — what the phone's network feels like, not what it is called. */
export type NetType = 'slow-2g' | '2g' | '3g' | '4g';

export const NET_TYPES: readonly NetType[] = ['slow-2g', '2g', '3g', '4g'];

const MAX_LANG_LENGTH = 20;

/**
 * The screen as `WIDTHxHEIGHT` in CSS pixels (« 390x844 »): two to five
 * digits each side, trimmed; anything else is `null`. It tells a small phone
 * from a large one, which is all the operator needs from it.
 */
export function cleanScreen(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^\d{2,5}x\d{2,5}$/.test(value) ? value : null;
}

/** One of the four `effectiveType` values, exactly; anything else (Safari sends none) is `null`. */
export function cleanNet(raw: unknown): NetType | null {
  return (NET_TYPES as readonly unknown[]).includes(raw) ? (raw as NetType) : null;
}

/**
 * `navigator.language` as a BCP 47 tag of the ordinary shape — a two- or
 * three-letter language and up to two subtags (« fr », « fr-FR », « ht-HT »,
 * « zh-Hant-TW ») — trimmed, kept in the case it came in, at most 20
 * characters; anything else is `null`.
 */
export function cleanLang(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LANG_LENGTH) return null;
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(value) ? value : null;
}

/* -------------------------------------------------------------------------- */
/* The beacon                                                                 */
/* -------------------------------------------------------------------------- */

/** What a beacon body may carry, not yet trusted. */
export type VisitPayload = {
  path: unknown;
  referrer: unknown;
  locale: unknown;
  utm: unknown;
  viewId: unknown;
  screen: unknown;
  net: unknown;
  lang: unknown;
};

/**
 * The beacon's JSON body, read from raw text so a `text/plain` body (what
 * `navigator.sendBeacon` sends) parses as well as `application/json`.
 * `null` for anything that is not a JSON object of a sane size.
 */
export function parseVisitBody(text: string): VisitPayload | null {
  if (typeof text !== 'string' || !text || text.length > MAX_VISIT_BODY_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return {
    path: record.path,
    referrer: record.referrer,
    locale: record.locale,
    utm: record.utm,
    viewId: record.viewId,
    screen: record.screen,
    net: record.net,
    lang: record.lang,
  };
}

/** Every column of a `page_views` row except the two ids and the timestamp. */
export type PageViewFields = {
  path: string;
  locale: 'fr' | 'ht' | null;
  referrerHost: string | null;
  utmSource: string | null;
  deviceKind: DeviceKind;
  deviceLabel: string | null;
  country: string | null;
  city: string | null;
  viewId: string | null;
  screen: string | null;
  net: NetType | null;
  lang: string | null;
};

/**
 * One beacon, reduced to what `page_views` keeps; `null` when the body is not
 * a beacon or its path is not one we record. `country` and `city` are the raw
 * Vercel headers; `ownHost` is `req.nextUrl.host`. The four optional fields
 * (`viewId`, `screen`, `net`, `lang`) are each `null` when absent or not of
 * the expected shape — a bad one never costs the page view itself.
 */
export function pageViewFields(input: {
  body: string;
  ua: UserAgentLike;
  ownHost: string;
  country: string | null;
  city: string | null;
}): PageViewFields | null {
  const payload = parseVisitBody(input.body);
  if (!payload) return null;
  const path = sanitizePath(payload.path);
  if (!path) return null;
  const device = describeDevice(input.ua);
  return {
    path,
    locale: cleanLocale(payload.locale),
    referrerHost: referrerHost(payload.referrer, input.ownHost),
    utmSource: cleanUtm(payload.utm),
    deviceKind: device.kind,
    deviceLabel: device.label,
    country: cleanCountry(input.country),
    city: decodeCity(input.city),
    viewId: isViewId(payload.viewId) ? payload.viewId : null,
    screen: cleanScreen(payload.screen),
    net: cleanNet(payload.net),
    lang: cleanLang(payload.lang),
  };
}
