import type { Types } from 'mongoose';
import type {
  BrandDocument,
  CategoryDocument,
  IImage,
  IProduct,
  IVariant,
  ProductDocument,
} from '../models';
import { compareSizes } from '../utils/sizes';

/** Responses are built from explicit whitelists so internal fields never leak by accident. */

type Ref = { _id: Types.ObjectId; name: string; slug: string };

type LeanProduct = Omit<IProduct, 'brand' | 'category' | 'variants'> & {
  _id: Types.ObjectId;
  brand: Ref | Types.ObjectId;
  category: Ref | Types.ObjectId;
  variants?: (IVariant & { _id: Types.ObjectId })[];
};

const id = (value: { toString(): string }) => String(value);

const toRef = (ref: Ref | Types.ObjectId) =>
  'name' in ref ? { id: id(ref._id), name: ref.name, slug: ref.slug } : { id: id(ref) };

const toImage = (image: IImage) => ({
  url: image.url,
  ...(image.alt && { alt: image.alt }),
});

export function toBrand(brand: BrandDocument) {
  return {
    id: id(brand._id),
    name: brand.name,
    slug: brand.slug,
    ...(brand.description && { description: brand.description }),
    ...(brand.logo && { logo: toImage(brand.logo) }),
    isActive: brand.isActive,
  };
}

export function toCategory(category: CategoryDocument) {
  return {
    id: id(category._id),
    name: category.name,
    slug: category.slug,
    parent: category.parent ? id(category.parent) : null,
    ...(category.description && { description: category.description }),
    ...(category.image && { image: toImage(category.image) }),
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

/** Compact shape for listing grids and search results. */
export function toProductCard(product: LeanProduct) {
  return {
    id: id(product._id),
    name: product.name,
    slug: product.slug,
    brand: toRef(product.brand),
    category: toRef(product.category),
    gender: product.gender,
    images: product.images.slice(0, 2).map(toImage),
    price: product.priceMin,
    priceMax: product.priceMax,
    compareAtPrice: product.onSale ? product.compareAtPrice : null,
    onSale: product.onSale,
    discountPercent: product.discountPercent,
    swatches: product.swatches,
    sizes: product.sizes,
    inStock: product.inStock,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
  };
}

/** Customers see "only 3 left", never the exact warehouse count. */
const STOCK_DISPLAY_CAP = 10;

export function toPublicVariant(variant: IVariant & { _id: Types.ObjectId }, basePrice: number) {
  return {
    id: id(variant._id),
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    price: variant.price ?? basePrice,
    inStock: variant.stock > 0,
    available: Math.min(variant.stock, STOCK_DISPLAY_CAP),
    lowStock: variant.stock > 0 && variant.stock <= variant.lowStockThreshold,
    images: variant.images.map(toImage),
  };
}

export function toPublicProduct(product: LeanProduct) {
  const variants = (product.variants ?? [])
    .filter((v) => v.isActive)
    .sort((a, b) => compareSizes(a.size, b.size) || a.color.name.localeCompare(b.color.name))
    .map((v) => toPublicVariant(v, product.price));

  return {
    ...toProductCard(product),
    description: product.description,
    ...(product.fabric && { fabric: product.fabric }),
    tags: product.tags,
    images: product.images.map(toImage),
    basePrice: product.price,
    variants,
    seo: {
      title: product.metaTitle ?? product.name,
      description: product.metaDescription ?? product.description.slice(0, 160),
    },
  };
}

/** Back-office view: everything, including drafts, raw stock and storage ids. */
export const toAdminProduct = (product: ProductDocument) => product.toJSON();

export const toSuggestion = (product: {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  images?: IImage[];
  priceMin: number;
}) => ({
  id: id(product._id),
  name: product.name,
  slug: product.slug,
  price: product.priceMin,
  ...(product.images?.[0] && { image: toImage(product.images[0]) }),
});
