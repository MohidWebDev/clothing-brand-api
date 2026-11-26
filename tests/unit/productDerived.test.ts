import { describe, expect, it } from 'vitest';
import { computeDerived } from '../../src/utils/productDerived';

const variant = (over: Partial<Parameters<typeof computeDerived>[0]['variants'][number]> = {}) => ({
  size: 'M',
  color: { name: 'Black', hex: '#000000' },
  stock: 5,
  price: null,
  isActive: true,
  ...over,
});

describe('computeDerived', () => {
  it('uses the product price when variants do not override it', () => {
    const d = computeDerived({ price: 2500, variants: [variant(), variant({ size: 'L' })] });
    expect(d.priceMin).toBe(2500);
    expect(d.priceMax).toBe(2500);
  });

  it('reports the price range across variant overrides', () => {
    const d = computeDerived({
      price: 2500,
      variants: [
        variant(),
        variant({ size: 'XL', price: 2900 }),
        variant({ size: 'S', price: 2300 }),
      ],
    });
    expect([d.priceMin, d.priceMax]).toEqual([2300, 2900]);
  });

  it('ignores inactive variants everywhere', () => {
    const d = computeDerived({
      price: 2500,
      variants: [
        variant({ stock: 3 }),
        variant({ size: 'L', stock: 50, price: 100, isActive: false }),
      ],
    });
    expect(d.totalStock).toBe(3);
    expect(d.priceMin).toBe(2500);
    expect(d.sizes).toEqual(['M']);
  });

  it('flags stock and lists only in-stock sizes in order', () => {
    const d = computeDerived({
      price: 1000,
      variants: [
        variant({ size: 'XL', stock: 2 }),
        variant({ size: 'S', stock: 1 }),
        variant({ size: 'M', stock: 0 }),
      ],
    });
    expect(d.inStock).toBe(true);
    expect(d.sizes).toEqual(['S', 'XL']);
  });

  it('marks a product with no stock as out of stock but keeps its swatches', () => {
    const d = computeDerived({ price: 1000, variants: [variant({ stock: 0 })] });
    expect(d.inStock).toBe(false);
    expect(d.sizes).toEqual([]);
    expect(d.swatches).toEqual([{ name: 'Black', hex: '#000000' }]);
  });

  it('de-duplicates swatches by color name, ignoring case', () => {
    const d = computeDerived({
      price: 1000,
      variants: [
        variant({ size: 'S' }),
        variant({ size: 'M', color: { name: 'black', hex: '#000000' } }),
        variant({ size: 'S', color: { name: 'Navy', hex: '#001f3f' } }),
      ],
    });
    expect(d.swatches.map((s) => s.name)).toEqual(['Black', 'Navy']);
  });

  it('computes the sale discount from the compare-at price', () => {
    const d = computeDerived({ price: 3000, compareAtPrice: 4000, variants: [variant()] });
    expect(d.onSale).toBe(true);
    expect(d.discountPercent).toBe(25);
  });

  it('is not on sale without a higher compare-at price', () => {
    expect(computeDerived({ price: 3000, variants: [variant()] }).onSale).toBe(false);
    expect(
      computeDerived({ price: 3000, compareAtPrice: 3000, variants: [variant()] }).onSale,
    ).toBe(false);
  });

  it('handles a product without variants', () => {
    const d = computeDerived({ price: 1500, variants: [] });
    expect(d).toMatchObject({ priceMin: 1500, priceMax: 1500, totalStock: 0, inStock: false });
  });
});
