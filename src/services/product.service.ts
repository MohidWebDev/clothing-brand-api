import { Types } from 'mongoose';
import { PRODUCT_STATUS, type ProductStatus } from '../constants';
import type { IVariant } from '../models';
import { Product } from '../models';
import { brandRepository } from '../repositories/brand.repository';
import { categoryRepository } from '../repositories/category.repository';
import { productRepository } from '../repositories/product.repository';
import { stockMovementRepository } from '../repositories/stockMovement.repository';
import { ApiError, type ErrorDetail } from '../utils/ApiError';
import { type PaginationMeta } from '../utils/apiResponse';
import { descendantIds } from '../utils/categoryTree';
import { buildPaginationMeta } from '../utils/pagination';
import {
  buildProductSort,
  buildPublicProductFilter,
  type ProductFilterInput,
} from '../utils/productQuery';
import { escapeRegex } from '../utils/regex';
import { compareSizes } from '../utils/sizes';
import { uniqueSlug } from '../utils/slug';
import type {
  AdminProductListQuery,
  CreateProductBody,
  CreateVariantBody,
  ProductFacetsQuery,
  ProductListQuery,
  UpdateProductBody,
  UpdateVariantBody,
} from '../validators/catalog.validators';
import { categoryService } from './category.service';
import { toAdminProduct, toProductCard, toPublicProduct, toSuggestion } from './catalogMapper';
import { deleteRemovedImages } from './imageCleanup';

const oid = (id: string) => new Types.ObjectId(id);

const emptyPage = (query: { page: number; limit: number }) => ({
  items: [],
  meta: buildPaginationMeta(0, query),
});

/** The brand and category must exist and be active before a product can point at them. */
async function assertRefs(brandId?: string, categoryId?: string) {
  const problems: ErrorDetail[] = [];
  if (brandId) {
    const brand = await brandRepository.findById(brandId);
    if (!brand || !brand.isActive) {
      problems.push({ location: 'body', path: 'brand', message: 'Brand not found or inactive' });
    }
  }
  if (categoryId) {
    const category = await categoryRepository.findById(categoryId);
    if (!category || !category.isActive) {
      problems.push({
        location: 'body',
        path: 'category',
        message: 'Category not found or inactive',
      });
    }
  }
  if (problems.length) throw ApiError.validation(problems);
}

/** SKUs are unique across the whole catalogue, not just within one product. */
async function assertSkusFree(skus: string[], ignoreProductId?: string, pathPrefix = 'variants') {
  const problems: ErrorDetail[] = [];
  for (const [i, sku] of skus.entries()) {
    const owner = await productRepository.findProductBySku(sku);
    if (owner && String(owner._id) !== ignoreProductId) {
      problems.push({
        location: 'body',
        path: pathPrefix === 'variants' ? `variants.${i}.sku` : 'sku',
        message: `SKU ${sku} is already used by another product`,
      });
    }
  }
  if (problems.length) throw ApiError.conflict('SKU already in use', problems);
}

function assertCanBeActive(status: ProductStatus | string, variants: readonly IVariant[]) {
  if (status === PRODUCT_STATUS.ACTIVE && !variants.some((v) => v.isActive)) {
    throw ApiError.validation([
      {
        location: 'body',
        path: 'status',
        message: 'Add at least one active variant (size and color) before publishing',
      },
    ]);
  }
}

const initialMovements = (
  productId: Types.ObjectId,
  variants: readonly IVariant[],
  userId?: string,
) =>
  variants
    .filter((v) => v.stock > 0)
    .map((v) => ({
      product: productId,
      variantId: v._id,
      sku: v.sku,
      delta: v.stock,
      balanceAfter: v.stock,
      reason: 'initial' as const,
      ...(userId && { performedBy: oid(userId) }),
    }));

const loadProduct = async (id: string) => {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
};

const findVariant = (product: { variants: IVariant[] }, variantId: string) => {
  const variant = product.variants.find((v) => String(v._id) === variantId);
  if (!variant) throw ApiError.notFound('Variant not found');
  return variant;
};

/**
 * Turns the public filter query into builder input: category and brand slugs become ids.
 * Returns null when a slug matches nothing, meaning the result is empty by definition.
 */
async function resolveFilters(
  query: Omit<ProductFacetsQuery, never> & Partial<Pick<ProductListQuery, 'page' | 'limit'>>,
): Promise<ProductFilterInput | null> {
  const input: ProductFilterInput = {
    q: query.q,
    gender: query.gender,
    fabric: query.fabric,
    size: query.size,
    color: query.color,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock,
    onSale: query.onSale,
  };

  if (query.category) {
    const ids = await categoryService.resolveSlugToIds(query.category);
    if (!ids) return null;
    input.categoryIds = ids.map(oid);
  }

  if (query.brand?.length) {
    const brands = await brandRepository.findBySlugs(query.brand);
    if (!brands.length) return null;
    input.brandIds = brands.map((b) => b._id);
  }
  return input;
}

export const productService = {
  // ------------------------------------------------------------------ public

  async listPublic(query: ProductListQuery) {
    const resolved = await resolveFilters(query);
    if (!resolved) return emptyPage(query);

    const filter = buildPublicProductFilter(resolved);
    const sort = buildProductSort(query.sort, Boolean(query.q));
    const { items, total } = await productRepository.list({
      filter,
      sort,
      page: query.page,
      limit: query.limit,
    });

    return { items: items.map(toProductCard), meta: buildPaginationMeta(total, query) };
  },

  /**
   * Filter options with counts, for the listing sidebar. Accepts the same filters as the
   * listing; each facet ignores its own filter (see productRepository.facets).
   */
  async facets(query: ProductFacetsQuery) {
    const empty = {
      categories: [],
      brands: [],
      genders: [],
      fabrics: [],
      sizes: [],
      colors: [],
      price: null,
    };
    const resolved = await resolveFilters(query);
    if (!resolved) return empty;

    const { q, ...rest } = resolved;
    const scoped = (omit: (keyof ProductFilterInput)[]) => {
      const input: ProductFilterInput = { ...rest };
      for (const key of omit) delete input[key];
      return buildPublicProductFilter(input);
    };

    const raw = await productRepository.facets(buildPublicProductFilter({ q }), {
      category: scoped(['categoryIds']),
      brand: scoped(['brandIds']),
      gender: scoped(['gender']),
      fabric: scoped(['fabric']),
      size: scoped(['size']),
      color: scoped(['color']),
      price: scoped(['minPrice', 'maxPrice']),
    });

    const [brands, categories] = await Promise.all([
      brandRepository.findByIds(raw.brands.map((b) => b._id)),
      categoryService.flatActive(),
    ]);
    const brandById = new Map(brands.map((b) => [String(b._id), b]));

    // Products sit in one category each, so a parent's count is its own plus every descendant's.
    const own = new Map(raw.categories.map((c) => [String(c._id), c.count]));
    const categoryCounts = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parent: c.parent,
      sortOrder: c.sortOrder,
      count: descendantIds(categories, c.id).reduce((sum, id) => sum + (own.get(id) ?? 0), 0),
    }));

    return {
      categories: categoryCounts,
      brands: raw.brands
        .map((b) => ({ brand: brandById.get(String(b._id)), count: b.count }))
        .filter((b) => b.brand && b.brand.isActive)
        .map((b) => ({
          id: String(b.brand!._id),
          name: b.brand!.name,
          slug: b.brand!.slug,
          count: b.count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      genders: raw.genders.map((g) => ({ value: g._id, count: g.count })),
      fabrics: raw.fabrics
        .map((f) => ({ value: f._id, name: f.name, count: f.count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      sizes: raw.sizes
        .map((s) => ({ value: s._id, count: s.count }))
        .sort((a, b) => compareSizes(a.value, b.value)),
      colors: raw.colors
        .map((c) => ({ name: c.name, hex: c.hex, count: c.count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      price: raw.price[0] ? { min: raw.price[0].min, max: raw.price[0].max } : null,
    };
  },

  async suggest(q: string) {
    return (await productRepository.suggest(q, 8)).map(toSuggestion);
  },

  async getPublicBySlug(slug: string) {
    const product = await productRepository.findActiveBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');
    return toPublicProduct(product as never);
  },

  async related(slug: string) {
    const product = await productRepository.findActiveBySlug(slug);
    if (!product) throw ApiError.notFound('Product not found');
    const categoryId = (product.category as { _id: Types.ObjectId })._id;
    const items = await productRepository.related(categoryId, product._id, 8);
    return items.map(toProductCard);
  },

  // ------------------------------------------------------------------- admin

  async listAdmin(
    query: AdminProductListQuery,
  ): Promise<{ items: unknown[]; meta: PaginationMeta }> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = oid(query.category);
    if (query.brand) filter.brand = oid(query.brand);
    if (query.q) {
      const re = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: re }, { 'variants.sku': re }];
    }

    const { items, total } = await productRepository.list({
      filter: filter as never,
      sort: { updatedAt: -1, _id: -1 },
      page: query.page,
      limit: query.limit,
      withVariants: true,
    });
    return { items, meta: buildPaginationMeta(total, query) };
  },

  async getAdmin(id: string) {
    return toAdminProduct(await loadProduct(id));
  },

  async create(input: CreateProductBody, userId?: string) {
    await assertRefs(input.brand, input.category);
    await assertSkusFree(input.variants.map((v) => v.sku));
    assertCanBeActive(input.status, input.variants as never);

    const product = new Product({
      ...input,
      slug: await uniqueSlug(input.name, productRepository.slugExists),
      variants: input.variants.map((v) => ({ ...v, colorKey: v.color.name.toLowerCase() })),
    });
    await product.save();

    await stockMovementRepository.createMany(
      initialMovements(product._id, product.variants, userId),
    );
    return toAdminProduct(product);
  },

  async update(id: string, input: UpdateProductBody) {
    const product = await loadProduct(id);
    await assertRefs(
      input.brand && String(product.brand) !== input.brand ? input.brand : undefined,
      input.category && String(product.category) !== input.category ? input.category : undefined,
    );

    const previousImages = [...product.images];

    if (input.name !== undefined) product.name = input.name;
    if (input.description !== undefined) product.description = input.description;
    if (input.brand !== undefined) product.brand = oid(input.brand);
    if (input.category !== undefined) product.category = oid(input.category);
    if (input.gender !== undefined) product.gender = input.gender;
    if (input.tags !== undefined) product.tags = input.tags;
    if (input.images !== undefined) product.images = input.images as never;
    if (input.price !== undefined) product.price = input.price;
    if (input.fabric !== undefined) product.fabric = input.fabric ?? undefined;
    // null means "clear": store it as unset rather than as a null value.
    if (input.compareAtPrice !== undefined)
      product.compareAtPrice = input.compareAtPrice ?? undefined;
    if (input.metaTitle !== undefined) product.metaTitle = input.metaTitle ?? undefined;
    if (input.metaDescription !== undefined) {
      product.metaDescription = input.metaDescription ?? undefined;
    }
    if (input.status !== undefined) {
      assertCanBeActive(input.status, product.variants);
      product.status = input.status as ProductStatus;
    }

    await product.save();
    await deleteRemovedImages(previousImages, product.images);
    return toAdminProduct(product);
  },

  /** Soft delete: the product disappears from the shop but stays in past orders. */
  async remove(id: string) {
    await loadProduct(id);
    await productRepository.softDelete(id);
  },

  // ---------------------------------------------------------------- variants

  async addVariant(id: string, input: CreateVariantBody, userId?: string) {
    const product = await loadProduct(id);
    await assertSkusFree([input.sku], id, 'sku');

    product.variants.push({
      ...input,
      colorKey: input.color.name.toLowerCase(),
      lowStockThreshold: input.lowStockThreshold ?? 5,
    } as never);
    await product.save();

    const added = product.variants[product.variants.length - 1]!;
    await stockMovementRepository.createMany(initialMovements(product._id, [added], userId));
    return toAdminProduct(product);
  },

  async updateVariant(id: string, variantId: string, input: UpdateVariantBody) {
    const product = await loadProduct(id);
    const variant = findVariant(product, variantId);

    if (input.sku && input.sku !== variant.sku) await assertSkusFree([input.sku], id, 'sku');
    const previousImages = [...variant.images];

    if (input.sku !== undefined) variant.sku = input.sku;
    if (input.size !== undefined) variant.size = input.size;
    if (input.color !== undefined) variant.color = input.color;
    if (input.price !== undefined) variant.price = input.price ?? undefined;
    if (input.lowStockThreshold !== undefined) variant.lowStockThreshold = input.lowStockThreshold;
    if (input.images !== undefined) variant.images = input.images as never;
    if (input.isActive !== undefined) variant.isActive = input.isActive;

    await product.save();
    await deleteRemovedImages(previousImages, variant.images);
    return toAdminProduct(product);
  },

  async removeVariant(id: string, variantId: string) {
    const product = await loadProduct(id);
    const variant = findVariant(product, variantId);

    const remaining = product.variants.filter((v) => String(v._id) !== variantId);
    if (product.status === PRODUCT_STATUS.ACTIVE && !remaining.some((v) => v.isActive)) {
      throw ApiError.conflict(
        'A published product needs at least one active variant. Unpublish the product first.',
      );
    }

    const removedImages = [...variant.images];
    product.variants = remaining as never;
    await product.save();
    await deleteRemovedImages(removedImages, []);
    return toAdminProduct(product);
  },
};
