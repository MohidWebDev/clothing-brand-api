import { Worker } from 'bullmq';
import { getRedisConnection } from '../../config/redis';
import { logger } from '../../config/logger';
import { deliverEmail } from '../../services/mailer.service';
import type { EmailJob } from '../../templates/emails';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue';

/** Starts the email worker, or returns null when Redis is not configured. */
export function startEmailWorker(): Worker<EmailJob> | null {
  const connection = getRedisConnection();
  if (!connection) return null;

  const worker = new Worker<EmailJob>(EMAIL_QUEUE_NAME, (job) => deliverEmail(job.data), {
    connection,
    concurrency: 5,
  });

  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id, template: job?.data.template }, 'Email job failed'),
  );
  worker.on('error', (err) => logger.error({ err }, 'Email worker error'));
  return worker;
}
