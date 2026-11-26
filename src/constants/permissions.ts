/**
 * Fine-grained permissions in `resource:action` form. Routes check permissions,
 * never role names, so new roles can be added without touching route code.
 */
export const PERMISSIONS = {
  // Customer self-service
  PROFILE_UPDATE_OWN: 'profile:update_own',
  CART_MANAGE_OWN: 'cart:manage_own',
  WISHLIST_MANAGE_OWN: 'wishlist:manage_own',
  ORDER_CREATE: 'order:create',
  ORDER_READ_OWN: 'order:read_own',
  ORDER_CANCEL_OWN: 'order:cancel_own',
  RETURN_CREATE: 'return:create',
  REVIEW_CREATE: 'review:create',
  TICKET_CREATE: 'ticket:create',
  TICKET_READ_OWN: 'ticket:read_own',

  // Orders, returns and support (staff)
  ORDER_READ_ANY: 'order:read_any',
  ORDER_UPDATE_STATUS: 'order:update_status',
  ORDER_REFUND: 'order:refund',
  RETURN_READ_ANY: 'return:read_any',
  RETURN_PROCESS: 'return:process',
  REVIEW_MODERATE: 'review:moderate',
  TICKET_READ_ANY: 'ticket:read_any',
  TICKET_REPLY: 'ticket:reply',
  TICKET_CLOSE: 'ticket:close',

  // Catalog and inventory
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_IMPORT: 'product:import',
  CATEGORY_MANAGE: 'category:manage',
  BRAND_MANAGE: 'brand:manage',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_UPDATE: 'inventory:update',

  // Admin
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_ASSIGN_ROLE: 'user:assign_role',
  ROLE_MANAGE: 'role:manage',
  COUPON_MANAGE: 'coupon:manage',
  CONTENT_MANAGE: 'content:manage',
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',
  ANALYTICS_READ: 'analytics:read',
  REPORT_EXPORT: 'report:export',
  AUDIT_READ: 'audit:read',

  // Super admin only
  ADMIN_MANAGE: 'admin:manage',
  SYSTEM_CONFIGURE: 'system:configure',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);
