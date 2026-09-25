import { describe, expect, it } from 'vitest';
import { fillTemplate, hasEmoji, placeholdersIn, stripEmojis, unknownPlaceholders } from '@/lib/whatsapp/template';

describe('fillTemplate', () => {
  it('remplace chaque variable connue', () => {
    expect(fillTemplate('Bonjour {prenom}, commande {reference}.', { prenom: 'Jean', reference: 'MR-1' })).toBe(
      'Bonjour Jean, commande MR-1.',
    );
  });

  it('garde une partie facultative seulement quand ses variables ont une valeur', () => {
    const t = 'Envoyé[[, référence Meru {ref_meru}]].';
    expect(fillTemplate(t, { ref_meru: 'ABC123' })).toBe('Envoyé, référence Meru ABC123.');
    expect(fillTemplate(t, { ref_meru: '' })).toBe('Envoyé.');
    expect(fillTemplate(t, {})).toBe('Envoyé.');
  });

  it('laisse une variable inconnue telle quelle, pour qu’une faute de frappe se voie', () => {
    expect(fillTemplate('Bonjour {prenmo}', { prenom: 'Jean' })).toBe('Bonjour {prenmo}');
  });
});

describe('placeholdersIn / unknownPlaceholders', () => {
  it('liste les variables sans doublon et repère les inconnues', () => {
    expect(placeholdersIn('{prenom} {reference} {prenom}')).toEqual(['prenom', 'reference']);
    expect(unknownPlaceholders('{prenom} {montant} {lien_suivi}')).toEqual(['montant']);
  });
});

describe('stripEmojis', () => {
  it('retire les emojis et l’espace qui les précédait', () => {
    expect(stripEmojis('Bonjour Jean 😊, c’est parti 🚀 !')).toBe('Bonjour Jean, c’est parti !');
    expect(stripEmojis('👋 Salut Jean')).toBe('Salut Jean');
    expect(stripEmojis('Merci 🙏🏾')).toBe('Merci');
    expect(stripEmojis('Bravo 👨‍👩‍👧 et 🇭🇹')).toBe('Bravo et');
  });

  it('garde l’espace française avant « ? » et « : »', () => {
    expect(stripEmojis('Vous êtes là ? Voici le lien : https://x')).toBe('Vous êtes là ? Voici le lien : https://x');
  });

  it('transforme les chiffres en pastille en chiffres numérotés', () => {
    expect(stripEmojis('1️⃣ Le prix\n2️⃣ Le paiement')).toBe('1. Le prix\n2. Le paiement');
  });

  it('ne touche pas un texte sans emoji', () => {
    const plain = 'Bonjour Jean,\n\nVotre commande MR-1 attend son paiement.';
    expect(stripEmojis(plain)).toBe(plain);
    expect(hasEmoji(plain)).toBe(false);
    expect(hasEmoji('Top 👍')).toBe(true);
  });
});
