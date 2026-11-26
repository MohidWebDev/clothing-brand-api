import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  /** Normalised to +923XXXXXXXXX. */
  phone?: string;
  passwordHash: string;
  role: Types.ObjectId;
  isEmailVerified: boolean;
  isActive: boolean;
  failedLoginAttempts: number;
  lockUntil?: Date;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  /** Soft delete marker: deleted users are hidden everywhere but kept for order history. */
  deletedAt?: Date | null;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        delete ret.deletedAt;
        return ret;
      },
    },
  },
);

export const User = model<IUser>('User', userSchema);
