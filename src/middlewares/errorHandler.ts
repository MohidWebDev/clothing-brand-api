import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError, type ErrorDetail } from '../utils/ApiError';

interface HttpLikeError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
  code?: number | string;
  keyPattern?: Record<string, unknown>;
}

/** Converts anything thrown into an ApiError so the handler has one shape to deal with. */
export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    const details: ErrorDetail[] = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return ApiError.validation(details);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return ApiError.validation(details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }

  const e = err as HttpLikeError;

  // MongoDB duplicate key
  if (e?.code === 11000) {
    const fields = Object.keys(e.keyPattern ?? {});
    return ApiError.conflict(
      fields.length ? `A record with this ${fields.join(', ')} already exists` : undefined,
      fields.map((path) => ({ path, message: 'Must be unique' })),
    );
  }

  if (e?.name === 'MulterError') {
    if (e.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Image is too large');
    }
    if (e.code === 'LIMIT_FILE_COUNT' || e.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiError.badRequest('Too many files, or files sent in the wrong field ("images")');
    }
    return ApiError.badRequest('Invalid upload');
  }

  // Errors from body-parser and other http-errors based middleware
  if (e?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (e?.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  const status = e?.status ?? e?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500 && e.expose) {
    return new ApiError(status, 'BAD_REQUEST', e.message);
  }

  return ApiError.internal();
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const apiError = normalizeError(err);

  if (apiError.statusCode >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details && { details: apiError.details }),
      ...(env.NODE_ENV === 'development' &&
        apiError.statusCode >= 500 &&
        err instanceof Error && { stack: err.stack }),
    },
    requestId: String(req.id),
  });
};
