import { describe, expect, it } from 'vitest';
import { jokesFromText, normalizeStyle } from '@/lib/whatsapp/style';
import { DEFAULT_WHATSAPP_STYLE, STYLE_LIMITS } from '@/lib/whatsapp/types';

describe('normalizeStyle', () => {
  it('rend le style par défaut pour n’importe quoi', () => {
    expect(normalizeStyle(null)).toEqual(DEFAULT_WHATSAPP_STYLE);
    expect(normalizeStyle('oups')).toEqual(DEFAULT_WHATSAPP_STYLE);
    expect(normalizeStyle([])).toEqual(DEFAULT_WHATSAPP_STYLE);
  });

  it('garde un ton connu et refuse les autres', () => {
    expect(normalizeStyle({ defaultTone: 'fun' }).defaultTone).toBe('fun');
    expect(normalizeStyle({ defaultTone: 'sarcastique' }).defaultTone).toBe(DEFAULT_WHATSAPP_STYLE.defaultTone);
  });

  it('nettoie et borne les textes', () => {
    const style = normalizeStyle({
      signatureName: '  Stanley  ',
      closing: { fr: ' Merci ! ', ht: 'x'.repeat(500) },
      emojis: false,
    });
    expect(style.signatureName).toBe('Stanley');
    expect(style.closing.fr).toBe('Merci !');
    expect(style.closing.ht.length).toBe(STYLE_LIMITS.closing);
    expect(style.emojis).toBe(false);
  });

  it('garde les blagues non vides, dans la limite', () => {
    const style = normalizeStyle({ jokes: { fr: ['  Une ', '', 42, 'Deux'], ht: 'pas une liste' } });
    expect(style.jokes.fr).toEqual(['Une', 'Deux']);
    expect(style.jokes.ht).toEqual([]);
  });

  it('ne garde une réécriture que pour un vrai message, un vrai ton et une vraie langue', () => {
    const known = new Set(['payment_reminder']);
    const style = normalizeStyle(
      {
        overrides: {
          'payment_reminder|fun|fr': '  Yo {prenom}  ',
          'payment_reminder|sarcastique|fr': 'non',
          'payment_reminder|fun|es': 'non',
          'inconnu|fun|fr': 'non',
          'payment_reminder|direct|ht': '   ',
        },
      },
      known,
    );
    expect(style.overrides).toEqual({ 'payment_reminder|fun|fr': 'Yo {prenom}' });
  });
});

describe('jokesFromText', () => {
  it('lit une blague par ligne', () => {
    expect(jokesFromText('Une\n\n  Deux  \r\nTrois')).toEqual(['Une', 'Deux', 'Trois']);
  });

  it('ne coupe jamais un emoji en deux', () => {
    const line = `${'x'.repeat(STYLE_LIMITS.jokeLength - 1)}😄😄`;
    const [joke] = jokesFromText(line);
    expect(Array.from(joke)).toHaveLength(STYLE_LIMITS.jokeLength);
    expect(joke.endsWith('😄')).toBe(true);
    expect(joke.isWellFormed()).toBe(true);
  });

  it('borne le nombre et la longueur', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Blague ${i}`).join('\n');
    expect(jokesFromText(many)).toHaveLength(STYLE_LIMITS.jokeCount);
    expect(jokesFromText('x'.repeat(400))[0].length).toBe(STYLE_LIMITS.jokeLength);
  });
});
