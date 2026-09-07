import { describe, it, expect } from 'vitest';
import { maskMeruAccount, meruAccountLabelFr, normalizeMeruAccount } from './meru-account';

describe('normalizeMeruAccount', () => {
  describe('email', () => {
    it('lowercases and trims', () => {
      expect(normalizeMeruAccount('email', '  Jean.Baptiste@Mail.COM ')).toBe('jean.baptiste@mail.com');
      expect(normalizeMeruAccount('email', 'jean@mail.com')).toBe('jean@mail.com');
      expect(normalizeMeruAccount('email', 'j+meru@sub.example.co.uk')).toBe('j+meru@sub.example.co.uk');
    });

    it('refuses anything that is not a plain address', () => {
      expect(normalizeMeruAccount('email', '')).toBeNull();
      expect(normalizeMeruAccount('email', '   ')).toBeNull();
      expect(normalizeMeruAccount('email', 'jeanbaptiste')).toBeNull();
      expect(normalizeMeruAccount('email', 'jean@mail')).toBeNull();
      expect(normalizeMeruAccount('email', '@mail.com')).toBeNull();
      expect(normalizeMeruAccount('email', 'jean@')).toBeNull();
      expect(normalizeMeruAccount('email', 'jean baptiste@mail.com')).toBeNull();
      expect(normalizeMeruAccount('email', 'jean@@mail.com')).toBeNull();
      expect(normalizeMeruAccount('email', 'jean@mail.com extra')).toBeNull();
      expect(normalizeMeruAccount('email', `${'a'.repeat(250)}@mail.com`)).toBeNull();
    });

    it('does not accept a username in the email slot', () => {
      expect(normalizeMeruAccount('email', '@jeanb')).toBeNull();
    });
  });

  describe('username', () => {
    it('strips a leading @ or $ and trims', () => {
      expect(normalizeMeruAccount('username', '@jeanb')).toBe('jeanb');
      expect(normalizeMeruAccount('username', '$jeanb')).toBe('jeanb');
      expect(normalizeMeruAccount('username', ' @jean.b_2 ')).toBe('jean.b_2');
      expect(normalizeMeruAccount('username', 'jean-b')).toBe('jean-b');
    });

    it('keeps the case the customer typed', () => {
      expect(normalizeMeruAccount('username', 'JeanB')).toBe('JeanB');
    });

    it('enforces 3 to 40 characters of letters, digits, dot, underscore and dash', () => {
      expect(normalizeMeruAccount('username', 'abc')).toBe('abc');
      expect(normalizeMeruAccount('username', 'a'.repeat(40))).toBe('a'.repeat(40));
      expect(normalizeMeruAccount('username', 'ab')).toBeNull();
      expect(normalizeMeruAccount('username', '@ab')).toBeNull();
      expect(normalizeMeruAccount('username', 'a'.repeat(41))).toBeNull();
      expect(normalizeMeruAccount('username', '')).toBeNull();
      expect(normalizeMeruAccount('username', '@')).toBeNull();
      expect(normalizeMeruAccount('username', 'jean baptiste')).toBeNull();
      expect(normalizeMeruAccount('username', 'jean@mail.com')).toBeNull();
      expect(normalizeMeruAccount('username', 'jéan')).toBeNull();
      expect(normalizeMeruAccount('username', 'jean!')).toBeNull();
    });
  });
});

describe('maskMeruAccount', () => {
  it('masks an email but keeps enough to recognise it', () => {
    expect(maskMeruAccount('email', 'jean@mail.com')).toBe('je•••@ma•••.com');
    expect(maskMeruAccount('email', 'jean.baptiste@gmail.com')).toBe('je•••@gm•••.com');
    expect(maskMeruAccount('email', 'jean@sub.example.org')).toBe('je•••@su•••.org');
    expect(maskMeruAccount('email', 'a@b.co')).toBe('a•••@b•••.co');
  });

  it('masks a username down to two characters', () => {
    expect(maskMeruAccount('username', 'jeanbaptiste')).toBe('je•••');
    expect(maskMeruAccount('username', 'abc')).toBe('ab•••');
    expect(maskMeruAccount('username', 'JeanB')).toBe('Je•••');
  });

  it('never reveals more than the first two characters of any part', () => {
    const masked = maskMeruAccount('email', 'secretname@secretdomain.com');
    expect(masked).not.toContain('secret');
    expect(masked).not.toContain('cre');
    expect(maskMeruAccount('username', 'secretname')).not.toContain('cre');
  });

  it('degrades gracefully on malformed values', () => {
    expect(maskMeruAccount('email', 'no-at-sign')).toBe('no•••');
    expect(maskMeruAccount('email', '')).toBe('•••');
    expect(maskMeruAccount('username', '')).toBe('•••');
    expect(maskMeruAccount('email', '@x.com')).toBe('•••@x•••.com');
  });
});

describe('meruAccountLabelFr', () => {
  it('names each identifier type in French, without capitals', () => {
    expect(meruAccountLabelFr('email')).toBe('Email Meru');
    expect(meruAccountLabelFr('username')).toBe("Nom d'utilisateur Meru");
    for (const t of ['email', 'username'] as const) {
      const label = meruAccountLabelFr(t);
      expect(label).not.toBe(label.toUpperCase());
    }
  });
});
