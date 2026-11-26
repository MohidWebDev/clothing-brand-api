import type { ConnectionOptions } from 'bullmq';
import { env } from './env';

/** BullMQ connection options parsed from REDIS_URL, or null when Redis is not configured. */
export function getRedisConnection(): ConnectionOptions | null {
  if (!env.REDIS_URL) return null;
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === 'rediss:' && { tls: {} }),
  };
}
