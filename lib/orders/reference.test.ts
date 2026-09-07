import { describe, it, expect } from 'vitest';
import {
  REFERENCE_ALPHABET,
  REFERENCE_LENGTH,
  REFERENCE_PREFIX,
  generateReference,
  normalizeReference,
} from './reference';

describe('REFERENCE_ALPHABET', () => {
  it('has 32 distinct characters and no look-alikes', () => {
    expect(REFERENCE_ALPHABET).toHaveLength(32);
    expect(new Set(REFERENCE_ALPHABET).size).toBe(32);
    for (const c of 'IO01') expect(REFERENCE_ALPHABET).not.toContain(c);
  });
});

describe('generateReference', () => {
  it('produces the prefix followed by 8 alphabet characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReference()).toMatch(/^MR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('is deterministic with an injected generator', () => {
    expect(generateReference(() => 0)).toBe('MR-AAAAAAAA');
    expect(generateReference(() => REFERENCE_ALPHABET.length - 1)).toBe('MR-99999999');
    let i = 0;
    expect(generateReference(() => i++)).toBe('MR-ABCDEFGH');
  });

  it('asks the generator for one index per character, bounded by the alphabet size', () => {
    const maxes: number[] = [];
    generateReference((max) => {
      maxes.push(max);
      return 0;
    });
    expect(maxes).toEqual(Array<number>(REFERENCE_LENGTH).fill(REFERENCE_ALPHABET.length));
  });

  it('does not repeat itself across a batch', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateReference());
    expect(seen.size).toBe(1000);
  });
});

describe('normalizeReference', () => {
  it('accepts every common spelling', () => {
    for (const s of [
      'MR-7F3K2QAB',
      'mr-7f3k2qab',
      'MR 7F3K2QAB',
      'MR7F3K2QAB',
      '7F3K2QAB',
      '7f3k2qab',
      '7F3K-2QAB',
      '  mr - 7f3k 2qab ',
      'MR–7F3K2QAB',
      'MR_7F3K2QAB',
    ]) {
      expect(normalizeReference(s)).toBe('MR-7F3K2QAB');
    }
  });

  it('keeps a body that happens to start with MR', () => {
    expect(normalizeReference('MRABCDEF')).toBe('MR-MRABCDEF');
    expect(normalizeReference('MR-MRABCDEF')).toBe('MR-MRABCDEF');
    expect(normalizeReference('MRMRABCDEF')).toBe('MR-MRABCDEF');
  });

  it('rejects wrong lengths', () => {
    expect(normalizeReference('')).toBeNull();
    expect(normalizeReference('   ')).toBeNull();
    expect(normalizeReference('MR-')).toBeNull();
    expect(normalizeReference('MR-7F3K2QA')).toBeNull();
    expect(normalizeReference('MR-7F3K2QABC')).toBeNull();
    expect(normalizeReference('7F3K2QA')).toBeNull();
  });

  it('rejects characters outside the alphabet and foreign prefixes', () => {
    expect(normalizeReference('MR-7F3K2QA0')).toBeNull();
    expect(normalizeReference('MR-7F3K2QA1')).toBeNull();
    expect(normalizeReference('MR-7F3K2QAI')).toBeNull();
    expect(normalizeReference('MR-7F3K2QAO')).toBeNull();
    expect(normalizeReference('MR-7F3K2Q*B')).toBeNull();
    expect(normalizeReference('MR-7F3K2QÀB')).toBeNull();
    expect(normalizeReference('XX-7F3K2QAB')).toBeNull();
  });

  it('round-trips generated references', () => {
    for (let i = 0; i < 100; i++) {
      const ref = generateReference();
      expect(normalizeReference(ref)).toBe(ref);
      expect(normalizeReference(ref.slice(REFERENCE_PREFIX.length).toLowerCase())).toBe(ref);
    }
  });
});
