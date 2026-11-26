import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/middlewares/rateLimiter';
import { sendSuccess } from '../../src/utils/apiResponse';
import { createTestApp } from '../helpers/createTestApp';

describe('rate limiter', () => {
  it('returns 429 in the error envelope once the limit is exceeded', async () => {
    const app = createTestApp((r) => {
      r.use(createRateLimiter({ windowMs: 60_000, limit: 2, message: 'Slow down' }));
      r.get('/ping', (_req, res) => sendSuccess(res, { pong: true }));
    });

    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);

    const blocked = await request(app).get('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: 'Slow down' });
    expect(blocked.headers['ratelimit']).toBeTruthy();
  });
});
