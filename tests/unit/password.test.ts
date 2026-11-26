import { describe, expect, it } from 'vitest';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../../src/utils/password';

describe('password hashing', () => {
  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await hashPassword('Correct-horse-1');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Correct-horse-1')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password-1')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same-Password1')).not.toBe(await hashPassword('same-Password1'));
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('runs the dummy verification without throwing', async () => {
    await expect(verifyDummyPassword('anything')).resolves.toBeUndefined();
  });
});
