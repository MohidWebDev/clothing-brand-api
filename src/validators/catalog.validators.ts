import { z } from 'zod';
import {
  GENDERS,
  MAX_IMAGES_PER_PRODUCT,
  MAX_VARIANTS_PER_PRODUCT,
  PRODUCT_STATUS,
  STOCK_REASONS,
} from '../constants';
import { normalizeSize } from '../utils/sizes';
import { paginationQuerySchema } from '../utils/pagination';

// ---------- building blocks ----------

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParams = z.object({ id: objectId });
export const slugParams = z.object({ slug: z.string().trim().min(1).max(100) });
export const variantParams = z.object({ id: objectId, variantId: objectId });

const text = (max: number) => z.string().trim().min(1).max(max);

const imageInput = z.object({
  url: z
    .url('Enter a valid image URL')
    .refine((u) => u.startsWith('https://'), 'Image URLs must use HTTPS'),
  publicId: z.string().trim().max(200).optional(),
  alt: z.string().trim().max(200).optional(),
});

/** Whole PKR rupees. */
const price = z
  .number('Price must be a number')
  .int('Price must be a whole number of rupees')
  .min(1, 'Price must be at least 1')
  .max(10_000_000, 'Price is too high');

const color = z.object({
  name: text(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color such as #1A2B3C'),
});

const sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, 'SKU must be 3-40 characters: letters, numbers, - or _');

const size = z.string().trim().min(1).max(20).transform(normalizeSize);
const stock = z.number().int('Stock must be a whole number').min(0).max(1_000_000);
const threshold = z.number().int().min(0).max(100_000);
const tags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20);

// ---------- brands and categories ----------

export const createBrandBody = z.object({
  name: text(80),
  description: z.string().trim().max(1000).optional(),
  logo: imageInput.optional(),
  isActive: z.boolean().default(true),
});

// Update schemas deliberately have no defaults, so omitted fields are left untouched.
export const updateBrandBody = z.object({
  name: text(80).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  logo: imageInput.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createCategoryBody = z.object({
  name: text(80),
  description: z.string().trim().max(1000).optional(),
  parent: objectId.nullable().optional(),
  image: imageInput.optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategoryBody = z.object({
  name: text(80).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  parent: objectId.nullable().optional(),
  image: imageInput.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

// ---------- products and variants ----------

export const createVariantBody = z.object({
  sku,
  size,
  color,
  stock: stock.default(0),
  price: price.nullable().optional(),
  lowStockThreshold: threshold.optional(),
  images: z.array(imageInput).max(MAX_IMAGES_PER_PRODUCT).default([]),
  isActive: z.boolean().default(true),
});

/** Stock is not editable here: it changes through the inventory endpoint so it is ledgered. */
export const updateVariantBody = z.object({
  sku: sku.optional(),
  size: size.optional(),
  color: color.optional(),
  price: price.nullable().optional(),
  lowStockThreshold: threshold.optional(),
  images: z.array(imageInput).max(MAX_IMAGES_PER_PRODUCT).optional(),
  isActive: z.boolean().optional(),
});

export const createProductBody = z.object({
  name: text(150),
  description: text(5000),
  brand: objectId,
  category: objectId,
  gender: z.enum(GENDERS),
  fabric: z.string().trim().max(80).optional(),
  tags: tags.default([]),
  images: z.array(imageInput).max(MAX_IMAGES_PER_PRODUCT).default([]),
  price,
  compareAtPrice: price.nullable().optional(),
  status: z
    .enum(Object.values(PRODUCT_STATUS) as [string, ...string[]])
    .default(PRODUCT_STATUS.DRAFT),
  variants: z.array(createVariantBody).max(MAX_VARIANTS_PER_PRODUCT).default([]),
  metaTitle: z.string().trim().max(70).optional(),
  metaDescription: z.string().trim().max(160).optional(),
});

export const updateProductBody = z.object({
  name: text(150).optional(),
  description: text(5000).optional(),
  brand: objectId.optional(),
  category: objectId.optional(),
  gender: z.enum(GENDERS).optional(),
  fabric: z.string().trim().max(80).nullable().optional(),
  tags: tags.optional(),
  images: z.array(imageInput).max(MAX_IMAGES_PER_PRODUCT).optional(),
  price: price.optional(),
  compareAtPrice: price.nullable().optional(),
  status: z.enum(Object.values(PRODUCT_STATUS) as [string, ...string[]]).optional(),
  metaTitle: z.string().trim().max(70).nullable().optional(),
  metaDescription: z.string().trim().max(160).nullable().optional(),
});

// ---------- listing ----------

/** Accepts `?size=M,L` and `?size=M&size=L` alike. */
const list = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => {
    const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
    return raw
      ?.flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean);
  }, z.array(item).max(20).optional());

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'popular',
  'rating',
  'relevance',
] as const;

const catalogFilters = {
  q: z.string().trim().min(1).max(100).optional(),
  /** Category slug. Includes all subcategories. */
  category: z.string().trim().max(100).optional(),
  brand: list(z.string().max(100)),
  gender: list(z.enum(GENDERS)),
  size: list(z.string().max(20).transform(normalizeSize)),
  color: list(
    z
      .string()
      .max(40)
      .transform((c) => c.toLowerCase()),
  ),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.stringbool().optional(),
  onSale: z.stringbool().optional(),
};

const priceRangeOk = (v: { minPrice?: number; maxPrice?: number }) =>
  v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice;

export const productListQuery = paginationQuerySchema
  .extend({ ...catalogFilters, sort: z.enum(PRODUCT_SORTS).optional() })
  .refine(priceRangeOk, {
    message: 'minPrice cannot be greater than maxPrice',
    path: ['minPrice'],
  });

export const productFacetsQuery = z.object({
  q: catalogFilters.q,
  category: catalogFilters.category,
});

export const suggestQuery = z.object({ q: z.string().trim().min(2).max(60) });

export const adminProductListQuery = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(Object.values(PRODUCT_STATUS) as [string, ...string[]]).optional(),
  category: objectId.optional(),
  brand: objectId.optional(),
});

// ---------- inventory ----------

export const adjustStockBody = z
  .object({
    delta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((n) => n !== 0, 'Delta cannot be 0')
      .optional(),
    set: stock.optional(),
    reason: z.enum(STOCK_REASONS).default('adjustment'),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => (v.delta === undefined) !== (v.set === undefined), {
    message: 'Provide exactly one of "delta" or "set"',
    path: ['delta'],
  });

export const lowStockQuery = paginationQuerySchema;
export const movementsQuery = paginationQuerySchema.extend({
  productId: objectId.optional(),
  variantId: objectId.optional(),
});

export type CreateBrandBody = z.infer<typeof createBrandBody>;
export type UpdateBrandBody = z.infer<typeof updateBrandBody>;
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;
export type CreateVariantBody = z.infer<typeof createVariantBody>;
export type UpdateVariantBody = z.infer<typeof updateVariantBody>;
export type CreateProductBody = z.infer<typeof createProductBody>;
export type UpdateProductBody = z.infer<typeof updateProductBody>;
export type ProductListQuery = z.infer<typeof productListQuery>;
export type ProductFacetsQuery = z.infer<typeof productFacetsQuery>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuery>;
export type AdjustStockBody = z.infer<typeof adjustStockBody>;
