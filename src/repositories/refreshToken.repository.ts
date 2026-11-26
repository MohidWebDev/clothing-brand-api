import type { Types } from 'mongoose';
import { type IRefreshToken, RefreshToken, type RefreshTokenDocument } from '../models';

export const refreshTokenRepository = {
  create: (
    data: Pick<IRefreshToken, 'user' | 'tokenHash' | 'family' | 'expiresAt'> &
      Partial<IRefreshToken>,
  ) => RefreshToken.create(data),

  findByHash: (tokenHash: string): Promise<RefreshTokenDocument | null> =>
    RefreshToken.findOne({ tokenHash }),

  /**
   * Atomically revokes a token that is still active. Returns null if someone else already
   * revoked it, which makes concurrent refreshes with the same token safe.
   */
  revokeIfActive: (id: Types.ObjectId, replacedBy?: Types.ObjectId) =>
    RefreshToken.findOneAndUpdate(
      { _id: id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), ...(replacedBy && { replacedBy }) } },
      { new: true },
    ),

  linkReplacement: (id: Types.ObjectId, replacedBy: Types.ObjectId) =>
    RefreshToken.updateOne({ _id: id }, { $set: { replacedBy } }),

  revokeFamily: (family: string) =>
    RefreshToken.updateMany(
      { family, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ),

  revokeAllForUser: (user: Types.ObjectId, exceptFamily?: string) =>
    RefreshToken.updateMany(
      {
        user,
        revokedAt: { $exists: false },
        ...(exceptFamily && { family: { $ne: exceptFamily } }),
      },
      { $set: { revokedAt: new Date() } },
    ),
};
