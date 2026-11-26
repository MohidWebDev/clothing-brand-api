import { describe, expect, it } from 'vitest';
import {
  adjustStockBody,
  productFacetsQuery,
  createProductBody,
  createVariantBody,
  productListQuery,
  updateBrandBody,
  updateCategoryBody,
  updateProductBody,
  updateVariantBody,
} from '../../src/validators/catalog.validators';

const oid = 'a'.repeat(24);
const validProduct = {
  name: 'Linen Shirt',
  description: 'Soft and breathable',
  brand: oid,
  category: oid,
  gender: 'men',
  price: 3490,
};

describe('update schemas leave omitted fields alone', () => {
  // A PATCH must only touch what the client sent; defaults would silently overwrite data.
  it('updateProductBody returns only the provided keys', () => {
    expect(updateProductBody.parse({ price: 3000 })).toEqual({ price: 3000 });
    expect(updateProductBody.parse({})).toEqual({});
  });

  it('updateVariantBody returns only the provided keys', () => {
    expect(updateVariantBody.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('updateBrandBody and updateCategoryBody return only the provided keys', () => {
    expect(updateBrandBody.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(updateCategoryBody.parse({ sortOrder: 2 })).toEqual({ sortOrder: 2 });
  });

  it('allows clearing optional fields with null', () => {
    expect(updateProductBody.parse({ compareAtPrice: null, fabric: null })).toEqual({
      compareAtPrice: null,
      fabric: null,
    });
  });
});

describe('createProductBody', () => {
  it('applies sensible defaults', () => {
    const parsed = createProductBody.parse(validProduct);
    expect(parsed).toMatchObject({ status: 'draft', tags: [], images: [], variants: [] });
  });

  it.each([
    ['fractional price', { price: 99.5 }],
    ['zero price', { price: 0 }],
    ['negative price', { price: -5 }],
    ['absurd price', { price: 99_999_999 }],
    ['unknown gender', { gender: 'robots' }],
    ['malformed brand id', { brand: 'nope' }],
    ['non-https image', { images: [{ url: 'http://example.com/a.png' }] }],
    ['too many tags', { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
  ])('rejects %s', (_label, override) => {
    expect(createProductBody.safeParse({ ...validProduct, ...override }).success).toBe(false);
  });

  it('normalises SKU, size and tags', () => {
    const parsed = createProductBody.parse({
      ...validProduct,
      tags: [' Summer ', 'LINEN'],
      variants: [
        { sku: ' ut-001-blk-m ', size: ' m ', color: { name: 'Black', hex: '#111111' }, stock: 4 },
      ],
    });
    expect(parsed.tags).toEqual(['summer', 'linen']);
    expect(parsed.variants[0]).toMatchObject({ sku: 'UT-001-BLK-M', size: 'M', stock: 4 });
  });
});

describe('createVariantBody', () => {
  const base = { sku: 'UT-001-BLK-M', size: 'M', color: { name: 'Black', hex: '#111111' } };

  it('defaults stock to 0 and active to true', () => {
    expect(createVariantBody.parse(base)).toMatchObject({ stock: 0, isActive: true, images: [] });
  });

  it.each([
    ['short SKU', { sku: 'A1' }],
    ['SKU with spaces', { sku: 'UT 001' }],
    ['bad hex', { color: { name: 'Black', hex: 'black' } }],
    ['fractional stock', { stock: 2.5 }],
    ['negative stock', { stock: -1 }],
    ['fractional variant price', { price: 10.5 }],
  ])('rejects %s', (_label, override) => {
    expect(createVariantBody.safeParse({ ...base, ...override }).success).toBe(false);
  });
});

describe('productListQuery', () => {
  it('applies pagination defaults', () => {
    expect(productListQuery.parse({})).toMatchObject({ page: 1, limit: 20 });
  });

  it('parses comma separated and repeated values alike', () => {
    expect(productListQuery.parse({ size: 'm,l' }).size).toEqual(['M', 'L']);
    expect(productListQuery.parse({ size: ['m', 'xl'] }).size).toEqual(['M', 'XL']);
    expect(productListQuery.parse({ color: 'Black, NAVY' }).color).toEqual(['black', 'navy']);
    expect(productListQuery.parse({ brand: 'urban-thread,indus-denim' }).brand).toEqual([
      'urban-thread',
      'indus-denim',
    ]);
  });

  it('leaves absent filters undefined', () => {
    const q = productListQuery.parse({});
    expect(q.size).toBeUndefined();
    expect(q.inStock).toBeUndefined();
  });

  it('coerces numbers and booleans from query strings', () => {
    expect(productListQuery.parse({ minPrice: '1000', maxPrice: '5000', page: '2' })).toMatchObject(
      {
        minPrice: 1000,
        maxPrice: 5000,
        page: 2,
      },
    );
    expect(productListQuery.parse({ inStock: 'true', onSale: '0' })).toMatchObject({
      inStock: true,
      onSale: false,
    });
  });

  it.each([
    ['inverted price range', { minPrice: '5000', maxPrice: '1000' }],
    ['unknown sort', { sort: 'cheapest' }],
    ['unknown gender', { gender: 'aliens' }],
    ['page 0', { page: '0' }],
    ['huge page size', { limit: '1000' }],
    ['non numeric price', { minPrice: 'abc' }],
  ])('rejects %s', (_label, query) => {
    expect(productListQuery.safeParse(query).success).toBe(false);
  });
});

describe('fabric and facet queries', () => {
  it('lowercases fabric values and accepts commas or repeats', () => {
    expect(productListQuery.parse({ fabric: 'Lawn, Raw Silk' }).fabric).toEqual([
      'lawn',
      'raw silk',
    ]);
    expect(productListQuery.parse({ fabric: ['Cotton', 'KHADDAR'] }).fabric).toEqual([
      'cotton',
      'khaddar',
    ]);
  });

  it('lets facets take the same filters as the listing', () => {
    const parsed = productFacetsQuery.parse({
      category: 'women',
      size: 'm',
      fabric: 'Lawn',
      minPrice: '1000',
      inStock: 'true',
    });
    expect(parsed).toMatchObject({
      category: 'women',
      size: ['M'],
      fabric: ['lawn'],
      minPrice: 1000,
      inStock: true,
    });
    expect(productFacetsQuery.safeParse({ minPrice: '5', maxPrice: '1' }).success).toBe(false);
  });
});

describe('adjustStockBody', () => {
  it('accepts either delta or set', () => {
    expect(adjustStockBody.parse({ delta: -3 })).toMatchObject({ delta: -3, reason: 'adjustment' });
    expect(adjustStockBody.parse({ set: 0 })).toMatchObject({ set: 0 });
  });

  it.each([
    ['both', { delta: 1, set: 1 }],
    ['neither', {}],
    ['zero delta', { delta: 0 }],
    ['fractional delta', { delta: 1.5 }],
    ['negative set', { set: -1 }],
    ['unknown reason', { delta: 1, reason: 'magic' }],
  ])('rejects %s', (_label, body) => {
    expect(adjustStockBody.safeParse(body).success).toBe(false);
  });
});
