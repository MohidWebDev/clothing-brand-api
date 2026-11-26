import type { RequestHandler } from 'express';
import { allowedOrigins } from '../config/env';
import { ApiError } from '../utils/ApiError';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests, layered on top of SameSite cookies:
 * a state-changing request from a browser must come from one of our own origins.
 * Browsers always attach Origin to cross-origin POST/PUT/PATCH/DELETE, so this cannot be
 * forged from a web page. Non-browser clients (no Origin header) are unaffected.
 */
export const csrfOriginCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin) {
    return allowedOrigins.includes(origin.replace(/\/$/, ''))
      ? next()
      : next(ApiError.forbidden('Cross-origin request blocked'));
  }

  if (req.get('sec-fetch-site') === 'cross-site') {
    return next(ApiError.forbidden('Cross-origin request blocked'));
  }
  next();
};
