import { describe, expect, it } from 'vitest';
import {
  ALL_ORDER_STATUSES,
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ORDER_STATUS,
  PERMISSIONS,
  ROLES,
  SUPER_ADMIN_ONLY,
  canTransitionOrder,
} from '../../src/constants';

describe('permissions and roles', () => {
  it('has unique permissions in resource:action form', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+:[a-z_]+$/);
  });

  it('defines permissions for every role', () => {
    for (const role of ALL_ROLES) expect(DEFAULT_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
  });

  it('gives super admin every permission', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
  });

  it('keeps super-admin-only permissions away from every other role', () => {
    for (const role of ALL_ROLES.filter((r) => r !== ROLES.SUPER_ADMIN)) {
      for (const p of SUPER_ADMIN_ONLY) expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain(p);
    }
  });

  it('makes admin a superset of staff and inventory manager', () => {
    const admin = DEFAULT_ROLE_PERMISSIONS[ROLES.ADMIN];
    for (const role of [ROLES.STAFF, ROLES.INVENTORY_MANAGER]) {
      for (const p of DEFAULT_ROLE_PERMISSIONS[role]) expect(admin).toContain(p);
    }
  });

  it('does not let customers touch other users data or the back office', () => {
    const customer = DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER];
    for (const p of [
      PERMISSIONS.ORDER_READ_ANY,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.ANALYTICS_READ,
    ]) {
      expect(customer).not.toContain(p);
    }
  });
});

describe('order status machine', () => {
  it('allows the happy path', () => {
    const path = [
      ORDER_STATUS.PLACED,
      ORDER_STATUS.PAID,
      ORDER_STATUS.PACKED,
      ORDER_STATUS.SHIPPED,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.RETURNED,
      ORDER_STATUS.REFUNDED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionOrder(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('allows COD orders to be packed before payment', () => {
    expect(canTransitionOrder(ORDER_STATUS.PLACED, ORDER_STATUS.PACKED)).toBe(true);
  });

  it('blocks skipping and moving backwards', () => {
    expect(canTransitionOrder(ORDER_STATUS.PLACED, ORDER_STATUS.DELIVERED)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.SHIPPED, ORDER_STATUS.PACKED)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED)).toBe(false);
  });

  it('treats refunded and cancelled as terminal', () => {
    for (const to of ALL_ORDER_STATUSES) {
      expect(canTransitionOrder(ORDER_STATUS.REFUNDED, to)).toBe(false);
      expect(canTransitionOrder(ORDER_STATUS.CANCELLED, to)).toBe(false);
    }
  });
});
