import { z } from 'zod';
import { SUBSCRIBER_SOURCES } from '../models';

export const subscribeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  name: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(60).optional(),
  source: z.enum(SUBSCRIBER_SOURCES).default('newsletter'),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).optional(),
});

export type SubscribeBody = z.infer<typeof subscribeBody>;
