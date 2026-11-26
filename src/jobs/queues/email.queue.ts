import { Queue } from 'bullmq';
import { getRedisConnection } from '../../config/redis';
import { logger } from '../../config/logger';
import { deliverEmail } from '../../services/mailer.service';
import type { EmailJob } from '../../templates/emails';

export const EMAIL_QUEUE_NAME = 'email';

let queue: Queue<EmailJob> | null | undefined;

/** The email queue, or null when Redis is not configured. */
export function getEmailQueue(): Queue<EmailJob> | null {
  if (queue !== undefined) return queue;
  const connection = getRedisConnection();
  queue = connection
    ? new Queue<EmailJob>(EMAIL_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 3_600, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        },
      })
    : null;
  return queue;
}

/**
 * Queues an email for background delivery. Without Redis (local development, tests) it is
 * delivered inline instead. Failures are logged, never thrown: a broken mail server must not
 * fail a registration or a password reset request.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    const q = getEmailQueue();
    if (q) {
      await q.add(job.template, job);
    } else {
      await deliverEmail(job);
    }
  } catch (err) {
    logger.error({ err, template: job.template }, 'Failed to send or queue email');
  }
}

export async function closeEmailQueue(): Promise<void> {
  if (queue) await queue.close();
  queue = undefined;
}
