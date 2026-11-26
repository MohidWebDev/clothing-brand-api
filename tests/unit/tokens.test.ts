import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { ApiError } from '../../src/utils/ApiError';
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/utils/tokens';

describe('access tokens', () => {
  it('round-trips the user id', () => {
    const payload = verifyAccessToken(signAccessToken('user-123'));
    expect(payload.sub).toBe('user-123');
    expect(payload.exp - payload.iat).toBe(env.ACCESS_TOKEN_TTL_SECONDS);
  });

  it('carries the password version', () => {
    expect(verifyAccessToken(signAccessToken('u')).pv).toBe(0);
    const changedAt = new Date('2026-01-01T00:00:00.123Z');
    expect(verifyAccessToken(signAccessToken('u', changedAt)).pv).toBe(changedAt.getTime());
  });

  it('rejects garbage', () => {
    expect(() => verifyAccessToken('nope')).toThrow(ApiError);
  });

  it('rejects tokens signed with another secret', () => {
    const forged = jwt.sign({}, 'x'.repeat(40), { subject: 'u', issuer: 'clothing-brand-api' });
    expect(() => verifyAccessToken(forged)).toThrow(ApiError);
  });

  it('rejects tokens from another issuer', () => {
    const other = jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: 'u', issuer: 'someone-else' });
    expect(() => verifyAccessToken(other)).toThrow(ApiError);
  });

  it('rejects expired tokens', () => {
    const expired = jwt.sign({}, env.JWT_ACCESS_SECRET, {
      subject: 'u',
      issuer: 'clothing-brand-api',
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(expired)).toThrow(ApiError);
  });

  it('rejects the "none" algorithm', () => {
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'u', iss: 'clothing-brand-api', iat: 1, exp: 9999999999 }),
    ).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrow(ApiError);
  });
});

describe('opaque tokens', () => {
  it('generates unique url-safe tokens', () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateOpaqueToken()).not.toBe(a);
  });

  it('hashes deterministically and never returns the raw token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).not.toContain('abc');
  });
});
