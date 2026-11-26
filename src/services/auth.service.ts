import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { ROLES } from '../constants';
import {
  VERIFICATION_TOKEN_TYPE,
  type RoleDocument,
  type UserDocument,
  type VerificationTokenType,
} from '../models';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { roleRepository } from '../repositories/role.repository';
import { userRepository } from '../repositories/user.repository';
import { verificationTokenRepository } from '../repositories/verificationToken.repository';
import type { RegisterBody } from '../validators/auth.validators';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../utils/password';
import { generateOpaqueToken, hashToken, signAccessToken } from '../utils/tokens';
import { emailService } from './email.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A refresh token that was rotated moments ago may legitimately be presented again (two tabs
 * refreshing at once). Within this window we just refuse it; after it, reuse means theft and
 * the whole token family is revoked.
 */
const REUSE_GRACE_MS = 10_000;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  permissions: string[];
  isEmailVerified: boolean;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  tokens: SessionTokens;
}

type UserLike = Pick<
  UserDocument,
  '_id' | 'name' | 'email' | 'phone' | 'isEmailVerified' | 'createdAt'
>;

export function toPublicUser(
  user: UserLike,
  role: { name: string; permissions: readonly string[] },
): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    ...(user.phone && { phone: user.phone }),
    role: role.name,
    permissions: [...role.permissions],
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt ?? new Date(),
  };
}

async function issueSession(
  userId: Types.ObjectId,
  meta: RequestMeta,
  passwordChangedAt?: Date | null,
  family: string = randomUUID(),
) {
  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY);

  const stored = await refreshTokenRepository.create({
    user: userId,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: refreshExpiresAt,
    ...(meta.userAgent && { userAgent: meta.userAgent.slice(0, 300) }),
    ...(meta.ip && { ip: meta.ip }),
  });

  const tokens: SessionTokens = {
    accessToken: signAccessToken(String(userId), passwordChangedAt),
    refreshToken,
    refreshExpiresAt,
  };
  return { tokens, tokenId: stored._id };
}

async function createVerificationToken(
  userId: Types.ObjectId,
  type: VerificationTokenType,
  ttlMs: number,
): Promise<string> {
  await verificationTokenRepository.invalidateOutstanding(userId, type);
  const token = generateOpaqueToken();
  await verificationTokenRepository.create({
    user: userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

const invalidCredentials = () => ApiError.unauthorized('Invalid email or password');

export const authService = {
  async register(input: RegisterBody, meta: RequestMeta): Promise<AuthResult> {
    const role = await roleRepository.findByName(ROLES.CUSTOMER);
    if (!role) throw ApiError.internal('Roles have not been seeded');

    if (await userRepository.emailExists(input.email)) {
      throw ApiError.conflict('An account with this email already exists', [
        { location: 'body', path: 'email', message: 'Already registered' },
      ]);
    }

    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: role._id,
      ...(input.phone && { phone: input.phone }),
    });

    const token = await createVerificationToken(
      user._id,
      VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      env.EMAIL_VERIFY_TTL_HOURS * HOUR,
    );
    await emailService.sendVerificationEmail(user, token);

    const { tokens } = await issueSession(user._id, meta, user.passwordChangedAt);
    return { user: toPublicUser(user, role), tokens };
  },

  async login(email: string, password: string, meta: RequestMeta): Promise<AuthResult> {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      // Same work and same message as a wrong password, so accounts cannot be enumerated.
      await verifyDummyPassword(password);
      throw invalidCredentials();
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      throw ApiError.locked(
        'Too many failed attempts. Your account is temporarily locked, try again later or reset your password.',
      );
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const updated = await userRepository.recordFailedLogin(user._id);
      if (updated && updated.failedLoginAttempts >= env.LOGIN_MAX_ATTEMPTS) {
        await userRepository.lockAccount(
          user._id,
          new Date(Date.now() + env.LOGIN_LOCK_MINUTES * MINUTE),
        );
      }
      throw invalidCredentials();
    }

    if (!user.isActive) throw ApiError.forbidden('Your account has been disabled');

    const role = await roleRepository.findById(user.role);
    if (!role) throw ApiError.internal('User role is missing');

    await userRepository.recordSuccessfulLogin(user._id);
    const { tokens } = await issueSession(user._id, meta, user.passwordChangedAt);
    return { user: toPublicUser(user, role), tokens };
  },

  /** Exchanges a refresh token for a new pair, rotating it and detecting reuse. */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<AuthResult> {
    if (!rawToken) throw ApiError.unauthorized('Refresh token missing');

    const stored = await refreshTokenRepository.findByHash(hashToken(rawToken));
    if (!stored) throw ApiError.unauthorized('Invalid refresh token');

    if (stored.revokedAt) {
      if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        await refreshTokenRepository.revokeFamily(stored.family);
      }
      throw ApiError.unauthorized('Invalid refresh token');
    }
    if (stored.expiresAt <= new Date()) throw ApiError.unauthorized('Refresh token expired');

    const user = await userRepository.findByIdWithRole(stored.user);
    if (!user || !user.isActive) {
      await refreshTokenRepository.revokeFamily(stored.family);
      throw ApiError.unauthorized('Invalid refresh token');
    }

    // Atomic: only one concurrent request can rotate this token.
    const revoked = await refreshTokenRepository.revokeIfActive(stored._id);
    if (!revoked) throw ApiError.unauthorized('Invalid refresh token');

    const { tokens, tokenId } = await issueSession(
      user._id,
      meta,
      user.passwordChangedAt,
      stored.family,
    );
    await refreshTokenRepository.linkReplacement(stored._id, tokenId);
    return { user: toPublicUser(user, user.role), tokens };
  },

  /** Ends the session this refresh token belongs to. Always succeeds. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await refreshTokenRepository.findByHash(hashToken(rawToken));
    if (stored) await refreshTokenRepository.revokeFamily(stored.family);
  },

  async logoutAll(userId: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (user) await refreshTokenRepository.revokeAllForUser(user._id);
  },

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await userRepository.findByIdWithRole(userId);
    if (!user) throw ApiError.unauthorized();
    return toPublicUser(user, user.role);
  },

  /** Idempotent: using the same link twice (or a double-fired effect) still succeeds. */
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const consumed = await verificationTokenRepository.consume(
      tokenHash,
      VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    );

    if (!consumed) {
      const used = await verificationTokenRepository.findByHash(
        tokenHash,
        VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      );
      const owner = used?.usedAt ? await userRepository.findById(used.user) : null;
      if (owner?.isEmailVerified) return;
      throw ApiError.badRequest('This verification link is invalid or has expired');
    }

    await userRepository.markEmailVerified(consumed.user);
  },

  async resendVerification(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.unauthorized();
    if (user.isEmailVerified) return { alreadyVerified: true };

    const token = await createVerificationToken(
      user._id,
      VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      env.EMAIL_VERIFY_TTL_HOURS * HOUR,
    );
    await emailService.sendVerificationEmail(user, token);
    return { alreadyVerified: false };
  },

  /** Never reveals whether the email is registered. */
  async forgotPassword(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) return;

    const token = await createVerificationToken(
      user._id,
      VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
      env.PASSWORD_RESET_TTL_MINUTES * MINUTE,
    );
    await emailService.sendPasswordResetEmail(user, token);
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const consumed = await verificationTokenRepository.consume(
      hashToken(rawToken),
      VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
    );
    if (!consumed) throw ApiError.badRequest('This reset link is invalid or has expired');

    const user = await userRepository.findById(consumed.user);
    if (!user || !user.isActive)
      throw ApiError.badRequest('This reset link is invalid or has expired');

    await userRepository.updatePassword(user._id, await hashPassword(newPassword));
    await refreshTokenRepository.revokeAllForUser(user._id);
    await verificationTokenRepository.invalidateOutstanding(
      user._id,
      VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
    );
    await emailService.sendPasswordChangedEmail(user);
  },

  /** Signs out every device and starts a fresh session for the caller. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) throw ApiError.unauthorized();

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw ApiError.validation([
        { location: 'body', path: 'currentPassword', message: 'Current password is incorrect' },
      ]);
    }
    if (currentPassword === newPassword) {
      throw ApiError.validation([
        {
          location: 'body',
          path: 'newPassword',
          message: 'New password must be different from the current one',
        },
      ]);
    }

    const changedAt = await userRepository.updatePassword(
      user._id,
      await hashPassword(newPassword),
    );
    await refreshTokenRepository.revokeAllForUser(user._id);
    await emailService.sendPasswordChangedEmail(user);

    const role = (await roleRepository.findById(user.role)) as RoleDocument;
    const { tokens } = await issueSession(user._id, meta, changedAt);
    return { user: toPublicUser(user, role), tokens };
  },
};
