import { Subscriber } from '../models';
import type { SubscribeBody } from '../validators/newsletter.validators';

export const newsletterService = {
  /**
   * Idempotent: signing up twice just merges the details. It never reveals whether the address
   * was already on the list, and a filled-in honeypot is silently ignored.
   */
  async subscribe(input: SubscribeBody): Promise<void> {
    if (input.website) return;

    await Subscriber.findOneAndUpdate(
      { email: input.email },
      {
        $set: {
          subscribedAt: new Date(),
          unsubscribedAt: null,
          ...(input.name && { name: input.name }),
          ...(input.city && { city: input.city }),
        },
        $addToSet: { sources: input.source },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  },
};
