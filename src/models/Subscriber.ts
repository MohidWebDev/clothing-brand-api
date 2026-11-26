import { type HydratedDocument, Schema, model } from 'mongoose';

export const SUBSCRIBER_SOURCES = ['newsletter', 'vip'] as const;
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number];

export interface ISubscriber {
  email: string;
  name?: string;
  city?: string;
  /** Every form this person has used, e.g. ["newsletter", "vip"]. */
  sources: SubscriberSource[];
  subscribedAt: Date;
  unsubscribedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SubscriberDocument = HydratedDocument<ISubscriber>;

const subscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, maxlength: 100 },
    city: { type: String, trim: true, maxlength: 60 },
    sources: { type: [String], enum: SUBSCRIBER_SOURCES, default: [] },
    subscribedAt: { type: Date, required: true, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
