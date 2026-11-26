import type { Types } from 'mongoose';
import { Brand, type BrandDocument, type IBrand } from '../models';
import { escapeRegex } from '../utils/regex';

const alive = { deletedAt: null };

export const brandRepository = {
  create: (data: Pick<IBrand, 'name' | 'slug'> & Partial<IBrand>) => Brand.create(data),

  findById: (id: string | Types.ObjectId): Promise<BrandDocument | null> =>
    Brand.findOne({ _id: id, ...alive }),

  findByIds: (ids: Types.ObjectId[]) => Brand.find({ _id: { $in: ids } }),

  findBySlugs: (slugs: string[]) => Brand.find({ slug: { $in: slugs }, isActive: true, ...alive }),

  /** Case-insensitive name match among live brands, optionally ignoring one brand (rename). */
  findByName: (name: string, excludeId?: string): Promise<BrandDocument | null> =>
    Brand.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      ...alive,
      ...(excludeId && { _id: { $ne: excludeId } }),
    }),

  /** Slugs of deleted brands stay reserved so old URLs never point at a different brand. */
  slugExists: async (slug: string) => (await Brand.exists({ slug })) !== null,

  list: (activeOnly: boolean): Promise<BrandDocument[]> =>
    Brand.find({ ...alive, ...(activeOnly && { isActive: true }) }).sort({ name: 1 }),

  softDelete: (id: string | Types.ObjectId) =>
    Brand.updateOne({ _id: id }, { $set: { deletedAt: new Date(), isActive: false } }),
};
