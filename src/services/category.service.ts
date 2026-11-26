import { Types } from 'mongoose';
import { MAX_CATEGORY_DEPTH } from '../constants';
import { categoryRepository } from '../repositories/category.repository';
import { productRepository } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import {
  type FlatCategory,
  buildCategoryTree,
  depthOf,
  descendantIds,
} from '../utils/categoryTree';
import { uniqueSlug } from '../utils/slug';
import type { CreateCategoryBody, UpdateCategoryBody } from '../validators/catalog.validators';
import { toCategory } from './catalogMapper';
import { deleteRemovedImages } from './imageCleanup';

const flatten = (categories: Awaited<ReturnType<typeof categoryRepository.listAll>>) =>
  categories.map((c) => ({ ...toCategory(c), parent: c.parent ? String(c.parent) : null }));

const invalidParent = (message: string) =>
  ApiError.validation([{ location: 'body', path: 'parent', message }]);

/** Checks a parent choice: it must exist, not create a cycle, and not nest too deeply. */
async function assertValidParent(parentId: string, selfId?: string) {
  const all = (await categoryRepository.listAll(false)).map((c) => ({
    id: String(c._id),
    parent: c.parent ? String(c.parent) : null,
    name: c.name,
    sortOrder: c.sortOrder,
  })) satisfies FlatCategory[];

  if (!all.some((c) => c.id === parentId)) throw invalidParent('Parent category not found');

  if (selfId) {
    if (descendantIds(all, selfId).includes(parentId)) {
      throw invalidParent('A category cannot be moved under itself or its own subcategory');
    }
    // Depth of the deepest branch under the category being moved.
    const subtreeDepth = Math.max(
      ...descendantIds(all, selfId).map((id) => depthOf(all, id) - depthOf(all, selfId) + 1),
    );
    if (depthOf(all, parentId) + subtreeDepth > MAX_CATEGORY_DEPTH) {
      throw invalidParent(`Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`);
    }
  } else if (depthOf(all, parentId) + 1 > MAX_CATEGORY_DEPTH) {
    throw invalidParent(`Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`);
  }
}

const duplicateName = () =>
  ApiError.conflict('A category with this name already exists here', [
    { location: 'body', path: 'name', message: 'Already in use' },
  ]);

export const categoryService = {
  /** Nested tree of active categories for navigation menus. */
  async tree() {
    return buildCategoryTree(flatten(await categoryRepository.listAll(true)));
  },

  async listAdmin() {
    return buildCategoryTree(flatten(await categoryRepository.listAll(false)));
  },

  async getBySlug(slug: string) {
    const category = await categoryRepository.findBySlug(slug);
    if (!category) throw ApiError.notFound('Category not found');
    const all = flatten(await categoryRepository.listAll(true));
    const self = all.find((c) => c.id === String(category._id))!;
    return {
      ...self,
      children: all.filter((c) => c.parent === self.id),
      ancestors: ancestorsOf(all, self.id),
    };
  },

  /** Ids of a category and all its subcategories, for "show everything under Men". */
  async resolveSlugToIds(slug: string): Promise<string[] | null> {
    const category = await categoryRepository.findBySlug(slug);
    if (!category) return null;
    const all = flatten(await categoryRepository.listAll(true));
    return descendantIds(all, String(category._id));
  },

  async create(input: CreateCategoryBody) {
    const parent = input.parent ?? null;
    if (parent) await assertValidParent(parent);
    if (await categoryRepository.findByName(input.name, parent)) throw duplicateName();

    const category = await categoryRepository.create({
      ...input,
      parent: parent ? new Types.ObjectId(parent) : null,
      slug: await uniqueSlug(input.name, categoryRepository.slugExists),
    });
    return toCategory(category);
  },

  async update(id: string, input: UpdateCategoryBody) {
    const category = await categoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    const nextParent =
      input.parent === undefined
        ? category.parent
          ? String(category.parent)
          : null
        : input.parent;
    const nextName = input.name ?? category.name;

    if (
      input.parent !== undefined &&
      nextParent !== (category.parent ? String(category.parent) : null)
    ) {
      if (nextParent) await assertValidParent(nextParent, id);
    }
    if (
      (input.name !== undefined || input.parent !== undefined) &&
      (await categoryRepository.findByName(nextName, nextParent, id))
    ) {
      throw duplicateName();
    }

    const previousImage = category.image ? [category.image] : [];

    category.name = nextName;
    if (input.parent !== undefined)
      category.parent = nextParent ? new Types.ObjectId(nextParent) : null;
    if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.description !== undefined) category.description = input.description ?? undefined;
    if (input.image !== undefined) category.image = input.image ?? undefined;
    await category.save();

    await deleteRemovedImages(previousImage, category.image ? [category.image] : []);
    return toCategory(category);
  },

  async remove(id: string) {
    const category = await categoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    if (await categoryRepository.hasChildren(id)) {
      throw ApiError.conflict('This category has subcategories. Move or delete them first.');
    }
    const products = await productRepository.countByCategories([id]);
    if (products > 0) {
      throw ApiError.conflict(
        `This category contains ${products} product${products === 1 ? '' : 's'}. Move them first.`,
      );
    }
    await categoryRepository.softDelete(id);
  },
};

function ancestorsOf(
  all: { id: string; parent: string | null; name: string; slug: string }[],
  id: string,
) {
  const byId = new Map(all.map((c) => [c.id, c]));
  const chain: { id: string; name: string; slug: string }[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parent ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    chain.unshift({ id: node.id, name: node.name, slug: node.slug });
    current = node.parent;
  }
  return chain;
}
