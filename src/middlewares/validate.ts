import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError, type ErrorDetail } from '../utils/ApiError';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

const LOCATIONS = ['params', 'query', 'body'] as const;

/**
 * Validates and coerces body, query and params with Zod. Unknown keys are stripped by the
 * schema. Parsed values are exposed on `req.validated` (Express 5 makes `req.query`
 * read-only); `req.body` is also replaced with the parsed body.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const validated: Express.Request['validated'] = {};

    for (const location of LOCATIONS) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location]);
      if (result.success) {
        validated[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ location, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) return next(ApiError.validation(details));

    req.validated = validated;
    if (validated.body !== undefined) req.body = validated.body;
    next();
  };
}
