import type { QueryFilter, Types } from 'mongoose';
import { PRODUCT_STATUS } from '../constants';
import type { IProduct } from '../models';

export interface ProductFilterInput {
  q?: string;
  categoryIds?: Types.ObjectId[];
  brandIds?: Types.ObjectId[];
  gender?: string[];
  size?: string[];
  color?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
}

/**
 * Filter for the public storefront: only active, non-deleted products. Pure, so every filter
 * rule can be unit-tested without a database.
 */
export function buildPublicProductFilter(input: ProductFilterInput): QueryFilter<IProduct> {
  const filter: Record<string, unknown> = { status: PRODUCT_STATUS.ACTIVE, deletedAt: null };
  const and: Record<string, unknown>[] = [];

  if (input.q) filter.$text = { $search: input.q };
  if (input.categoryIds?.length) filter.category = { $in: input.categoryIds };
  if (input.brandIds?.length) filter.brand = { $in: input.brandIds };
  if (input.gender?.length) filter.gender = { $in: input.gender };
  if (input.inStock) filter.inStock = true;
  if (input.onSale) filter.onSale = true;

  // A product matches a price range if any of its variants falls inside it.
  if (input.minPrice !== undefined) and.push({ priceMax: { $gte: input.minPrice } });
  if (input.maxPrice !== undefined) and.push({ priceMin: { $lte: input.maxPrice } });
  if (and.length) filter.$and = and;

  // Size and color must match the SAME variant (size M in black), and it must be in stock.
  if (input.size?.length || input.color?.length) {
    filter.variants = {
      $elemMatch: {
        isActive: true,
        stock: { $gt: 0 },
        ...(input.size?.length && { size: { $in: input.size } }),
        ...(input.color?.length && { colorKey: { $in: input.color } }),
      },
    };
  }

  return filter as QueryFilter<IProduct>;
}

export type SortSpec = Record<string, 1 | -1 | { $meta: 'textScore' }>;

/** Every sort ends with _id so pagination order is stable when values tie. */
export function buildProductSort(sort: string | undefined, hasText: boolean): SortSpec {
  const chosen = sort ?? (hasText ? 'relevance' : 'newest');
  switch (chosen) {
    case 'price_asc':
      return { priceMin: 1, _id: 1 };
    case 'price_desc':
      return { priceMin: -1, _id: -1 };
    case 'popular':
      return { soldCount: -1, _id: -1 };
    case 'rating':
      return { ratingAverage: -1, ratingCount: -1, _id: -1 };
    case 'relevance':
      return hasText ? { score: { $meta: 'textScore' }, _id: -1 } : { createdAt: -1, _id: -1 };
    default:
      return { createdAt: -1, _id: -1 };
  }
}

export const usesTextScore = (sort: SortSpec) =>
  Object.values(sort).some((v) => typeof v === 'object');
