import type { QueryFilter, Types } from 'mongoose';
import { PRODUCT_STATUS } from '../constants';
import { type IProduct, Product, type ProductDocument } from '../models';
import { computeDerived } from '../utils/productDerived';
import { type SortSpec, usesTextScore } from '../utils/productQuery';
import { escapeRegex } from '../utils/regex';

const alive = { deletedAt: null };

export interface ListOptions {
  filter: QueryFilter<IProduct>;
  sort: SortSpec;
  page: number;
  limit: number;
  /** Include the (large) variants array. The public listing leaves it out. */
  withVariants?: boolean;
}

export const productRepository = {
  findById: (id: string | Types.ObjectId): Promise<ProductDocument | null> =>
    Product.findOne({ _id: id, ...alive }),

  findActiveBySlug: (slug: string) =>
    Product.findOne({ slug, status: PRODUCT_STATUS.ACTIVE, ...alive })
      .populate('brand', 'name slug')
      .populate('category', 'name slug')
      .lean(),

  slugExists: async (slug: string) => (await Product.exists({ slug })) !== null,

  /** SKUs are unique across the catalogue (deleted products keep theirs reserved). */
  findProductBySku: (sku: string) => Product.findOne({ 'variants.sku': sku }).select('_id'),

  async list({ filter, sort, page, limit, withVariants = false }: ListOptions) {
    const projection: Record<string, unknown> = withVariants ? {} : { variants: 0 };
    if (usesTextScore(sort)) projection.score = { $meta: 'textScore' };

    const [items, total] = await Promise.all([
      Product.find(filter, projection)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('brand', 'name slug')
        .populate('category', 'name slug')
        .lean(),
      Product.countDocuments(filter),
    ]);
    return { items, total };
  },

  async related(categoryId: Types.ObjectId, excludeId: Types.ObjectId, limit: number) {
    return Product.find(
      { category: categoryId, _id: { $ne: excludeId }, status: PRODUCT_STATUS.ACTIVE, ...alive },
      { variants: 0 },
    )
      .sort({ soldCount: -1, _id: -1 })
      .limit(limit)
      .populate('brand', 'name slug')
      .populate('category', 'name slug')
      .lean();
  },

  /** Word-prefix match on the name, for search-as-you-type. */
  suggest: (query: string, limit: number) =>
    Product.find(
      {
        status: PRODUCT_STATUS.ACTIVE,
        ...alive,
        name: new RegExp(`(^|\\s)${escapeRegex(query)}`, 'i'),
      },
      { name: 1, slug: 1, images: { $slice: 1 }, priceMin: 1 },
    )
      .sort({ soldCount: -1, name: 1 })
      .limit(limit)
      .lean(),

  countByBrand: (brandId: string | Types.ObjectId) =>
    Product.countDocuments({ brand: brandId, ...alive }),

  countByCategories: (categoryIds: (string | Types.ObjectId)[]) =>
    Product.countDocuments({ category: { $in: categoryIds }, ...alive }),

  softDelete: (id: string | Types.ObjectId) =>
    Product.updateOne(
      { _id: id },
      { $set: { deletedAt: new Date(), status: PRODUCT_STATUS.ARCHIVED } },
    ),

  /** Counts per brand, gender, size and color, plus the price range, for the filter sidebar. */
  async facets(filter: QueryFilter<IProduct>) {
    const [result] = await Product.aggregate<{
      brands: { _id: Types.ObjectId; count: number }[];
      genders: { _id: string; count: number }[];
      sizes: { _id: string; count: number }[];
      colors: { _id: string; name: string; hex: string; count: number }[];
      price: { min: number; max: number }[];
    }>([
      { $match: filter },
      {
        $facet: {
          brands: [{ $group: { _id: '$brand', count: { $sum: 1 } } }],
          genders: [{ $group: { _id: '$gender', count: { $sum: 1 } } }],
          sizes: [{ $unwind: '$sizes' }, { $group: { _id: '$sizes', count: { $sum: 1 } } }],
          colors: [
            { $unwind: '$swatches' },
            {
              $group: {
                _id: { $toLower: '$swatches.name' },
                name: { $first: '$swatches.name' },
                hex: { $first: '$swatches.hex' },
                count: { $sum: 1 },
              },
            },
          ],
          price: [
            { $group: { _id: null, min: { $min: '$priceMin' }, max: { $max: '$priceMax' } } },
          ],
        },
      },
    ]);
    return result ?? { brands: [], genders: [], sizes: [], colors: [], price: [] };
  },

  /**
   * Atomically changes a variant's stock by `delta`. The `stock >= -delta` guard is part of the
   * match, so concurrent decrements can never push stock below zero.
   */
  adjustStockGuarded: (productId: string, variantId: string, delta: number) =>
    Product.findOneAndUpdate(
      {
        _id: productId,
        ...alive,
        variants: { $elemMatch: { _id: variantId, stock: { $gte: -delta } } },
      },
      { $inc: { 'variants.$.stock': delta } },
      { returnDocument: 'after' },
    ),

  /** Sets stock only if it still equals what the caller last saw (optimistic concurrency). */
  setStockIfUnchanged: (productId: string, variantId: string, expected: number, next: number) =>
    Product.findOneAndUpdate(
      { _id: productId, ...alive, variants: { $elemMatch: { _id: variantId, stock: expected } } },
      { $set: { 'variants.$.stock': next } },
      { returnDocument: 'after' },
    ),

  /** Recomputes the denormalised fields from the current variants. */
  async refreshDerived(id: string | Types.ObjectId) {
    const product = await Product.findById(id);
    if (!product) return null;
    const derived = computeDerived(product);
    await Product.updateOne({ _id: id }, { $set: derived });
    return derived;
  },

  /** Variants at or below their low-stock threshold, emptiest first. */
  async lowStock(page: number, limit: number) {
    const [result] = await Product.aggregate<{
      rows: Record<string, unknown>[];
      total: { n: number }[];
    }>([
      { $match: { ...alive, status: { $ne: PRODUCT_STATUS.ARCHIVED } } },
      { $unwind: '$variants' },
      {
        $match: {
          'variants.isActive': true,
          $expr: { $lte: ['$variants.stock', '$variants.lowStockThreshold'] },
        },
      },
      { $sort: { 'variants.stock': 1, name: 1, _id: 1 } },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                productId: '$_id',
                name: 1,
                slug: 1,
                variantId: '$variants._id',
                sku: '$variants.sku',
                size: '$variants.size',
                color: '$variants.color',
                stock: '$variants.stock',
                lowStockThreshold: '$variants.lowStockThreshold',
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    return { rows: result?.rows ?? [], total: result?.total[0]?.n ?? 0 };
  },
};
