import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export type DbStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected';

const STATES: Record<number, DbStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getDbStatus(): DbStatus {
  return STATES[mongoose.connection.readyState] ?? 'disconnected';
}

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  await mongoose.connect(env.MONGODB_URI, {
    // Build indexes automatically in development; in production they are managed deliberately.
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info('MongoDB connected');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
