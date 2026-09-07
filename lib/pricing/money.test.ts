import { describe, it, expect } from 'vitest';
import { HTG_WALLET_MAX, effectiveRateHtg, percentOf, rateToE4, usdCentsToHtg } from './money';

describe('rateToE4', () => {
  it('converts a rate to integer ten-thousandths', () => {
    expect(rateToE4(132.5)).toBe(1_325_000);
    expect(rateToE4(132)).toBe(1_320_000);
  });
  it('absorbs floating-point noise on four-decimal rates', () => {
    expect(rateToE4(132.1234)).toBe(1_321_234);
    expect(rateToE4(0.0001)).toBe(1);
    expect(rateToE4(1.1)).toBe(11_000);
  });
  it('returns 0 for a rate that is not a finite number', () => {
    expect(rateToE4(Number.NaN)).toBe(0);
    expect(rateToE4(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('usdCentsToHtg', () => {
  it('converts cents to whole gourdes at the rate', () => {
    expect(usdCentsToHtg(2000, 132.5)).toBe(2650);
    expect(usdCentsToHtg(1999, 132.1234)).toBe(2641); // 1999 × 1 321 234 / 1e6 = 2641.147…
  });
  it('never charges less than one gourde for a positive amount', () => {
    expect(usdCentsToHtg(1, 0.001)).toBe(1);
  });
  it('is 0 for non-positive or invalid input', () => {
    expect(usdCentsToHtg(0, 132)).toBe(0);
    expect(usdCentsToHtg(-500, 132)).toBe(0);
    expect(usdCentsToHtg(500, 0)).toBe(0);
    expect(usdCentsToHtg(500, -1)).toBe(0);
    expect(usdCentsToHtg(Number.NaN, 132)).toBe(0);
    expect(usdCentsToHtg(500, Number.NaN)).toBe(0);
  });
  it('converts the 3 $ US transfer fee at whatever the rate happens to be', () => {
    // `fixed_usd` fee lines go through this very helper, so the fee is worth
    // the same dollars at every rate instead of being re-typed after a move.
    expect(usdCentsToHtg(300, 132)).toBe(396);
    expect(usdCentsToHtg(300, 150)).toBe(450);
    expect(usdCentsToHtg(300, 132.75)).toBe(398); // 398.25 rounds down
    expect(usdCentsToHtg(300, 201.5)).toBe(605); // 604.5 rounds up
  });

  it('stays an exact integer at the top of the allowed range', () => {
    const htg = usdCentsToHtg(1_000_000, 10_000);
    expect(Number.isInteger(htg)).toBe(true);
    expect(htg).toBe(100_000_000);
  });
});

describe('percentOf', () => {
  it('applies a percentage using integer hundredths', () => {
    expect(percentOf(2650, 5)).toBe(133); // 132.5 rounds up
    expect(percentOf(2650, 2.5)).toBe(66); // 66.25 rounds down
    expect(percentOf(2808, 10)).toBe(281);
    expect(percentOf(1000, 0)).toBe(0);
    expect(percentOf(1000, 100)).toBe(1000);
  });
  it('absorbs floating-point noise in the percentage', () => {
    expect(percentOf(10_000, 5.55)).toBe(555);
    expect(percentOf(1, 0.01)).toBe(0);
  });
  it('is 0 for invalid input', () => {
    expect(percentOf(Number.NaN, 5)).toBe(0);
    expect(percentOf(1000, Number.NaN)).toBe(0);
  });
});

describe('effectiveRateHtg', () => {
  it('reports the all-in rate with four decimals', () => {
    expect(effectiveRateHtg(3089, 2000)).toBe(154.45);
    expect(effectiveRateHtg(2650, 2000)).toBe(132.5);
    expect(effectiveRateHtg(2641, 1999)).toBe(132.1161); // 1 321 160.58… → 1 321 161
  });
  it('is 0 when there are no dollars to divide by', () => {
    expect(effectiveRateHtg(3089, 0)).toBe(0);
    expect(effectiveRateHtg(3089, -1)).toBe(0);
    expect(effectiveRateHtg(Number.NaN, 2000)).toBe(0);
  });
});

describe('HTG_WALLET_MAX', () => {
  it('is the 75 000 HTG per-transaction wallet ceiling', () => {
    expect(HTG_WALLET_MAX).toBe(75_000);
  });
});
