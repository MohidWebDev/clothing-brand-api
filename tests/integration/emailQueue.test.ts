import { afterAll, describe, expect, it, vi } from 'vitest';

// Needs a real Redis. Runs in CI (REDIS_URL_TEST is set there) and locally when provided.
describe.skipIf(!process.env.REDIS_URL_TEST)('email queue (BullMQ + Redis)', () => {
  afterAll(() => vi.unstubAllEnvs());

  it('delivers a queued email through the worker', async () => {
    vi.stubEnv('REDIS_URL', process.env.REDIS_URL_TEST!);
    vi.resetModules();

    const { enqueueEmail, closeEmailQueue } = await import('../../src/jobs/queues/email.queue.js');
    const { startEmailWorker } = await import('../../src/jobs/workers/email.worker.js');
    const { outbox } = await import('../../src/services/mailer.service.js');

    const worker = startEmailWorker();
    expect(worker).not.toBeNull();

    const to = `queue-${Date.now()}@example.com`;
    await enqueueEmail({
      template: 'password-changed',
      to,
      data: { name: 'Queue Test' },
    });

    await vi.waitFor(() => expect(outbox.some((m) => m.to === to)).toBe(true), {
      timeout: 10_000,
      interval: 100,
    });

    await worker!.close();
    await closeEmailQueue();
  });
});
