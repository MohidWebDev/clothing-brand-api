import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { normalizeError } from '../../src/middlewares/errorHandler';
import { ApiError } from '../../src/utils/ApiError';

describe('normalizeError', () => {
  it('passes ApiErrors through', () => {
    const err = ApiError.notFound();
    expect(normalizeError(err)).toBe(err);
  });

  it('maps ZodError to a validation error', () => {
    const result = z.object({ name: z.string() }).safeParse({});
    const err = normalizeError(result.error);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details?.[0]?.path).toBe('name');
  });

  it('maps Mongo duplicate key errors to 409 without leaking values', () => {
    const err = normalizeError(
      Object.assign(new Error('E11000 dup key'), {
        code: 11000,
        keyPattern: { email: 1 },
        keyValue: { email: 'secret@x.com' },
      }),
    );
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('email');
    expect(JSON.stringify(err.details)).not.toContain('secret@x.com');
  });

  it('maps Mongoose CastError to 400', () => {
    const err = normalizeError(new mongoose.Error.CastError('ObjectId', 'abc', '_id'));
    expect(err.statusCode).toBe(400);
  });

  it('turns unknown errors into a non-operational 500', () => {
    const err = normalizeError(new Error('kaboom'));
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
    expect(err.message).toBe('Internal server error');
  });
});
