export const GENDERS = ['men', 'women', 'unisex', 'boys', 'girls', 'kids'] as const;
export type Gender = (typeof GENDERS)[number];

export const PRODUCT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const STOCK_REASONS = [
  'initial',
  'restock',
  'adjustment',
  'correction',
  'damage',
  'return',
  'sale',
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Display order for letter sizes; numeric and other sizes sort after them. */
export const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'] as const;

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const MAX_VARIANTS_PER_PRODUCT = 100;
export const MAX_IMAGES_PER_PRODUCT = 10;
export const MAX_CATEGORY_DEPTH = 3;
