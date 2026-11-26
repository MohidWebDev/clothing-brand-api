import { compareSizes } from './sizes';

interface VariantLike {
  size: string;
  color: { name: string; hex: string };
  stock: number;
  price?: number | null;
  isActive: boolean;
}

export interface ProductDerived {
  priceMin: number;
  priceMax: number;
  totalStock: number;
  inStock: boolean;
  onSale: boolean;
  discountPercent: number;
  /** Sizes with stock, in display order. */
  sizes: string[];
  /** One entry per distinct color across active variants. */
  swatches: { name: string; hex: string }[];
}

/**
 * Listing, filtering and sorting read these denormalised fields instead of scanning variants.
 * They are recalculated whenever a product is saved or its stock changes.
 */
export function computeDerived(product: {
  price: number;
  compareAtPrice?: number | null;
  variants: readonly VariantLike[];
}): ProductDerived {
  const active = product.variants.filter((v) => v.isActive);
  const prices = active.map((v) => v.price ?? product.price);

  const priceMin = prices.length ? Math.min(...prices) : product.price;
  const priceMax = prices.length ? Math.max(...prices) : product.price;
  const totalStock = active.reduce((sum, v) => sum + v.stock, 0);

  const onSale = product.compareAtPrice != null && product.compareAtPrice > priceMin;
  const discountPercent = onSale
    ? Math.round((1 - priceMin / (product.compareAtPrice as number)) * 100)
    : 0;

  const sizes = [...new Set(active.filter((v) => v.stock > 0).map((v) => v.size))].sort(
    compareSizes,
  );

  const seen = new Set<string>();
  const swatches: { name: string; hex: string }[] = [];
  for (const v of active) {
    const key = v.color.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    swatches.push({ name: v.color.name, hex: v.color.hex });
  }

  return {
    priceMin,
    priceMax,
    totalStock,
    inStock: totalStock > 0,
    onSale,
    discountPercent,
    sizes,
    swatches,
  };
}
