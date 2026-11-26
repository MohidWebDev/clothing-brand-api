import type { Request, RequestHandler } from 'express';
import type { Permission } from '../constants';
import { userRepository } from '../repositories/user.repository';
import { ApiError } from '../utils/ApiError';
import { ACCESS_COOKIE } from '../utils/cookies';
import { type AuthUser, hasPermission } from '../utils/ownership';
import { verifyAccessToken } from '../utils/tokens';

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return typeof cookie === 'string' ? cookie : undefined;
}

async function resolveUser(token: string): Promise<AuthUser> {
  const payload = verifyAccessToken(token);

  // Loaded on every request so deactivation and role changes take effect immediately.
  const user = await userRepository.findByIdWithRole(payload.sub);
  if (!user || !user.isActive || !user.role)
    throw ApiError.unauthorized('Invalid or expired token');

  // A password change invalidates every access token issued before it.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role.name,
    permissions: user.role.permissions,
    isEmailVerified: user.isEmailVerified,
  };
}

/** Requires a valid access token (cookie or `Authorization: Bearer`). Sets `req.user`. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  req.user = await resolveUser(token);
  next();
};

/** Attaches `req.user` when a valid token is present, and treats everyone else as a guest. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      // A bad or expired token on a public route simply means "guest".
    }
  }
  next();
};

/** Requires every listed permission. Use after `authenticate`. */
export const authorize =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const user = req.user;
    if (!permissions.every((p) => hasPermission(user, p))) return next(ApiError.forbidden());
    next();
  };

/** Requires at least one of the listed permissions. Use after `authenticate`. */
export const authorizeAny =
  (...permissions: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const user = req.user;
    if (!permissions.some((p) => hasPermission(user, p))) return next(ApiError.forbidden());
    next();
  };

/** For actions such as checkout that need a confirmed email. Use after `authenticate`. */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isEmailVerified) {
    return next(ApiError.forbidden('Please verify your email address to continue'));
  }
  next();
};
