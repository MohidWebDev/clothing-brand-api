import type { Types } from 'mongoose';
import {
  VerificationToken,
  type VerificationTokenDocument,
  type VerificationTokenType,
} from '../models';

export const verificationTokenRepository = {
  create: (data: {
    user: Types.ObjectId;
    type: VerificationTokenType;
    tokenHash: string;
    expiresAt: Date;
  }) => VerificationToken.create(data),

  findByHash: (tokenHash: string, type: VerificationTokenType) =>
    VerificationToken.findOne({ tokenHash, type }),

  /** Atomically consumes a valid token, so it can never be used twice. */
  consume: (
    tokenHash: string,
    type: VerificationTokenType,
  ): Promise<VerificationTokenDocument | null> =>
    VerificationToken.findOneAndUpdate(
      { tokenHash, type, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { returnDocument: 'after' },
    ),

  /** Invalidates earlier unused tokens of the same type when a new one is issued. */
  invalidateOutstanding: (user: Types.ObjectId, type: VerificationTokenType) =>
    VerificationToken.updateMany(
      { user, type, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
    ),
};
