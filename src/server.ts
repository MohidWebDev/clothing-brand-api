import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeEmailQueue } from './jobs/queues/email.queue';
import { startEmailWorker } from './jobs/workers/email.worker';

async function main() {
  await connectDB();

  // Without REDIS_URL there is no worker: emails are delivered inline instead.
  const emailWorker = startEmailWorker();
  if (emailWorker) logger.info('Email worker started');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await emailWorker?.close().catch((err) => logger.error({ err }, 'Error closing worker'));
      await closeEmailQueue().catch((err) => logger.error({ err }, 'Error closing queue'));
      await disconnectDB().catch((err) => logger.error({ err }, 'Error closing MongoDB'));
      process.exit(0);
    });
    // Do not hang forever on stuck connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
