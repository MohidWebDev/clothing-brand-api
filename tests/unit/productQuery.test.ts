import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  buildProductSort,
  buildPublicProductFilter,
  usesTextScore,
} from '../../src/utils/productQuery';

type ElemFilter = { variants: { $elemMatch: Record<string, unknown> } };

describe('buildPublicProductFilter', () => {
  it('always restricts to active, non-deleted products', () => {
    expect(buildPublicProductFilter({})).toEqual({ status: 'active', deletedAt: null });
  });

  it('adds a text search', () => {
    expect(buildPublicProductFilter({ q: 'linen shirt' })).toMatchObject({
      $text: { $search: 'linen shirt' },
    });
  });

  it('filters by category, brand and gender', () => {
    const categoryIds = [new Types.ObjectId()];
    const brandIds = [new Types.ObjectId(), new Types.ObjectId()];
    expect(
      buildPublicProductFilter({ categoryIds, brandIds, gender: ['men', 'unisex'] }),
    ).toMatchObject({
      category: { $in: categoryIds },
      brand: { $in: brandIds },
      gender: { $in: ['men', 'unisex'] },
    });
  });

  it('matches a price range against the variant price range', () => {
    const f = buildPublicProductFilter({ minPrice: 1000, maxPrice: 3000 }) as Record<
      string,
      unknown
    >;
    expect(f.$and).toEqual([{ priceMax: { $gte: 1000 } }, { priceMin: { $lte: 3000 } }]);
  });

  it('requires size and color to match the same in-stock variant', () => {
    const f = buildPublicProductFilter({ size: ['M', 'L'], color: ['black'] }) as Record<
      string,
      unknown
    >;
    expect(f.variants).toEqual({
      $elemMatch: {
        isActive: true,
        stock: { $gt: 0 },
        size: { $in: ['M', 'L'] },
        colorKey: { $in: ['black'] },
      },
    });
  });

  it('only constrains the dimension that was asked for', () => {
    const sizeOnly = buildPublicProductFilter({ size: ['M'] }) as unknown as ElemFilter;
    expect(sizeOnly.variants.$elemMatch.colorKey).toBeUndefined();
    const colorOnly = buildPublicProductFilter({ color: ['red'] }) as unknown as ElemFilter;
    expect(colorOnly.variants.$elemMatch.size).toBeUndefined();
  });

  it('filters by fabric key', () => {
    expect(buildPublicProductFilter({ fabric: ['lawn', 'raw silk'] })).toMatchObject({
      fabricKey: { $in: ['lawn', 'raw silk'] },
    });
  });

  it('adds stock and sale flags only when true', () => {
    expect(buildPublicProductFilter({ inStock: true, onSale: true })).toMatchObject({
      inStock: true,
      onSale: true,
    });
    const off = buildPublicProductFilter({ inStock: false, onSale: false }) as Record<
      string,
      unknown
    >;
    expect(off.inStock).toBeUndefined();
    expect(off.onSale).toBeUndefined();
  });

  it('ignores empty filter arrays', () => {
    const f = buildPublicProductFilter({ gender: [], size: [], brandIds: [] }) as Record<
      string,
      unknown
    >;
    expect(f).toEqual({ status: 'active', deletedAt: null });
  });
});

describe('buildProductSort', () => {
  it('defaults to newest, or relevance when searching', () => {
    expect(buildProductSort(undefined, false)).toEqual({ createdAt: -1, _id: -1 });
    expect(usesTextScore(buildProductSort(undefined, true))).toBe(true);
  });

  it('falls back to newest when relevance is requested without a search', () => {
    expect(buildProductSort('relevance', false)).toEqual({ createdAt: -1, _id: -1 });
  });

  it.each([
    ['price_asc', { priceMin: 1, _id: 1 }],
    ['price_desc', { priceMin: -1, _id: -1 }],
    ['popular', { soldCount: -1, _id: -1 }],
    ['rating', { ratingAverage: -1, ratingCount: -1, _id: -1 }],
  ])('sorts by %s with a stable tie-breaker', (sort, expected) => {
    expect(buildProductSort(sort, false)).toEqual(expected);
  });
});
