import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickWhatsAppProvider, sendWhatsApp, whatsappConfigured, whatsappLabel, type WhatsAppMessage } from './whatsapp';
import { metaTemplateName } from './whatsapp/meta';
import { twilioConfigured, twilioSandbox, twilioSenderValid } from './whatsapp/twilio';

const saved = { ...process.env };
const WHATSAPP_ENV = [
  'WHATSAPP_PROVIDER',
  'WHATSAPP_META_TOKEN',
  'WHATSAPP_META_PHONE_NUMBER_ID',
  'WHATSAPP_META_TEMPLATES',
  'WHATSAPP_META_TEMPLATE_LANG',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TWILIO_SANDBOX',
];

beforeEach(() => {
  for (const name of WHATSAPP_ENV) delete process.env[name];
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const message = (overrides: Partial<WhatsAppMessage> = {}): WhatsAppMessage => ({
  to: '+50937001234',
  template: 'paid',
  locale: 'fr',
  params: ['Jean', '2 985 HTG'],
  text: 'Bonjour Jean, paiement reçu.',
  audience: 'customer',
  ...overrides,
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setTwilio(sandbox: boolean): void {
  process.env.WHATSAPP_PROVIDER = 'twilio';
  process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
  process.env.TWILIO_AUTH_TOKEN = 'secret-token';
  process.env.TWILIO_WHATSAPP_FROM = sandbox ? '+14155238886' : '+15005550006';
}

function setMeta(): void {
  process.env.WHATSAPP_PROVIDER = 'meta';
  process.env.WHATSAPP_META_TOKEN = 'EAAG-secret';
  process.env.WHATSAPP_META_PHONE_NUMBER_ID = '123456789';
}

describe('pickWhatsAppProvider', () => {
  it('honours or refuses an explicit choice, never redirects', () => {
    expect(pickWhatsAppProvider('meta', { meta: true, twilio: true })).toBe('meta');
    expect(pickWhatsAppProvider('twilio', { meta: true, twilio: true })).toBe('twilio');
    expect(pickWhatsAppProvider('meta', { meta: false, twilio: true })).toBeNull();
    expect(pickWhatsAppProvider(' Twilio ', { meta: false, twilio: true })).toBe('twilio');
  });
  it('prefers Meta over Twilio when nothing is requested', () => {
    expect(pickWhatsAppProvider(undefined, { meta: true, twilio: true })).toBe('meta');
    expect(pickWhatsAppProvider('', { meta: false, twilio: true })).toBe('twilio');
    expect(pickWhatsAppProvider(undefined, { meta: false, twilio: false })).toBeNull();
  });
  it('refuses an unknown provider name', () => {
    expect(pickWhatsAppProvider('sms', { meta: true, twilio: true })).toBeNull();
  });
});

describe('metaTemplateName', () => {
  it('reads the JSON mapping and falls back to the fr entry', () => {
    process.env.WHATSAPP_META_TEMPLATES = JSON.stringify({
      paid: { fr: 'meru_paid_fr', ht: 'meru_paid_ht' },
      created: { fr: 'meru_created_fr' },
    });
    expect(metaTemplateName('paid', 'ht')).toBe('meru_paid_ht');
    expect(metaTemplateName('paid', 'fr')).toBe('meru_paid_fr');
    expect(metaTemplateName('created', 'ht')).toBe('meru_created_fr');
    expect(metaTemplateName('fulfilled', 'fr')).toBeNull();
  });
  it('returns null without a mapping or with invalid JSON', () => {
    expect(metaTemplateName('paid', 'fr')).toBeNull();
    process.env.WHATSAPP_META_TEMPLATES = '{not json';
    expect(metaTemplateName('paid', 'fr')).toBeNull();
    process.env.WHATSAPP_META_TEMPLATES = '"just a string"';
    expect(metaTemplateName('paid', 'fr')).toBeNull();
  });
});

describe('configuration helpers', () => {
  it('reports unconfigured by default', () => {
    expect(whatsappConfigured()).toBe(false);
    expect(whatsappLabel()).toContain('aucun');
  });
  it('detects the Twilio sandbox by flag or by the sandbox number', () => {
    setTwilio(true);
    expect(twilioSandbox()).toBe(true);
    setTwilio(false);
    expect(twilioSandbox()).toBe(false);
    process.env.TWILIO_SANDBOX = 'true';
    expect(twilioSandbox()).toBe(true);
    expect(whatsappLabel()).toContain('Twilio');
  });

  it('accepts the sandbox flag however the operator wrote it', () => {
    setTwilio(false);
    for (const value of ['true', 'TRUE', ' True ', '1', 'yes']) {
      process.env.TWILIO_SANDBOX = value;
      expect(twilioSandbox(), value).toBe(true);
    }
    for (const value of ['false', 'FALSE', '0', 'no', '']) {
      process.env.TWILIO_SANDBOX = value;
      expect(twilioSandbox(), value).toBe(false);
    }
  });

  it('reads the sender through a console copy-paste and reports a typo', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'secret-token';
    // The Twilio console shows the sandbox number spaced out, with the prefix.
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+1 (415) 523-8886';
    expect(twilioConfigured()).toBe(true);
    expect(twilioSenderValid()).toBe(true);
    expect(twilioSandbox()).toBe(true);

    process.env.TWILIO_WHATSAPP_FROM = '509 3700 1234';
    expect(twilioConfigured()).toBe(true);
    // Configured but unusable: /admin/sante says so instead of reading « off ».
    expect(twilioSenderValid()).toBe(false);
  });
});

describe('sendWhatsApp', () => {
  it('skips without any provider and never touches the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message());
    expect(r).toEqual({ sent: false, skipped: true, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips customer messages in the Twilio sandbox without a network call', async () => {
    setTwilio(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message({ audience: 'customer' }));
    expect(r).toEqual({ sent: false, skipped: true, reason: 'twilio_sandbox_customer' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still sends admin messages in the Twilio sandbox with the rendered text as Body', async () => {
    setTwilio(true);
    const fetchMock = vi.fn(async () => jsonResponse(201, { sid: 'SM123', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message({ audience: 'admin', to: '+15551234567' }));
    expect(r).toEqual({ sent: true, skipped: false, id: 'SM123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxx/Messages.json');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('To')).toBe('whatsapp:+15551234567');
    expect(body.get('Body')).toBe('Bonjour Jean, paiement reçu.');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization.startsWith('Basic ')).toBe(true);
  });

  it('sends to a real Twilio number with both numbers prefixed and the form body', async () => {
    setTwilio(false);
    const fetchMock = vi.fn(async () => jsonResponse(201, { sid: 'SM456', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message({ audience: 'customer' }));
    expect(r).toEqual({ sent: true, skipped: false, id: 'SM456' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Basic auth: the account SID as user, the auth token as password.
    expect(Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString()).toBe('ACxxxxxxxx:secret-token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('From')).toBe('whatsapp:+15005550006');
    expect(body.get('To')).toBe('whatsapp:+50937001234');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses a malformed TWILIO_WHATSAPP_FROM before calling Twilio', async () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'secret-token';
    process.env.TWILIO_WHATSAPP_FROM = '509 3700';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message({ audience: 'admin' }));
    expect(r).toEqual({ sent: false, skipped: false, error: 'bad_sender' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the Twilio error code in the message and never the auth token', async () => {
    setTwilio(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 63016, message: 'Failed to send freeform message', status: 400 })),
    );
    const r = await sendWhatsApp(message());
    expect(r.sent).toBe(false);
    expect(r.error).toContain('HTTP 400');
    expect(r.error).toContain('63016');
    expect(r.error).toContain('Failed to send freeform message');
    expect(r.error).not.toContain('secret-token');
  });

  it('sends a Meta template message when a template name is mapped', async () => {
    setMeta();
    process.env.WHATSAPP_META_TEMPLATES = JSON.stringify({ paid: { fr: 'meru_paid_fr' } });
    process.env.WHATSAPP_META_TEMPLATE_LANG = 'fr';
    const fetchMock = vi.fn(async () => jsonResponse(200, { messages: [{ id: 'wamid.ABC' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message());
    expect(r).toEqual({ sent: true, skipped: false, id: 'wamid.ABC' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/messages');
    const body = JSON.parse(String(init.body)) as {
      messaging_product: string;
      to: string;
      type: string;
      template: { name: string; language: { code: string }; components: { type: string; parameters: { type: string; text: string }[] }[] };
    };
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('50937001234');
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('meru_paid_fr');
    expect(body.template.language.code).toBe('fr');
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Jean' }, { type: 'text', text: '2 985 HTG' }] },
    ]);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer EAAG-secret');
  });

  it('falls back to a Meta text message without a mapping', async () => {
    setMeta();
    const fetchMock = vi.fn(async () => jsonResponse(200, { messages: [{ id: 'wamid.TXT' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message());
    expect(r.sent).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { type: string; text: { body: string; preview_url: boolean } };
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Bonjour Jean, paiement reçu.');
  });

  it('reports provider errors without throwing and without leaking the token', async () => {
    setMeta();
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, { error: { message: 'Invalid parameter', code: 100 } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message());
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe(false);
    expect(r.error).toContain('HTTP 400');
    expect(r.error).toContain('Invalid parameter');
    expect(r.error).not.toContain('EAAG-secret');
  });

  it('reports a network failure as an error result', async () => {
    setTwilio(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const r = await sendWhatsApp(message());
    expect(r).toEqual({ sent: false, skipped: false, error: 'fetch failed' });
  });

  it('refuses a malformed recipient before any network call', async () => {
    setMeta();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendWhatsApp(message({ to: '3700 1234' }));
    expect(r).toEqual({ sent: false, skipped: false, error: 'bad_recipient' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
