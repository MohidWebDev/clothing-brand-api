import argon2 from 'argon2';
import { env } from '../config/env';

// OWASP-recommended argon2id parameters; much cheaper under test so the suite stays fast.
const options: argon2.HashOptions =
  env.NODE_ENV === 'test'
    ? { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 }
    : { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { ...options, raw: false });

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real password check. Used when the email is unknown so response
 * timing does not reveal which accounts exist.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
