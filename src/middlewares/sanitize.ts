import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

const MAX_DEPTH = 10;

function hasUnsafeKey(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => hasUnsafeKey(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, v]) =>
        key.includes('$') ||
        key.includes('.') ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        hasUnsafeKey(v, depth + 1),
    );
  }
  return false;
}

/**
 * Defence against NoSQL operator injection ({ "email": { "$ne": null } }) and prototype
 * pollution: rejects any request whose body, query or params have a key that contains `$` or `.`,
 * or is named like a prototype internal. Zod validation is the second layer.
 */
export const rejectUnsafeInput: RequestHandler = (req, _res, next) => {
  if (hasUnsafeKey(req.body) || hasUnsafeKey(req.query) || hasUnsafeKey(req.params)) {
    return next(ApiError.badRequest('Request contains disallowed characters in field names'));
  }
  next();
};
