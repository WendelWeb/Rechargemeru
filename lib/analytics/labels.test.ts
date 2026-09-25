import { describe, expect, it } from 'vitest';
import { countryName, describeEvent, flag, formatActive, pageName, sourceName } from '@/lib/analytics/labels';

const ev = (type: string, name: string, target: string | null = null, value: number | null = null) => ({
  type,
  name,
  target,
  value,
});

describe('describeEvent', () => {
  it('raconte un clic, et où il mène', () => {
    expect(describeEvent(ev('click', '50'))).toEqual({ text: 'Touche « 50 »', tone: 'click' });
    expect(describeEvent(ev('click', 'Support WhatsApp', 'whatsapp')).text).toBe('Touche « Support WhatsApp » → WhatsApp');
    expect(describeEvent(ev('click', 'La suivre', '/fr/suivi')).text).toBe(
      'Touche « La suivre » → Suivre ma commande (français)',
    );
  });

  it('nomme les écrans du formulaire', () => {
    expect(describeEvent(ev('step', 'details')).text).toBe('Passe à l’écran « Vos infos »');
    expect(describeEvent(ev('step', 'confirm')).text).toBe('Passe à l’écran « Vérifier »');
  });

  it('dit sur quels champs le visiteur a bloqué, sans leur contenu', () => {
    expect(describeEvent(ev('error', 'formulaire', 'phone,meruAccount'))).toEqual({
      text: 'Bloqué sur : numéro WhatsApp, identifiant Meru',
      tone: 'error',
    });
  });

  it('traduit un refus du serveur', () => {
    expect(describeEvent(ev('error', 'serveur', 'quote_changed')).text).toBe(
      'Commande refusée : le taux a changé pendant la saisie',
    );
  });

  it('résume la confirmation de la commande', () => {
    expect(describeEvent(ev('submit', 'commande', 'natcash', 5000)).text.replace(/ /g, ' ')).toBe(
      'Confirme la commande (50 $ US, NatCash)',
    );
  });
});

describe('les noms lisibles', () => {
  it('nomme les pages', () => {
    expect(pageName('/fr')).toBe('Accueil (français)');
    expect(pageName('/ht/commande/*')).toBe('Page d’une commande (kreyòl)');
    expect(pageName('/ht/commande/MR-EKMQDW33')).toBe('Page d’une commande (kreyòl)');
  });

  it('nomme les sources et les pays', () => {
    expect(sourceName(null)).toBe('Accès direct, WhatsApp ou favori');
    expect(sourceName('facebook.com')).toBe('Facebook');
    expect(countryName('HT')).toBe('Haïti');
    expect(flag('ht')).toBe('🇭🇹');
    expect(flag('unknown')).toBe('');
  });
});

describe('formatActive', () => {
  const plain = (ms: number | null) => formatActive(ms).replace(/\u00a0/g, ' ');
  it('écrit une durée lisible, sans séparer un nombre de son unité', () => {
    expect(formatActive(133_000)).toBe('2\u00a0min 13\u00a0s');
    expect(plain(0)).toBe('0 s');
    expect(plain(45_400)).toBe('45 s');
    expect(plain(133_000)).toBe('2 min 13 s');
    expect(plain(120_000)).toBe('2 min');
    expect(plain(3_900_000)).toBe('1 h 05 min');
    expect(plain(null)).toBe('0 s');
  });
});
