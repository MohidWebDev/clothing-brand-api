import type { Types } from 'mongoose';
import { Category, type CategoryDocument, type ICategory } from '../models';
import { escapeRegex } from '../utils/regex';

const alive = { deletedAt: null };

export const categoryRepository = {
  create: (data: Pick<ICategory, 'name' | 'slug'> & Partial<ICategory>) => Category.create(data),

  findById: (id: string | Types.ObjectId): Promise<CategoryDocument | null> =>
    Category.findOne({ _id: id, ...alive }),

  findBySlug: (slug: string): Promise<CategoryDocument | null> =>
    Category.findOne({ slug, isActive: true, ...alive }),

  findByName: (name: string, parent: string | null, excludeId?: string) =>
    Category.findOne({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      parent,
      ...alive,
      ...(excludeId && { _id: { $ne: excludeId } }),
    }),

  slugExists: async (slug: string) => (await Category.exists({ slug })) !== null,

  /** The whole set is small, so trees and descendants are computed in memory. */
  listAll: (activeOnly: boolean): Promise<CategoryDocument[]> =>
    Category.find({ ...alive, ...(activeOnly && { isActive: true }) }).sort({
      sortOrder: 1,
      name: 1,
    }),

  hasChildren: async (id: string | Types.ObjectId) =>
    (await Category.exists({ parent: id, ...alive })) !== null,

  softDelete: (id: string | Types.ObjectId) =>
    Category.updateOne({ _id: id }, { $set: { deletedAt: new Date(), isActive: false } }),
};
