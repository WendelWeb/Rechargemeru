import { describe, expect, it } from 'vitest';
import {
  EVENT_TYPES,
  JOURNEY_EVENT_TYPES,
  MAX_EVENTS_BODY_BYTES,
  MAX_EVENTS_PER_BATCH,
  MAX_EVENT_AGE_MS,
  parseEventsBody,
  sanitizeEvents,
} from './events';

const NOW = new Date('2026-09-25T18:00:00.000Z');
const VIEW = '3f2b8c1e9a4d4e7f8b210c5d';

/** A well-formed event; each test breaks one field. */
const ok = (over: Record<string, unknown> = {}) => ({
  type: 'click',
  name: 'cta_hero',
  path: '/fr',
  viewId: VIEW,
  age: 0,
  ...over,
});

/** The one event a batch of one gives back (or `undefined` when it was dropped). */
const one = (over: Record<string, unknown> = {}) => sanitizeEvents({ events: [ok(over)] }, NOW)[0];

describe('the vocabulary', () => {
  it('knows six kinds, four of which a journey lists one by one', () => {
    expect(EVENT_TYPES).toEqual(['click', 'step', 'error', 'submit', 'page_end', 'scroll']);
    expect(JOURNEY_EVENT_TYPES).toEqual(['click', 'step', 'error', 'submit']);
    expect(MAX_EVENTS_PER_BATCH).toBe(50);
    expect(MAX_EVENTS_BODY_BYTES).toBe(16_384);
    expect(MAX_EVENT_AGE_MS).toBe(600_000);
  });
});

describe('sanitizeEvents — a clean batch', () => {
  it('keeps every field of a well-formed event, dated now', () => {
    expect(sanitizeEvents({ events: [ok({ target: '/fr/faq', value: 3 })] }, NOW)).toEqual([
      {
        type: 'click',
        name: 'cta_hero',
        target: '/fr/faq',
        value: 3,
        path: '/fr',
        viewId: VIEW,
        createdAt: NOW,
      },
    ]);
  });

  it('accepts every kind and keeps the order of the batch', () => {
    const events = EVENT_TYPES.map((type, i) => ok({ type, name: `n${i}` }));
    const out = sanitizeEvents({ events }, NOW);
    expect(out.map((e) => e.type)).toEqual([...EVENT_TYPES]);
    expect(out.map((e) => e.name)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('also reads a bare array', () => {
    expect(sanitizeEvents([ok()], NOW)).toHaveLength(1);
  });

  it('fills the optional fields with null', () => {
    expect(sanitizeEvents({ events: [{ type: 'step', name: 'details', path: '/ht' }] }, NOW)).toEqual([
      { type: 'step', name: 'details', target: null, value: null, path: '/ht', viewId: null, createdAt: NOW },
    ]);
  });
});

describe('sanitizeEvents — what is not a batch', () => {
  it('answers an empty list, never an exception', () => {
    for (const raw of [null, undefined, 42, 'events', {}, { events: null }, { events: 'x' }, { events: {} }, true]) {
      expect(sanitizeEvents(raw, NOW)).toEqual([]);
    }
  });

  it('skips entries that are not objects', () => {
    const out = sanitizeEvents({ events: [null, 7, 'click', [ok()], ok(), undefined] }, NOW);
    expect(out).toHaveLength(1);
  });

  it('reads the first fifty entries only', () => {
    const events = Array.from({ length: 80 }, (_, i) => ok({ name: `e${i}` }));
    const out = sanitizeEvents({ events }, NOW);
    expect(out).toHaveLength(50);
    expect(out[49].name).toBe('e49');
  });

  it('survives an invalid « now » by using the real clock', () => {
    const before = Date.now();
    const [event] = sanitizeEvents({ events: [ok()] }, new Date(Number.NaN));
    expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('sanitizeEvents — type', () => {
  it('drops an unknown or mis-cased kind', () => {
    for (const type of ['pageview', 'CLICK', 'Click', ' click', '', null, 1, undefined, ['click']]) {
      expect(one({ type })).toBeUndefined();
    }
  });
});

describe('sanitizeEvents — name', () => {
  it('trims it and removes control characters', () => {
    expect(one({ name: '  cta_hero  ' })?.name).toBe('cta_hero');
    expect(one({ name: 'cta\u0000_he\nro\t' })?.name).toBe('cta_hero');
    expect(one({ name: 'a\u007f\u0085b\u2028c' })?.name).toBe('abc');
  });

  it('cuts it at 80 characters', () => {
    expect(one({ name: 'x'.repeat(200) })?.name).toBe('x'.repeat(80));
  });

  it('never leaves half an emoji at the cut', () => {
    const name = `${'x'.repeat(79)}😀`;
    expect(one({ name })?.name).toBe('x'.repeat(79));
  });

  it('keeps accented and Creole text as it is', () => {
    expect(one({ name: 'Kòmande kounye a' })?.name).toBe('Kòmande kounye a');
  });

  it('drops the event when nothing is left', () => {
    for (const name of ['', '   ', '\u0000\u0001', '\n\t ', null, undefined, 42, { a: 1 }]) {
      expect(one({ name })).toBeUndefined();
    }
  });
});

describe('sanitizeEvents — target', () => {
  it('is cleaned like the name and cut at 200', () => {
    expect(one({ target: '  /fr/faq\n' })?.target).toBe('/fr/faq');
    expect(one({ target: 'y'.repeat(500) })?.target).toBe('y'.repeat(200));
  });

  it('is null when absent, blank or not a string', () => {
    for (const target of [undefined, null, '', '   ', '\u0000', 7, ['x']]) {
      expect(one({ target })?.target).toBeNull();
    }
  });
});

describe('sanitizeEvents — path', () => {
  it('goes through sanitizePath', () => {
    expect(one({ path: '/fr?phone=37001234#top' })?.path).toBe('/fr');
    expect(one({ path: '/fr/commande/MR-EKMQDW33' })?.path).toBe('/fr/commande/*');
  });

  it('drops the event when the path is not one we record', () => {
    for (const path of ['/admin', '/admin/commandes', '/api/events', 'https://evil.example/fr', '//evil', 'fr', '', null, 3]) {
      expect(one({ path })).toBeUndefined();
    }
  });
});

describe('sanitizeEvents — viewId', () => {
  it('keeps an id of the right shape', () => {
    expect(one({ viewId: 'abcdEFGH' })?.viewId).toBe('abcdEFGH');
    expect(one({ viewId: 'a'.repeat(40) })?.viewId).toBe('a'.repeat(40));
  });

  it('is null otherwise — without dropping the event', () => {
    for (const viewId of ['short', 'a'.repeat(41), 'has space1', "x' or 1=1", 12345678, null, undefined]) {
      const event = one({ viewId });
      expect(event).toBeDefined();
      expect(event?.viewId).toBeNull();
    }
  });
});

describe('sanitizeEvents — value', () => {
  it('rounds to a whole number', () => {
    expect(one({ value: 2.4 })?.value).toBe(2);
    expect(one({ value: 2.6 })?.value).toBe(3);
  });

  it('holds page_end within thirty minutes of active time', () => {
    expect(one({ type: 'page_end', value: 45_000 })?.value).toBe(45_000);
    expect(one({ type: 'page_end', value: 1_800_000 })?.value).toBe(1_800_000);
    expect(one({ type: 'page_end', value: 5_000_000 })?.value).toBe(1_800_000);
    expect(one({ type: 'page_end', value: -10 })?.value).toBe(0);
  });

  it('holds scroll within 0 to 100 percent', () => {
    expect(one({ type: 'scroll', value: 75 })?.value).toBe(75);
    expect(one({ type: 'scroll', value: 140 })?.value).toBe(100);
    expect(one({ type: 'scroll', value: -5 })?.value).toBe(0);
  });

  it('holds any other kind within 0 to ten million', () => {
    expect(one({ type: 'click', value: 3 })?.value).toBe(3);
    expect(one({ type: 'step', value: 99_999_999 })?.value).toBe(10_000_000);
    expect(one({ type: 'error', value: -1 })?.value).toBe(0);
  });

  it('is null for anything that is not a finite number', () => {
    for (const value of ['42', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
      expect(one({ type: 'page_end', value })?.value).toBeNull();
    }
  });
});

describe('sanitizeEvents — age', () => {
  it('dates the event its age before now', () => {
    expect(one({ age: 4_000 })?.createdAt).toEqual(new Date('2026-09-25T17:59:56.000Z'));
    expect(one({ age: 1.6 })?.createdAt).toEqual(new Date('2026-09-25T17:59:59.998Z'));
  });

  it('never dates it more than ten minutes back, nor in the future', () => {
    expect(one({ age: 3_600_000 })?.createdAt).toEqual(new Date('2026-09-25T17:50:00.000Z'));
    expect(one({ age: -60_000 })?.createdAt).toEqual(NOW);
  });

  it('treats a missing or unusable age as zero', () => {
    for (const age of [undefined, null, '4000', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(one({ age })?.createdAt).toEqual(NOW);
    }
  });

  it('dates each event of a batch on its own', () => {
    const out = sanitizeEvents({ events: [ok({ age: 3_000 }), ok({ age: 1_000 })] }, NOW);
    expect(out.map((e) => e.createdAt.toISOString())).toEqual(['2026-09-25T17:59:57.000Z', '2026-09-25T17:59:59.000Z']);
  });
});

describe('parseEventsBody', () => {
  it('parses a JSON body, whatever it holds', () => {
    expect(parseEventsBody('{"events":[]}')).toEqual({ events: [] });
    expect(parseEventsBody('[1]')).toEqual([1]);
  });

  it('answers null for an empty, oversized or broken body', () => {
    expect(parseEventsBody('')).toBeNull();
    expect(parseEventsBody('not json')).toBeNull();
    expect(parseEventsBody(`{"events":[],"pad":"${'x'.repeat(MAX_EVENTS_BODY_BYTES)}"}`)).toBeNull();
  });

  it('feeds sanitizeEvents end to end', () => {
    const body = JSON.stringify({ events: [ok({ type: 'submit', name: 'order_form' })] });
    expect(sanitizeEvents(parseEventsBody(body), NOW)).toEqual([
      { type: 'submit', name: 'order_form', target: null, value: null, path: '/fr', viewId: VIEW, createdAt: NOW },
    ]);
  });
});
