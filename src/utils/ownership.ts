import type { Types } from 'mongoose';
import type { Permission } from '../constants';
import { ApiError } from './ApiError';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isEmailVerified: boolean;
}

export const hasPermission = (user: Pick<AuthUser, 'permissions'>, permission: Permission) =>
  user.permissions.includes(permission);

/**
 * Role alone is never enough: a customer may only touch their own resources. A resource is
 * accessible if the user owns it, or holds the "any" permission (e.g. order:read_any).
 */
export function canAccessResource(
  user: AuthUser,
  ownerId: string | Types.ObjectId,
  anyPermission: Permission,
): boolean {
  return String(ownerId) === user.id || hasPermission(user, anyPermission);
}

/**
 * Throws 404 rather than 403 so attackers cannot discover which ids exist (IDOR protection).
 */
export function assertOwnerOrPermission(
  user: AuthUser,
  ownerId: string | Types.ObjectId,
  anyPermission: Permission,
  resourceName = 'Resource',
): void {
  if (!canAccessResource(user, ownerId, anyPermission)) {
    throw ApiError.notFound(`${resourceName} not found`);
  }
}
