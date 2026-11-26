/**
 * Fulfilment lifecycle of an order:
 * placed -> paid -> packed -> shipped -> delivered -> returned -> refunded
 *
 * Cash on Delivery (the dominant method in Pakistan) is paid at the door, so a COD order
 * may go placed -> packed directly. Orders paid through PayFast must be `paid` before
 * `packed`; that rule lives in the order service, which knows the payment method.
 */
export const ORDER_STATUS = {
  PLACED: 'placed',
  PAID: 'paid',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ALL_ORDER_STATUSES: readonly OrderStatus[] = Object.values(ORDER_STATUS);

const S = ORDER_STATUS;

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [S.PLACED]: [S.PAID, S.PACKED, S.CANCELLED],
  [S.PAID]: [S.PACKED, S.CANCELLED],
  [S.PACKED]: [S.SHIPPED, S.CANCELLED],
  [S.SHIPPED]: [S.DELIVERED],
  [S.DELIVERED]: [S.RETURNED],
  [S.RETURNED]: [S.REFUNDED],
  [S.REFUNDED]: [],
  [S.CANCELLED]: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export const PAYMENT_METHOD = {
  COD: 'cod',
  PAYFAST: 'payfast',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const CURRENCY = 'PKR';
