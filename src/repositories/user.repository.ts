import type { Types } from 'mongoose';
import { type IUser, User, type UserDocument } from '../models';

/** Soft-deleted users are excluded from every query here. */
const alive = { deletedAt: null };

export const userRepository = {
  create: (data: Pick<IUser, 'name' | 'email' | 'passwordHash' | 'role'> & Partial<IUser>) =>
    User.create(data),

  findById: (id: string | Types.ObjectId): Promise<UserDocument | null> =>
    User.findOne({ _id: id, ...alive }),

  /** Includes the role document, for permission checks. */
  findByIdWithRole: (id: string | Types.ObjectId) =>
    User.findOne({ _id: id, ...alive }).populate<{
      role: { name: string; permissions: string[] };
    }>('role', 'name permissions'),

  /** Includes passwordHash, which is excluded by default. */
  findByEmailWithPassword: (email: string): Promise<UserDocument | null> =>
    User.findOne({ email, ...alive }).select('+passwordHash'),

  findByIdWithPassword: (id: string | Types.ObjectId): Promise<UserDocument | null> =>
    User.findOne({ _id: id, ...alive }).select('+passwordHash'),

  findByEmail: (email: string): Promise<UserDocument | null> => User.findOne({ email, ...alive }),

  /** Includes soft-deleted users: their email stays reserved. */
  emailExists: async (email: string) => (await User.exists({ email })) !== null,

  recordFailedLogin: (id: Types.ObjectId) =>
    User.findByIdAndUpdate(id, { $inc: { failedLoginAttempts: 1 } }, { returnDocument: 'after' }),

  lockAccount: (id: Types.ObjectId, until: Date) =>
    User.updateOne({ _id: id }, { $set: { lockUntil: until, failedLoginAttempts: 0 } }),

  recordSuccessfulLogin: (id: Types.ObjectId) =>
    User.updateOne(
      { _id: id },
      { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } },
    ),

  markEmailVerified: (id: Types.ObjectId) =>
    User.updateOne({ _id: id }, { $set: { isEmailVerified: true } }),

  /** Returns the new passwordChangedAt, which is the version access tokens are tied to. */
  updatePassword: async (id: Types.ObjectId, passwordHash: string): Promise<Date> => {
    const passwordChangedAt = new Date();
    await User.updateOne(
      { _id: id },
      {
        $set: { passwordHash, passwordChangedAt, failedLoginAttempts: 0 },
        $unset: { lockUntil: 1 },
      },
    );
    return passwordChangedAt;
  },
};
