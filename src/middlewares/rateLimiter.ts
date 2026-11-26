import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * In-memory limiter per process. Phase 9 swaps the store for Redis so limits are shared
 * across instances.
 */
export function createRateLimiter({ windowMs, limit, message, keyGenerator }: LimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, _res, next) => next(ApiError.tooManyRequests(message)),
  });
}

/** General limiter for the whole API. Created per app instance so each has its own counters. */
export const createApiLimiter = () =>
  createRateLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_MAX });

const clientKey = (req: Request) => ipKeyGenerator(req.ip ?? '');

/** Limiter for auth endpoints. Create one per route so each endpoint has its own counter. */
export const createAuthLimiter = (options: { perEmail?: boolean } = {}) =>
  createRateLimiter({
    windowMs: 15 * 60_000,
    limit: env.AUTH_RATE_LIMIT_MAX,
    message: 'Too many attempts, please try again in 15 minutes',
    // Per IP + email, so one shared mobile-carrier IP cannot lock out unrelated customers.
    ...(options.perEmail && {
      keyGenerator: (req: Request) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
        return `${clientKey(req)}|${email}`;
      },
    }),
  });
