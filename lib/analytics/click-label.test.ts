import { describe, expect, it } from 'vitest';
import { cleanLabel, kindLabel, linkTarget } from '@/lib/analytics/click-label';

const ORIGIN = 'https://www.rechargemeru.com';

describe('cleanLabel', () => {
  it('garde les mots d’un bouton, sur une ligne', () => {
    expect(cleanLabel('  Continuer ')).toBe('Continuer');
    expect(cleanLabel('Payer\n   avec\tMonCash')).toBe('Payer avec MonCash');
  });

  it('refuse ce qui ressemble à une donnée personnelle', () => {
    expect(cleanLabel('jean@mail.com')).toBeNull();
    expect(cleanLabel('Appeler +509 3749 4388')).toBeNull();
    expect(cleanLabel('37001234')).toBeNull();
  });

  it('garde les petits nombres des montants', () => {
    expect(cleanLabel('50')).toBe('50');
    expect(cleanLabel('100 $ US')).toBe('100 $ US');
  });

  it('borne la longueur sans couper un emoji', () => {
    const long = cleanLabel('😄'.repeat(100))!;
    expect(Array.from(long)).toHaveLength(80);
    expect(long.isWellFormed()).toBe(true);
  });

  it('ne rend rien pour du vide', () => {
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel(null)).toBeNull();
  });
});

describe('linkTarget', () => {
  it('donne le chemin d’un lien du site, sans la référence d’une commande', () => {
    expect(linkTarget('/fr/suivi', ORIGIN)).toBe('/fr/suivi');
    expect(linkTarget('https://www.rechargemeru.com/ht/commande/MR-EKMQDW33?x=1', ORIGIN)).toBe('/ht/commande/*');
  });

  it('résume WhatsApp sans le numéro ni le texte', () => {
    expect(linkTarget('https://wa.me/50937494388?text=Bonjour', ORIGIN)).toBe('whatsapp');
  });

  it('donne l’hôte d’un autre site', () => {
    expect(linkTarget('https://www.facebook.com/page', ORIGIN)).toBe('facebook.com');
  });

  it('refuse ce qui n’est pas un lien web', () => {
    expect(linkTarget('javascript:void(0)', ORIGIN)).toBeNull();
    expect(linkTarget(null, ORIGIN)).toBeNull();
    expect(linkTarget('tel:+50937494388', ORIGIN)).toBe('téléphone');
  });
});

describe('kindLabel', () => {
  it('nomme le genre d’élément', () => {
    expect(kindLabel('A')).toBe('lien');
    expect(kindLabel('input', 'radio')).toBe('choix');
    expect(kindLabel('button')).toBe('bouton');
  });
});
