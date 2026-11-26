import { ALL_PERMISSIONS, PERMISSIONS as P, type Permission } from './permissions';

/**
 * "Guest" is not a stored role: it is simply an unauthenticated request.
 * Roles are stored in the database (Phase 2); the map below provides the defaults
 * used to seed them.
 */
export const ROLES = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  INVENTORY_MANAGER: 'inventory_manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly RoleName[] = Object.values(ROLES);

const CUSTOMER_PERMISSIONS: Permission[] = [
  P.PROFILE_UPDATE_OWN,
  P.CART_MANAGE_OWN,
  P.WISHLIST_MANAGE_OWN,
  P.ORDER_CREATE,
  P.ORDER_READ_OWN,
  P.ORDER_CANCEL_OWN,
  P.RETURN_CREATE,
  P.REVIEW_CREATE,
  P.TICKET_CREATE,
  P.TICKET_READ_OWN,
];

const STAFF_PERMISSIONS: Permission[] = [
  P.PROFILE_UPDATE_OWN,
  P.ORDER_READ_ANY,
  P.ORDER_UPDATE_STATUS,
  P.ORDER_REFUND,
  P.RETURN_READ_ANY,
  P.RETURN_PROCESS,
  P.REVIEW_MODERATE,
  P.TICKET_READ_ANY,
  P.TICKET_REPLY,
  P.TICKET_CLOSE,
  P.INVENTORY_READ,
];

const INVENTORY_MANAGER_PERMISSIONS: Permission[] = [
  P.PROFILE_UPDATE_OWN,
  P.PRODUCT_CREATE,
  P.PRODUCT_UPDATE,
  P.PRODUCT_DELETE,
  P.PRODUCT_IMPORT,
  P.CATEGORY_MANAGE,
  P.BRAND_MANAGE,
  P.INVENTORY_READ,
  P.INVENTORY_UPDATE,
];

const SUPER_ADMIN_ONLY: Permission[] = [P.ADMIN_MANAGE, P.SYSTEM_CONFIGURE];

const ADMIN_PERMISSIONS: Permission[] = [
  ...new Set<Permission>([
    ...STAFF_PERMISSIONS,
    ...INVENTORY_MANAGER_PERMISSIONS,
    P.USER_READ,
    P.USER_UPDATE,
    P.USER_DELETE,
    P.USER_ASSIGN_ROLE,
    P.ROLE_MANAGE,
    P.COUPON_MANAGE,
    P.CONTENT_MANAGE,
    P.SETTINGS_READ,
    P.SETTINGS_UPDATE,
    P.ANALYTICS_READ,
    P.REPORT_EXPORT,
    P.AUDIT_READ,
  ]),
];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  [ROLES.CUSTOMER]: CUSTOMER_PERMISSIONS,
  [ROLES.STAFF]: STAFF_PERMISSIONS,
  [ROLES.INVENTORY_MANAGER]: INVENTORY_MANAGER_PERMISSIONS,
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,
};

export { SUPER_ADMIN_ONLY };
