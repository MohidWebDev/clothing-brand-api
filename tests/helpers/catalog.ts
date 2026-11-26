import type { Types } from 'mongoose';
import type { Gender } from '../../src/constants';
import { Brand, Category, Product } from '../../src/models';
import { slugify } from '../../src/utils/slug';

let counter = 0;

export const makeBrand = (name = `Brand ${++counter}`) =>
  Brand.create({ name, slug: slugify(`${name} ${++counter}`) });

export const makeCategory = (
  name = `Category ${++counter}`,
  parent: Types.ObjectId | null = null,
) => Category.create({ name, slug: slugify(`${name} ${++counter}`), parent });

export interface VariantSeed {
  size?: string;
  color?: string;
  hex?: string;
  stock?: number;
  price?: number | null;
  lowStockThreshold?: number;
  isActive?: boolean;
}

let skuCounter = 0;

/** Creates a product directly in the database (faster than going through the API). */
export async function makeProduct(opts: {
  brand: Types.ObjectId;
  category: Types.ObjectId;
  name?: string;
  description?: string;
  gender?: Gender;
  price?: number;
  compareAtPrice?: number;
  status?: 'draft' | 'active' | 'archived';
  tags?: string[];
  fabric?: string;
  soldCount?: number;
  ratingAverage?: number;
  variants?: VariantSeed[];
  createdAt?: Date;
}) {
  const name = opts.name ?? `Product ${++counter}`;
  const variants = (opts.variants ?? [{}]).map((v) => {
    const color = v.color ?? 'Black';
    const size = v.size ?? 'M';
    return {
      sku: `SKU-${++skuCounter}-${size}-${color}`.toUpperCase().replace(/\s/g, ''),
      size,
      color: { name: color, hex: v.hex ?? '#111111' },
      colorKey: color.toLowerCase(),
      stock: v.stock ?? 10,
      ...(v.price !== undefined && { price: v.price }),
      lowStockThreshold: v.lowStockThreshold ?? 5,
      isActive: v.isActive ?? true,
    };
  });

  return Product.create({
    name,
    slug: slugify(`${name} ${++counter}`),
    description: opts.description ?? `${name} description`,
    brand: opts.brand,
    category: opts.category,
    gender: opts.gender ?? 'men',
    price: opts.price ?? 2000,
    compareAtPrice: opts.compareAtPrice,
    status: opts.status ?? 'active',
    tags: opts.tags ?? [],
    fabric: opts.fabric,
    soldCount: opts.soldCount ?? 0,
    ratingAverage: opts.ratingAverage ?? 0,
    images: [{ url: 'https://example.com/a.jpg', publicId: 'secret/public-id', alt: 'front' }],
    variants,
    ...(opts.createdAt && { createdAt: opts.createdAt }),
  });
}

export const variantInput = (over: Record<string, unknown> = {}) => ({
  sku: `API-SKU-${++skuCounter}`,
  size: 'M',
  color: { name: 'Black', hex: '#111111' },
  stock: 10,
  ...over,
});
