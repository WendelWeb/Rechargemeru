import { afterEach, describe, expect, it, vi } from 'vitest';
import { userAgentFromString } from 'next/server';
import {
  DEVICE_COOKIE,
  MAX_VISIT_BODY_BYTES,
  VISIT_COOKIE,
  VISIT_IDLE_MS,
  NET_TYPES,
  cleanCountry,
  cleanLang,
  cleanLocale,
  cleanNet,
  cleanScreen,
  cleanUtm,
  decodeCity,
  describeDevice,
  deviceCookieOptions,
  isAutomatedAgent,
  isDeviceId,
  isViewId,
  isVisitId,
  newVisitId,
  pageViewFields,
  parseVisitBody,
  referrerHost,
  sanitizePath,
  visitCookieOptions,
  visitorIds,
} from './visitor';

/** Real user-agents, parsed by the very ua-parser Next ships — the labels are checked end to end. */
const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  samsungTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  windowsOpera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 12; TECNO KG5k Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/468.0.0.55.105;]',
  instagramIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 614436781)',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 11; Infinix X6812 Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  smartTv:
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  curl: 'curl/8.4.0',
  pythonRequests: 'python-requests/2.31.0',
} as const;

const describeUa = (ua: string) => describeDevice(userAgentFromString(ua));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cookies', () => {
  it('names the two cookies and the idle window', () => {
    expect(DEVICE_COOKIE).toBe('rm_device');
    expect(VISIT_COOKIE).toBe('rm_visit');
    expect(VISIT_IDLE_MS).toBe(30 * 60_000);
  });

  it('keeps the device cookie for 400 days and the visit cookie for 30 minutes', () => {
    expect(deviceCookieOptions()).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 34_560_000 });
    expect(visitCookieOptions()).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 1_800 });
  });

  it('marks both cookies Secure in production only', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(deviceCookieOptions().secure).toBe(true);
    expect(visitCookieOptions().secure).toBe(true);
  });
});

describe('isDeviceId', () => {
  it('accepts a UUID in either case', () => {
    expect(isDeviceId('3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b')).toBe(true);
    expect(isDeviceId('3F2B8C1E-9A4D-4E7F-8B21-0C5D6E7F8A9B')).toBe(true);
    expect(isDeviceId(crypto.randomUUID())).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isDeviceId(undefined)).toBe(false);
    expect(isDeviceId(null)).toBe(false);
    expect(isDeviceId('')).toBe(false);
    expect(isDeviceId('3f2b8c1e9a4d4e7f8b210c5d6e7f8a9b')).toBe(false);
    expect(isDeviceId('3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9')).toBe(false);
    expect(isDeviceId('3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9bz')).toBe(false);
    expect(isDeviceId('zzzzzzzz-9a4d-4e7f-8b21-0c5d6e7f8a9b')).toBe(false);
    expect(isDeviceId(' 3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b')).toBe(false);
    expect(isDeviceId("x' or 1=1 --")).toBe(false);
  });
});

describe('visit ids', () => {
  it('mints 16 URL-safe characters, different every time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newVisitId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(isVisitId(id)).toBe(true);
    }
  });

  it('accepts 8 to 40 URL-safe characters only', () => {
    expect(isVisitId('abcdEFGH')).toBe(true);
    expect(isVisitId('a'.repeat(40))).toBe(true);
    expect(isVisitId(crypto.randomUUID())).toBe(true);
    expect(isVisitId('abcdEFG')).toBe(false);
    expect(isVisitId('a'.repeat(41))).toBe(false);
    expect(isVisitId('abcd efgh')).toBe(false);
    expect(isVisitId('abcd;efgh')).toBe(false);
    expect(isVisitId(undefined)).toBe(false);
    expect(isVisitId(null)).toBe(false);
  });
});

describe('isViewId', () => {
  it('accepts what the browser mints: 8 to 40 URL-safe characters', () => {
    expect(isViewId('3f2b8c1e9a4d4e7f8b210c5d')).toBe(true);
    expect(isViewId('abcdEFGH')).toBe(true);
    expect(isViewId('a_b-c'.repeat(8))).toBe(true);
  });

  it('refuses anything else, whatever its type', () => {
    expect(isViewId('abcdEFG')).toBe(false);
    expect(isViewId('a'.repeat(41))).toBe(false);
    expect(isViewId('abcd efgh')).toBe(false);
    expect(isViewId('abcd/efgh')).toBe(false);
    expect(isViewId(12345678)).toBe(false);
    expect(isViewId(null)).toBe(false);
    expect(isViewId(undefined)).toBe(false);
    expect(isViewId({ id: 'abcdEFGH' })).toBe(false);
  });
});

describe('visitorIds', () => {
  const DEVICE = '3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b';

  it('keeps well-formed cookies, lower-casing the device', () => {
    expect(visitorIds(DEVICE, 'abcdEFGH1234')).toEqual({ deviceId: DEVICE, visitId: 'abcdEFGH1234' });
    expect(visitorIds(DEVICE.toUpperCase(), 'abcdEFGH1234').deviceId).toBe(DEVICE);
  });

  it('mints fresh ids for missing or malformed cookies', () => {
    const minted = visitorIds(undefined, 'bad id');
    expect(isDeviceId(minted.deviceId)).toBe(true);
    expect(minted.visitId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const other = visitorIds('not-a-uuid', null);
    expect(other.deviceId).not.toBe(minted.deviceId);
    expect(isVisitId(other.visitId)).toBe(true);
  });
});

describe('describeDevice', () => {
  it('labels the phones customers actually use', () => {
    expect(describeUa(UA.androidChrome)).toEqual({ kind: 'mobile', label: 'Android · Chrome' });
    expect(describeUa(UA.samsungChrome)).toEqual({ kind: 'mobile', label: 'Samsung Android · Chrome' });
    expect(describeUa(UA.samsungInternet)).toEqual({ kind: 'mobile', label: 'Samsung Android · Samsung Internet' });
    expect(describeUa(UA.iphone)).toEqual({ kind: 'mobile', label: 'iPhone · Safari' });
    expect(describeUa(UA.androidWebView)).toEqual({ kind: 'mobile', label: 'Android · Chrome' });
  });

  it('keeps the in-app browser name: it says where the link was tapped', () => {
    expect(describeUa(UA.facebookAndroid)).toEqual({ kind: 'mobile', label: 'Android · Facebook' });
    expect(describeUa(UA.instagramIphone)).toEqual({ kind: 'mobile', label: 'iPhone · Instagram' });
  });

  it('labels tablets and computers', () => {
    expect(describeUa(UA.ipad)).toEqual({ kind: 'tablet', label: 'iPad · Safari' });
    expect(describeUa(UA.samsungTablet)).toEqual({ kind: 'tablet', label: 'Samsung Android · Chrome' });
    expect(describeUa(UA.macSafari)).toEqual({ kind: 'desktop', label: 'Mac · Safari' });
    expect(describeUa(UA.windowsEdge)).toEqual({ kind: 'desktop', label: 'Windows · Edge' });
    expect(describeUa(UA.windowsFirefox)).toEqual({ kind: 'desktop', label: 'Windows · Firefox' });
    expect(describeUa(UA.windowsOpera)).toEqual({ kind: 'desktop', label: 'Windows · Opera' });
    expect(describeUa(UA.chromebook)).toEqual({ kind: 'desktop', label: 'Chromebook · Chrome' });
    expect(describeUa(UA.linuxFirefox)).toEqual({ kind: 'desktop', label: 'Linux · Firefox' });
  });

  it('files consoles, TVs and watches under « other »', () => {
    expect(describeUa(UA.smartTv).kind).toBe('other');
    expect(describeDevice({ device: { type: 'console' } }).kind).toBe('other');
    expect(describeDevice({ device: { type: 'wearable' } }).kind).toBe('other');
    expect(describeDevice({ device: { type: 'embedded' } }).kind).toBe('other');
  });

  it('works from bare fields, as ua-parser names them', () => {
    expect(describeDevice({ os: { name: 'macOS' }, browser: { name: 'Chrome' } })).toEqual({
      kind: 'desktop',
      label: 'Mac · Chrome',
    });
    expect(describeDevice({ os: { name: 'Chrome OS' } }).label).toBe('Chromebook');
    expect(describeDevice({ browser: { name: 'Chrome Mobile' } }).label).toBe('Chrome');
    expect(describeDevice({ os: { name: 'iOS' }, browser: { name: 'Mobile Safari' }, device: { type: 'tablet' } }).label).toBe(
      'iPad · Safari',
    );
  });

  it('prefixes the maker only for an Android phone or tablet, and never Apple', () => {
    expect(describeDevice({ os: { name: 'Android' }, device: { type: 'mobile', vendor: 'Huawei' } }).label).toBe('Huawei Android');
    expect(describeDevice({ os: { name: 'Android' }, device: { vendor: 'Samsung' } }).label).toBe('Android');
    expect(describeDevice({ os: { name: 'Android' }, device: { type: 'mobile', vendor: 'Apple' } }).label).toBe('Android');
    expect(describeDevice({ os: { name: 'iOS' }, device: { type: 'mobile', vendor: 'Apple' } }).label).toBe('iPhone');
  });

  it('keeps an unknown system or browser name as it came, trimmed', () => {
    expect(describeDevice({ os: { name: 'KaiOS' }, browser: { name: 'Opera Mini' } }).label).toBe('KaiOS · Opera Mini');
    expect(describeDevice({ os: { name: `  ${'x'.repeat(80)}  ` } }).label).toBe('x'.repeat(30));
  });

  it('answers a null label when nothing is known', () => {
    expect(describeDevice({})).toEqual({ kind: 'desktop', label: null });
    expect(describeDevice({ os: { name: '  ' }, browser: {} })).toEqual({ kind: 'desktop', label: null });
    expect(describeUa(UA.curl)).toEqual({ kind: 'desktop', label: null });
  });
});

describe('isAutomatedAgent', () => {
  it('flags scripts and headless browsers', () => {
    expect(isAutomatedAgent(userAgentFromString(UA.curl))).toBe(true);
    expect(isAutomatedAgent(userAgentFromString(UA.pythonRequests))).toBe(true);
    expect(isAutomatedAgent(userAgentFromString(UA.headless))).toBe(true);
    expect(isAutomatedAgent({})).toBe(true);
  });

  it('lets real browsers through, in-app ones included', () => {
    for (const ua of [UA.androidChrome, UA.iphone, UA.facebookAndroid, UA.windowsEdge, UA.macSafari]) {
      expect(isAutomatedAgent(userAgentFromString(ua))).toBe(false);
    }
  });
});

describe('sanitizePath', () => {
  it('regroupe les pages de suivi sans garder la référence', () => {
    expect(sanitizePath('/fr/commande/MR-EKMQDW33')).toBe('/fr/commande/*');
    expect(sanitizePath('/ht/commande/MR-EKMQDW33?x=1')).toBe('/ht/commande/*');
  });

  it('keeps a plain pathname', () => {
    expect(sanitizePath('/')).toBe('/');
    expect(sanitizePath('/fr')).toBe('/fr');
    expect(sanitizePath('/ht/suivi')).toBe('/ht/suivi');
    expect(sanitizePath('/fr/faq')).toBe('/fr/faq');
  });

  it('drops the query string and the fragment', () => {
    expect(sanitizePath('/fr?utm_source=facebook&phone=37001234')).toBe('/fr');
    expect(sanitizePath('/fr/faq#frais')).toBe('/fr/faq');
    expect(sanitizePath('/fr/faq#a?b')).toBe('/fr/faq');
    expect(sanitizePath('/?x=1')).toBe('/');
  });

  it('cuts at 200 characters', () => {
    const long = `/fr/${'a'.repeat(400)}`;
    expect(sanitizePath(long)).toHaveLength(200);
    expect(sanitizePath(long)?.startsWith('/fr/aaa')).toBe(true);
  });

  it('refuses what is not a path', () => {
    expect(sanitizePath(undefined)).toBeNull();
    expect(sanitizePath(null)).toBeNull();
    expect(sanitizePath(42)).toBeNull();
    expect(sanitizePath({ path: '/fr' })).toBeNull();
    expect(sanitizePath('')).toBeNull();
    expect(sanitizePath('fr')).toBeNull();
    expect(sanitizePath('https://evil.example/fr')).toBeNull();
    expect(sanitizePath('//evil.example/fr')).toBeNull();
    expect(sanitizePath('?x=1')).toBeNull();
    expect(sanitizePath('/fr/a b')).toBeNull();
    expect(sanitizePath('/fr/\u0000')).toBeNull();
    expect(sanitizePath('/fr\n/faq')).toBeNull();
  });

  it('never records the back-office or the API', () => {
    expect(sanitizePath('/admin')).toBeNull();
    expect(sanitizePath('/admin/commandes/123')).toBeNull();
    expect(sanitizePath('/admin?next=/admin/sante')).toBeNull();
    expect(sanitizePath('/Admin/login')).toBeNull();
    expect(sanitizePath('/api')).toBeNull();
    expect(sanitizePath('/api/visit')).toBeNull();
    expect(sanitizePath('/API/orders')).toBeNull();
  });

  it('only matches whole segments', () => {
    expect(sanitizePath('/administration')).toBe('/administration');
    expect(sanitizePath('/apiculture')).toBe('/apiculture');
    expect(sanitizePath('/fr/admin')).toBe('/fr/admin');
  });
});

describe('referrerHost', () => {
  const OWN = 'rechargemeru.com';

  it('keeps an outside site, lower-cased', () => {
    expect(referrerHost('https://www.Google.com/', OWN)).toBe('google.com');
    expect(referrerHost('https://google.ht/search?q=meru', OWN)).toBe('google.ht');
    expect(referrerHost('https://t.co/abc', OWN)).toBe('t.co');
    expect(referrerHost('http://example.org:8080/page', OWN)).toBe('example.org');
  });

  it('folds link shims and mobile sites onto the site itself', () => {
    expect(referrerHost('https://l.facebook.com/l.php?u=https%3A%2F%2Frechargemeru.com', OWN)).toBe('facebook.com');
    expect(referrerHost('https://lm.facebook.com/l.php?u=x', OWN)).toBe('facebook.com');
    expect(referrerHost('https://m.facebook.com/', OWN)).toBe('facebook.com');
    expect(referrerHost('https://mobile.twitter.com/', OWN)).toBe('twitter.com');
    expect(referrerHost('https://www.m.example.com/', OWN)).toBe('example.com');
    expect(referrerHost('https://l.instagram.com/?u=x', OWN)).toBe('instagram.com');
  });

  it('never strips a host down to a bare suffix', () => {
    expect(referrerHost('https://m.com/', OWN)).toBe('m.com');
    expect(referrerHost('https://www.co/', OWN)).toBe('www.co');
  });

  it('names Android apps', () => {
    expect(referrerHost('android-app://com.whatsapp', OWN)).toBe('whatsapp');
    expect(referrerHost('android-app://com.whatsapp/', OWN)).toBe('whatsapp');
    expect(referrerHost('android-app://com.facebook.katana/', OWN)).toBe('facebook');
    expect(referrerHost('android-app://com.facebook.orca/', OWN)).toBe('messenger');
    expect(referrerHost('android-app://com.google.android.gm/', OWN)).toBe('gmail');
    expect(referrerHost('android-app://org.telegram.messenger/', OWN)).toBe('telegram');
    expect(referrerHost('android-app://com.example.app/', OWN)).toBe('example');
    expect(referrerHost('android-app://', OWN)).toBeNull();
  });

  it('answers null for this very site, with or without www', () => {
    expect(referrerHost('https://rechargemeru.com/fr', OWN)).toBeNull();
    expect(referrerHost('https://www.rechargemeru.com/fr', OWN)).toBeNull();
    expect(referrerHost('https://rechargemeru.com/fr', 'www.rechargemeru.com')).toBeNull();
    expect(referrerHost('https://RechargeMeru.com./fr', OWN)).toBeNull();
    expect(referrerHost('http://localhost:3000/fr', 'localhost:3000')).toBeNull();
  });

  it('answers null for a direct visit or anything that is not a web page', () => {
    expect(referrerHost('', OWN)).toBeNull();
    expect(referrerHost('   ', OWN)).toBeNull();
    expect(referrerHost(undefined, OWN)).toBeNull();
    expect(referrerHost(42, OWN)).toBeNull();
    expect(referrerHost('not a url', OWN)).toBeNull();
    expect(referrerHost('/fr/faq', OWN)).toBeNull();
    expect(referrerHost('javascript:alert(1)', OWN)).toBeNull();
    expect(referrerHost('file:///etc/passwd', OWN)).toBeNull();
    expect(referrerHost('ftp://example.org/', OWN)).toBeNull();
    expect(referrerHost('data:text/html,hi', OWN)).toBeNull();
  });

  it('cuts at 100 characters', () => {
    const host = `${'a'.repeat(60)}.${'b'.repeat(60)}.com`;
    expect(referrerHost(`https://${host}/`, OWN)).toHaveLength(100);
  });
});

describe('cleanUtm', () => {
  it('keeps a tag, trimmed and lower-cased', () => {
    expect(cleanUtm('facebook')).toBe('facebook');
    expect(cleanUtm('  Facebook ')).toBe('facebook');
    expect(cleanUtm('wa_status-2026.09')).toBe('wa_status-2026.09');
    expect(cleanUtm('x'.repeat(60))).toBe('x'.repeat(60));
  });

  it('refuses free text, overlong tags and non-strings', () => {
    expect(cleanUtm('')).toBeNull();
    expect(cleanUtm('   ')).toBeNull();
    expect(cleanUtm('face book')).toBeNull();
    expect(cleanUtm('<script>')).toBeNull();
    expect(cleanUtm('fèt')).toBeNull();
    expect(cleanUtm('x'.repeat(61))).toBeNull();
    expect(cleanUtm(undefined)).toBeNull();
    expect(cleanUtm(null)).toBeNull();
    expect(cleanUtm(7)).toBeNull();
  });
});

describe('decodeCity', () => {
  it('decodes Vercel’s URI-encoded city', () => {
    expect(decodeCity('Port-au-Prince')).toBe('Port-au-Prince');
    expect(decodeCity('P%C3%A9tion-Ville')).toBe('Pétion-Ville');
    expect(decodeCity('Cap-Ha%C3%AFtien')).toBe('Cap-Haïtien');
    expect(decodeCity('New%20York')).toBe('New York');
  });

  it('answers null for nothing, blanks and broken encoding — without throwing', () => {
    expect(decodeCity(null)).toBeNull();
    expect(decodeCity('')).toBeNull();
    expect(decodeCity('%20%20')).toBeNull();
    expect(decodeCity('%E0%A4%A')).toBeNull();
    expect(decodeCity('100%')).toBeNull();
  });

  it('drops control characters and cuts at 80 characters', () => {
    expect(decodeCity('Jacmel%0A')).toBe('Jacmel');
    expect(decodeCity('a'.repeat(200))).toHaveLength(80);
  });
});

describe('cleanCountry and cleanLocale', () => {
  it('keeps a two-letter country code only', () => {
    expect(cleanCountry('HT')).toBe('HT');
    expect(cleanCountry(' US ')).toBe('US');
    expect(cleanCountry('ht')).toBeNull();
    expect(cleanCountry('HTI')).toBeNull();
    expect(cleanCountry('')).toBeNull();
    expect(cleanCountry(null)).toBeNull();
  });

  it('keeps the two site locales only', () => {
    expect(cleanLocale('fr')).toBe('fr');
    expect(cleanLocale('ht')).toBe('ht');
    expect(cleanLocale('en')).toBeNull();
    expect(cleanLocale('FR')).toBeNull();
    expect(cleanLocale(undefined)).toBeNull();
  });
});

describe('cleanScreen, cleanNet and cleanLang', () => {
  it('keeps a screen size of the usual shape', () => {
    expect(cleanScreen('390x844')).toBe('390x844');
    expect(cleanScreen(' 1920x1080 ')).toBe('1920x1080');
    expect(cleanScreen('10x10')).toBe('10x10');
    expect(cleanScreen('99999x99999')).toBe('99999x99999');
  });

  it('refuses any other screen', () => {
    for (const raw of ['390X844', '390 x 844', '390x', 'x844', '1x844', '390x844x2', '100000x1', '390×844', '', null, 390, undefined]) {
      expect(cleanScreen(raw)).toBeNull();
    }
  });

  it('keeps the four network classes, exactly', () => {
    expect(NET_TYPES).toEqual(['slow-2g', '2g', '3g', '4g']);
    for (const net of NET_TYPES) expect(cleanNet(net)).toBe(net);
    for (const raw of ['5g', '4G', ' 4g', 'wifi', '', null, 4, undefined]) {
      expect(cleanNet(raw)).toBeNull();
    }
  });

  it('keeps an ordinary language tag in the case it came', () => {
    expect(cleanLang('fr')).toBe('fr');
    expect(cleanLang('fr-FR')).toBe('fr-FR');
    expect(cleanLang('ht-HT')).toBe('ht-HT');
    expect(cleanLang(' en-US ')).toBe('en-US');
    expect(cleanLang('zh-Hant-TW')).toBe('zh-Hant-TW');
    expect(cleanLang('es-419')).toBe('es-419');
    expect(cleanLang('haw')).toBe('haw');
  });

  it('refuses anything else, or longer than 20 characters', () => {
    for (const raw of [
      'f',
      'fren',
      'fr_FR',
      'fr-F',
      'fr-FR-x-y',
      'fr-FR-Paris-xx',
      'abc-abcdefgh-abcdefgh',
      '<script>',
      '',
      null,
      7,
      undefined,
    ]) {
      expect(cleanLang(raw)).toBeNull();
    }
  });
});

describe('parseVisitBody', () => {
  it('reads the eight fields of a beacon', () => {
    expect(
      parseVisitBody(
        '{"path":"/fr","referrer":"","locale":"fr","utm":"facebook","viewId":"abcdEFGH","screen":"390x844","net":"4g","lang":"fr-FR","extra":1}',
      ),
    ).toEqual({
      path: '/fr',
      referrer: '',
      locale: 'fr',
      utm: 'facebook',
      viewId: 'abcdEFGH',
      screen: '390x844',
      net: '4g',
      lang: 'fr-FR',
    });
  });

  it('leaves absent optional fields undefined', () => {
    expect(parseVisitBody('{"path":"/fr"}')).toEqual({
      path: '/fr',
      referrer: undefined,
      locale: undefined,
      utm: undefined,
      viewId: undefined,
      screen: undefined,
      net: undefined,
      lang: undefined,
    });
  });

  it('answers null for anything that is not a JSON object of a sane size', () => {
    expect(parseVisitBody('')).toBeNull();
    expect(parseVisitBody('not json')).toBeNull();
    expect(parseVisitBody('null')).toBeNull();
    expect(parseVisitBody('"/fr"')).toBeNull();
    expect(parseVisitBody('[1,2]')).toBeNull();
    expect(parseVisitBody(`{"path":"/fr","pad":"${'x'.repeat(MAX_VISIT_BODY_BYTES)}"}`)).toBeNull();
  });
});

describe('pageViewFields', () => {
  const base = {
    ua: userAgentFromString(UA.samsungChrome),
    ownHost: 'rechargemeru.com',
    country: 'HT',
    city: 'P%C3%A9tion-Ville',
  };

  it('reduces a beacon to the columns page_views keeps', () => {
    const body = JSON.stringify({
      path: '/fr?phone=37001234',
      referrer: 'https://l.facebook.com/l.php?u=x',
      locale: 'fr',
      utm: 'Facebook',
      viewId: '3f2b8c1e9a4d4e7f8b210c5d',
      screen: '390x844',
      net: '3g',
      lang: 'fr-FR',
    });
    expect(pageViewFields({ ...base, body })).toEqual({
      path: '/fr',
      locale: 'fr',
      referrerHost: 'facebook.com',
      utmSource: 'facebook',
      deviceKind: 'mobile',
      deviceLabel: 'Samsung Android · Chrome',
      country: 'HT',
      city: 'Pétion-Ville',
      viewId: '3f2b8c1e9a4d4e7f8b210c5d',
      screen: '390x844',
      net: '3g',
      lang: 'fr-FR',
    });
  });

  it('stores a malformed optional field as null and still keeps the view', () => {
    const body = JSON.stringify({ path: '/fr', viewId: 'x y', screen: '390 x 844', net: '5g', lang: 'français' });
    expect(pageViewFields({ ...base, body })).toMatchObject({
      path: '/fr',
      viewId: null,
      screen: null,
      net: null,
      lang: null,
    });
  });

  it('tolerates missing optional fields and odd headers', () => {
    expect(pageViewFields({ ...base, body: '{"path":"/ht"}', country: 'zz', city: null })).toEqual({
      path: '/ht',
      locale: null,
      referrerHost: null,
      utmSource: null,
      deviceKind: 'mobile',
      deviceLabel: 'Samsung Android · Chrome',
      country: null,
      city: null,
      viewId: null,
      screen: null,
      net: null,
      lang: null,
    });
  });

  it('answers null for a body that is not a beacon or a path we do not record', () => {
    expect(pageViewFields({ ...base, body: 'garbage' })).toBeNull();
    expect(pageViewFields({ ...base, body: '{}' })).toBeNull();
    expect(pageViewFields({ ...base, body: '{"path":"/admin/commandes"}' })).toBeNull();
    expect(pageViewFields({ ...base, body: '{"path":"https://evil.example"}' })).toBeNull();
  });
});
