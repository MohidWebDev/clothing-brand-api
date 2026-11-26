import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

export const VERIFICATION_TOKEN_TYPE = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;

export type VerificationTokenType =
  (typeof VERIFICATION_TOKEN_TYPE)[keyof typeof VERIFICATION_TOKEN_TYPE];

export interface IVerificationToken {
  user: Types.ObjectId;
  type: VerificationTokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export type VerificationTokenDocument = HydratedDocument<IVerificationToken>;

const verificationTokenSchema = new Schema<IVerificationToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(VERIFICATION_TOKEN_TYPE), required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken = model<IVerificationToken>(
  'VerificationToken',
  verificationTokenSchema,
);
