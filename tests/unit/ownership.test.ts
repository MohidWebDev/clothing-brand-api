import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../src/constants';
import { ApiError } from '../../src/utils/ApiError';
import {
  type AuthUser,
  assertOwnerOrPermission,
  canAccessResource,
  hasPermission,
} from '../../src/utils/ownership';

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  name: 'Test',
  email: 't@example.com',
  role: 'customer',
  permissions: [PERMISSIONS.ORDER_READ_OWN],
  isEmailVerified: true,
  ...overrides,
});

describe('ownership checks', () => {
  it('lets owners access their own resources', () => {
    expect(canAccessResource(user(), 'u1', PERMISSIONS.ORDER_READ_ANY)).toBe(true);
  });

  it('blocks other users without the "any" permission', () => {
    expect(canAccessResource(user(), 'u2', PERMISSIONS.ORDER_READ_ANY)).toBe(false);
  });

  it('lets staff with the "any" permission access other users resources', () => {
    const staff = user({ id: 's1', role: 'staff', permissions: [PERMISSIONS.ORDER_READ_ANY] });
    expect(canAccessResource(staff, 'u2', PERMISSIONS.ORDER_READ_ANY)).toBe(true);
  });

  it('answers 404, not 403, so ids cannot be probed', () => {
    try {
      assertOwnerOrPermission(user(), 'u2', PERMISSIONS.ORDER_READ_ANY, 'Order');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(404);
    }
  });

  it('checks permissions', () => {
    expect(hasPermission(user(), PERMISSIONS.ORDER_READ_OWN)).toBe(true);
    expect(hasPermission(user(), PERMISSIONS.USER_DELETE)).toBe(false);
  });
});
