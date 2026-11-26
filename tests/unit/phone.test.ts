import { describe, expect, it } from 'vitest';
import { isValidPkPhone, normalizePkPhone } from '../../src/utils/phone';

describe('Pakistani phone numbers', () => {
  it.each(['03001234567', '+923001234567', '923001234567', '0300-1234567', '+92 300 1234567'])(
    'accepts and normalises %s',
    (input) => {
      expect(isValidPkPhone(input)).toBe(true);
      expect(normalizePkPhone(input)).toBe('+923001234567');
    },
  );

  it.each(['', '0300123456', '02101234567', '+14155550123', 'abc', '030012345678'])(
    'rejects %s',
    (input) => {
      expect(isValidPkPhone(input)).toBe(false);
    },
  );
});
