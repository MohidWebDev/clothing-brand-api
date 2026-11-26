import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

export interface IRefreshToken {
  user: Types.ObjectId;
  /** SHA-256 of the opaque token. The raw token only ever lives in the cookie. */
  tokenHash: string;
  /** All tokens descended from one login share a family, so theft can revoke the lot. */
  family: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBy?: Types.ObjectId;
  userAgent?: string;
  ip?: string;
}

export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken' },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);

// MongoDB removes expired documents automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
