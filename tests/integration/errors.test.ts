import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app';
import { validate } from '../../src/middlewares/validate';
import { ApiError } from '../../src/utils/ApiError';
import { sendSuccess } from '../../src/utils/apiResponse';
import { createTestApp } from '../helpers/createTestApp';

describe('error handling', () => {
  it('returns a 404 envelope for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(res.body.requestId).toBeTruthy();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Malformed JSON body');
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .send({ data: 'x'.repeat(2 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('renders thrown ApiErrors with their status, code and details', async () => {
    const app = createTestApp((r) =>
      r.get('/boom', () => {
        throw ApiError.conflict('Email taken', [{ path: 'email', message: 'Must be unique' }]);
      }),
    );
    const res = await request(app).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'CONFLICT',
      message: 'Email taken',
      details: [{ path: 'email', message: 'Must be unique' }],
    });
  });

  it('hides the message of unexpected errors', async () => {
    const app = createTestApp((r) =>
      r.get('/crash', () => {
        throw new Error('db password is hunter2');
      }),
    );
    const res = await request(app).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('catches errors thrown from async handlers (Express 5)', async () => {
    const app = createTestApp((r) =>
      r.get('/async', async () => {
        await Promise.resolve();
        throw ApiError.forbidden();
      }),
    );
    const res = await request(app).get('/async');
    expect(res.status).toBe(403);
  });
});

describe('validate middleware', () => {
  const schema = {
    body: z.object({ email: z.string().email(), age: z.number().int().min(18) }),
    query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
  };

  const app = createTestApp((r) =>
    r.post('/users', validate(schema), (req, res) => {
      sendSuccess(res, { body: req.body, query: req.validated.query });
    }),
  );

  it('accepts valid input and exposes coerced values', async () => {
    const res = await request(app)
      .post('/users?page=3')
      .send({ email: 'a@b.com', age: 30, extra: 'stripped' });
    expect(res.status).toBe(200);
    expect(res.body.data.body).toEqual({ email: 'a@b.com', age: 30 });
    expect(res.body.data.query).toEqual({ page: 3 });
  });

  it('applies defaults', async () => {
    const res = await request(app).post('/users').send({ email: 'a@b.com', age: 30 });
    expect(res.body.data.query).toEqual({ page: 1 });
  });

  it('returns every problem with its location and path', async () => {
    const res = await request(app).post('/users?page=0').send({ email: 'nope', age: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map(
      (d: { location: string; path: string }) => `${d.location}.${d.path}`,
    );
    expect(paths).toEqual(expect.arrayContaining(['query.page', 'body.email', 'body.age']));
  });
});

describe('input sanitization', () => {
  const app = createTestApp((r) => r.post('/login', (_req, res) => sendSuccess(res, { ok: true })));

  it('rejects NoSQL operator injection in the body', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects operators in the query string', async () => {
    const res = await request(app).post('/login?email[$gt]=').send({});
    expect(res.status).toBe(400);
  });

  it('rejects prototype pollution attempts', async () => {
    const res = await request(app)
      .post('/login')
      .set('content-type', 'application/json')
      .send('{"__proto__":{"admin":true}}');
    expect(res.status).toBe(400);
  });

  it('allows normal payloads', async () => {
    const res = await request(app).post('/login').send({ email: 'a@b.com', password: 'secret' });
    expect(res.status).toBe(200);
  });
});
