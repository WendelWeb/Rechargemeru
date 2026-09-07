import { describe, it, expect } from 'vitest';
import { normalizePhone, isHaitian, maskPhone, formatPhone, lastFour } from './phone';

describe('normalizePhone', () => {
  it('accepts Haitian numbers in every common spelling', () => {
    for (const s of ['3700 1234', '37-00-12-34', '+509 3700 1234', '50937001234', '0050937001234', '509 37001234']) {
      expect(normalizePhone(s)).toBe('+50937001234');
    }
  });

  it('accepts every Haitian operator prefix (2 to 5)', () => {
    expect(normalizePhone('2200 1234')).toBe('+50922001234');
    expect(normalizePhone('4600 1234')).toBe('+50946001234');
    expect(normalizePhone('5500 1234')).toBe('+50955001234');
  });

  it('accepts North American WhatsApp numbers', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('15551234567')).toBe('+15551234567');
    expect(normalizePhone('001 555 123 4567')).toBe('+15551234567');
  });

  it('rejects wrong lengths, leading 0/1 locals and other countries', () => {
    expect(normalizePhone('370012')).toBeNull();
    expect(normalizePhone('07001234')).toBeNull();
    expect(normalizePhone('17001234')).toBeNull();
    expect(normalizePhone('+33 6 12 34 56 78')).toBeNull();
  });

  it('rejects empty input, 9-digit locals and malformed NANP numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('+509 3700 12345')).toBeNull();
    expect(normalizePhone('+509 0700 1234')).toBeNull();
    expect(normalizePhone('+1 155 123 4567')).toBeNull(); // area code cannot start with 1
    expect(normalizePhone('+1 055 123 4567')).toBeNull(); // area code cannot start with 0
    expect(normalizePhone('5551234567')).toBeNull(); // 10 digits without the country code
  });
});

describe('helpers', () => {
  it('detects Haitian numbers', () => {
    expect(isHaitian('+50937001234')).toBe(true);
    expect(isHaitian('+15551234567')).toBe(false);
  });

  it('masks and formats', () => {
    expect(maskPhone('+50937001234')).toBe('+509 •••• 1234');
    expect(maskPhone('+15551234567')).toBe('+1 ••• ••• 4567');
    expect(formatPhone('+50937001234')).toBe('+509 3700 1234');
    expect(formatPhone('+15551234567')).toBe('+1 555 123 4567');
    expect(lastFour('+50937001234')).toBe('1234');
  });

  it('never breaks on a value that is not one of the two supported shapes', () => {
    expect(formatPhone('+33612345678')).toBe('+33612345678');
    expect(maskPhone('+33612345678')).toBe('•••• 5678');
    expect(lastFour('12')).toBe('12');
  });
});
