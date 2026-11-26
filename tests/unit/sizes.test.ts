import { describe, expect, it } from 'vitest';
import { compareSizes, normalizeSize } from '../../src/utils/sizes';

describe('sizes', () => {
  it('normalises case and whitespace', () => {
    expect(normalizeSize(' xl ')).toBe('XL');
    expect(normalizeSize('one   size')).toBe('ONE SIZE');
  });

  it('sorts letter sizes in garment order, not alphabetically', () => {
    expect(['XL', 'S', 'XXL', 'M', 'L', 'XS'].sort(compareSizes)).toEqual([
      'XS',
      'S',
      'M',
      'L',
      'XL',
      'XXL',
    ]);
  });

  it('sorts numeric sizes numerically', () => {
    expect(['34', '28', '30', '32'].sort(compareSizes)).toEqual(['28', '30', '32', '34']);
  });

  it('puts letter sizes before numeric before other sizes', () => {
    expect(['ONE SIZE', '32', 'M', 'S'].sort(compareSizes)).toEqual(['S', 'M', '32', 'ONE SIZE']);
  });
});
