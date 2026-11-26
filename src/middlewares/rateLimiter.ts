import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message?: string;
}

/**
 * In-memory limiter per process. Phase 9 swaps the store for Redis so limits are shared
 * across instances.
 */
export function createRateLimiter({ windowMs, limit, message }: LimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(ApiError.tooManyRequests(message)),
  });
}

/** General limiter for the whole API. Created per app instance so each has its own counters. */
export const createApiLimiter = () =>
  createRateLimiter({ windowMs: 60_000, limit: env.RATE_LIMIT_MAX });

/** Strict limiter for login, register, OTP and password reset endpoints (used from Phase 2). */
export const createAuthLimiter = () =>
  createRateLimiter({
    windowMs: 15 * 60_000,
    limit: 10,
    message: 'Too many attempts, please try again in 15 minutes',
  });
