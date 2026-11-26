import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

const ISSUER = 'clothing-brand-api';

export interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
  /** Password version: the user's passwordChangedAt in epoch ms at issue time, or 0. */
  pv: number;
}

/**
 * The `pv` claim ties the token to the password it was issued under. Changing the password
 * changes the user's version, which instantly invalidates every older access token.
 */
export function signAccessToken(userId: string, passwordChangedAt?: Date | null): string {
  return jwt.sign({ pv: passwordChangedAt?.getTime() ?? 0 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    if (typeof payload === 'string' || !payload.sub || !payload.iat || !payload.exp) {
      throw new Error('Malformed token');
    }
    return {
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
      pv: typeof payload.pv === 'number' ? payload.pv : 0,
    };
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

/** Cryptographically random, URL-safe token (refresh, email verification, password reset). */
export const generateOpaqueToken = () => randomBytes(32).toString('base64url');

/** Only the hash is stored, so a database leak does not expose usable tokens. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
