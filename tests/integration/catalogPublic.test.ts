import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { seedRoles } from '../../src/seeders';
import { makeBrand, makeCategory, makeProduct } from '../helpers/catalog';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();
const get = (path: string) => request(app).get(`/api/v1${path}`);
const names = (res: request.Response) => res.body.data.map((p: { name: string }) => p.name);

describeDb('public catalog API', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
  });

  describe('listing', () => {
    it('shows only active products and reports pagination', async () => {
      const brand = await makeBrand();
      const category = await makeCategory();
      await makeProduct({ brand: brand._id, category: category._id, name: 'Visible' });
      await makeProduct({
        brand: brand._id,
        category: category._id,
        name: 'Draft',
        status: 'draft',
      });
      await makeProduct({
        brand: brand._id,
        category: category._id,
        name: 'Archived',
        status: 'archived',
      });

      const res = await get('/products');
      expect(res.status).toBe(200);
      expect(names(res)).toEqual(['Visible']);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      });
    });

    it('returns compact cards that do not leak internals', async () => {
      const brand = await makeBrand('Urban Thread');
      const category = await makeCategory('Shirts');
      await makeProduct({
        brand: brand._id,
        category: category._id,
        price: 2490,
        compareAtPrice: 3290,
        variants: [
          { size: 'M', stock: 10 },
          { size: 'L', stock: 0 },
          { size: 'S', stock: 3, color: 'White', hex: '#FFFFFF' },
        ],
      });

      const card = (await get('/products')).body.data[0];
      expect(card).toMatchObject({
        price: 2490,
        compareAtPrice: 3290,
        onSale: true,
        discountPercent: 24,
        inStock: true,
        sizes: ['S', 'M'],
        brand: { name: 'Urban Thread' },
        category: { name: 'Shirts' },
      });
      expect(card.swatches.map((s: { name: string }) => s.name)).toEqual(['Black', 'White']);
      expect(card.variants).toBeUndefined();
      expect(JSON.stringify(card)).not.toMatch(/publicId|secret\/public-id|deletedAt|totalStock/);
    });

    it('paginates with a stable order', async () => {
      const brand = await makeBrand();
      const category = await makeCategory();
      for (let i = 1; i <= 5; i++) {
        await makeProduct({ brand: brand._id, category: category._id, name: `P${i}`, price: 1000 });
      }
      const page1 = await get('/products?limit=2&page=1&sort=price_asc');
      const page2 = await get('/products?limit=2&page=2&sort=price_asc');
      const page3 = await get('/products?limit=2&page=3&sort=price_asc');

      expect(page1.body.meta).toMatchObject({
        total: 5,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: false,
      });
      expect(page3.body.meta).toMatchObject({ hasNextPage: false, hasPrevPage: true });
      const all = [...names(page1), ...names(page2), ...names(page3)];
      expect(new Set(all).size).toBe(5);
    });

    it('sorts by price, popularity, rating and newest', async () => {
      const brand = await makeBrand();
      const category = await makeCategory();
      const mk = (
        name: string,
        price: number,
        soldCount: number,
        ratingAverage: number,
        createdAt: Date,
      ) =>
        makeProduct({
          brand: brand._id,
          category: category._id,
          name,
          price,
          soldCount,
          ratingAverage,
          createdAt,
        });
      await mk('Cheap', 1000, 5, 3, new Date('2026-01-01'));
      await mk('Mid', 2000, 50, 5, new Date('2026-02-01'));
      await mk('Pricey', 3000, 20, 4, new Date('2026-03-01'));

      expect(names(await get('/products?sort=price_asc'))).toEqual(['Cheap', 'Mid', 'Pricey']);
      expect(names(await get('/products?sort=price_desc'))).toEqual(['Pricey', 'Mid', 'Cheap']);
      expect(names(await get('/products?sort=popular'))).toEqual(['Mid', 'Pricey', 'Cheap']);
      expect(names(await get('/products?sort=rating'))).toEqual(['Mid', 'Pricey', 'Cheap']);
      expect(names(await get('/products'))).toEqual(['Pricey', 'Mid', 'Cheap']);
    });

    it('rejects invalid queries with a 400', async () => {
      expect((await get('/products?minPrice=5000&maxPrice=1000')).status).toBe(400);
      expect((await get('/products?limit=1000')).status).toBe(400);
      expect((await get('/products?sort=cheapest')).status).toBe(400);
      expect((await get('/products?gender=aliens')).status).toBe(400);
    });
  });

  describe('filtering', () => {
    it('filters by category including its subcategories', async () => {
      const brand = await makeBrand();
      const men = await makeCategory('Men');
      const shirts = await makeCategory('Shirts', men._id);
      const women = await makeCategory('Women');
      await makeProduct({ brand: brand._id, category: shirts._id, name: 'Men Shirt' });
      await makeProduct({ brand: brand._id, category: men._id, name: 'Men Misc' });
      await makeProduct({ brand: brand._id, category: women._id, name: 'Women Top' });

      const parent = await get(`/products?category=${men.slug}`);
      expect(names(parent).sort()).toEqual(['Men Misc', 'Men Shirt']);
      expect(names(await get(`/products?category=${shirts.slug}`))).toEqual(['Men Shirt']);
      expect((await get('/products?category=does-not-exist')).body.data).toEqual([]);
    });

    it('filters by brand and gender, with several values', async () => {
      const a = await makeBrand('Alpha');
      const b = await makeBrand('Beta');
      const c = await makeBrand('Gamma');
      const cat = await makeCategory();
      await makeProduct({ brand: a._id, category: cat._id, name: 'A-men', gender: 'men' });
      await makeProduct({ brand: b._id, category: cat._id, name: 'B-women', gender: 'women' });
      await makeProduct({ brand: c._id, category: cat._id, name: 'C-men', gender: 'men' });

      expect(names(await get(`/products?brand=${a.slug},${b.slug}`)).sort()).toEqual([
        'A-men',
        'B-women',
      ]);
      expect(names(await get(`/products?gender=men`)).sort()).toEqual(['A-men', 'C-men']);
      expect(names(await get(`/products?gender=men&brand=${c.slug}`))).toEqual(['C-men']);
      expect((await get('/products?brand=unknown-brand')).body.data).toEqual([]);
    });

    it('requires size and color to match the same in-stock variant', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      // M exists only in white, L only in black: nothing is "M and black".
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Split',
        variants: [
          { size: 'M', color: 'White', hex: '#FFFFFF' },
          { size: 'L', color: 'Black' },
        ],
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Match',
        variants: [{ size: 'M', color: 'Black' }],
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'SoldOutMatch',
        variants: [
          { size: 'M', color: 'Black', stock: 0 },
          { size: 'S', color: 'Black' },
        ],
      });

      expect(names(await get('/products?size=M&color=black'))).toEqual(['Match']);
      expect(names(await get('/products?size=m')).sort()).toEqual(['Match', 'Split']);
      expect(names(await get('/products?color=Black')).sort()).toEqual([
        'Match',
        'SoldOutMatch',
        'Split',
      ]);
      expect(names(await get('/products?size=M,L')).sort()).toEqual(['Match', 'Split']);
    });

    it('filters by price range using the variant price range', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Low', price: 1000 });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'High', price: 5000 });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Ranged',
        price: 2000,
        variants: [
          { size: 'S', price: 2000 },
          { size: 'XL', price: 4000 },
        ],
      });

      expect(names(await get('/products?minPrice=1500&maxPrice=3000'))).toEqual(['Ranged']);
      expect(names(await get('/products?minPrice=3500&maxPrice=4500')).sort()).toEqual(['Ranged']);
      expect(names(await get('/products?maxPrice=1000'))).toEqual(['Low']);
      expect(names(await get('/products?minPrice=5000'))).toEqual(['High']);
    });

    it('filters by stock and sale status', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({ brand: brand._id, category: cat._id, name: 'InStock' });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'OutOfStock',
        variants: [{ stock: 0 }],
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'OnSale',
        price: 1000,
        compareAtPrice: 1500,
      });

      expect(names(await get('/products?inStock=true')).sort()).toEqual(['InStock', 'OnSale']);
      expect(names(await get('/products?onSale=true'))).toEqual(['OnSale']);
      expect(names(await get('/products')).sort()).toEqual(['InStock', 'OnSale', 'OutOfStock']);
    });
  });

  describe('fabric filter', () => {
    it('filters by fabric, case-insensitively and with several values', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Lawn Suit', fabric: 'Lawn' });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Khaddar Kurta',
        fabric: 'Khaddar',
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Raw Silk Kurta',
        fabric: 'Raw Silk',
      });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'No Fabric' });

      expect(names(await get('/products?fabric=lawn'))).toEqual(['Lawn Suit']);
      expect(names(await get('/products?fabric=LAWN,khaddar')).sort()).toEqual([
        'Khaddar Kurta',
        'Lawn Suit',
      ]);
      expect(names(await get('/products?fabric=raw%20silk'))).toEqual(['Raw Silk Kurta']);
      expect((await get('/products?fabric=velvet')).body.data).toEqual([]);
    });
  });

  describe('faceted counts', () => {
    const catalog = async () => {
      const brand = await makeBrand('Alpha');
      const other = await makeBrand('Beta');
      const women = await makeCategory('Women');
      const kurtas = await makeCategory('Kurtas', women._id);
      const suits = await makeCategory('Suits', women._id);
      const men = await makeCategory('Men');
      await makeProduct({
        brand: brand._id,
        category: kurtas._id,
        name: 'K1',
        fabric: 'Cotton',
        gender: 'women',
        price: 2000,
        variants: [{ size: 'S' }, { size: 'M' }],
      });
      await makeProduct({
        brand: brand._id,
        category: kurtas._id,
        name: 'K2',
        fabric: 'Lawn',
        gender: 'women',
        price: 3000,
        variants: [{ size: 'M', color: 'White', hex: '#FFFFFF' }],
      });
      await makeProduct({
        brand: other._id,
        category: suits._id,
        name: 'S1',
        fabric: 'Lawn',
        gender: 'women',
        price: 6000,
        variants: [{ size: 'L' }],
      });
      await makeProduct({
        brand: other._id,
        category: men._id,
        name: 'M1',
        fabric: 'Cotton',
        gender: 'men',
        price: 1500,
        variants: [{ size: 'XL' }],
      });
      return { women, kurtas, suits, men };
    };

    it('counts fabrics and rolls category counts up to parents', async () => {
      const { women, kurtas, men } = await catalog();
      const f = (await get('/products/filters')).body.data;

      expect(f.fabrics.map((x: { name: string; count: number }) => [x.name, x.count])).toEqual([
        ['Cotton', 2],
        ['Lawn', 2],
      ]);
      const count = (id: unknown) =>
        f.categories.find((c: { id: string }) => c.id === String(id)).count;
      expect(count(women._id)).toBe(3); // K1, K2, S1
      expect(count(kurtas._id)).toBe(2);
      expect(count(men._id)).toBe(1);
    });

    it('lists every active category, including those with no products', async () => {
      await catalog();
      await makeCategory('Empty');
      const f = (await get('/products/filters')).body.data;
      const empty = f.categories.find((c: { name: string }) => c.name === 'Empty');
      expect(empty.count).toBe(0);
    });

    it('counts each facet with every filter except its own', async () => {
      await catalog();
      const f = (await get('/products/filters?fabric=lawn')).body.data;

      // Fabric facet ignores the fabric filter: Cotton is still offered.
      expect(f.fabrics.map((x: { name: string }) => x.name)).toEqual(['Cotton', 'Lawn']);
      // Everything else is narrowed to lawn products (K2 and S1).
      expect(f.brands.map((b: { name: string; count: number }) => [b.name, b.count])).toEqual([
        ['Alpha', 1],
        ['Beta', 1],
      ]);
      expect(f.genders).toEqual([{ value: 'women', count: 2 }]);
      expect(f.price).toEqual({ min: 3000, max: 6000 });
    });

    it('keeps the other sizes available when a size is selected', async () => {
      await catalog();
      const f = (await get('/products/filters?size=M')).body.data;
      const sizes = f.sizes.map((s: { value: string }) => s.value);
      expect(sizes).toEqual(['S', 'M', 'L', 'XL']);
      // But other facets only reflect products that come in M.
      expect(f.brands).toEqual([expect.objectContaining({ name: 'Alpha', count: 2 })]);
    });

    it('does not let the price filter shrink the price range shown', async () => {
      await catalog();
      const f = (await get('/products/filters?minPrice=5000')).body.data;
      expect(f.price).toEqual({ min: 1500, max: 6000 });
      expect(f.fabrics.map((x: { name: string; count: number }) => [x.name, x.count])).toEqual([
        ['Lawn', 1],
      ]);
    });

    it('scopes category counts to the other active filters', async () => {
      const { women } = await catalog();
      const f = (await get('/products/filters?gender=women&fabric=lawn')).body.data;
      expect(f.categories.find((c: { id: string }) => c.id === String(women._id)).count).toBe(2);
    });

    it('returns empty facets for an unknown category or brand', async () => {
      await catalog();
      const f = (await get('/products/filters?category=nope')).body.data;
      expect(f).toMatchObject({ categories: [], fabrics: [], price: null });
      expect((await get('/products/filters?brand=nope')).body.data.price).toBeNull();
    });

    it('rejects invalid facet filters', async () => {
      expect((await get('/products/filters?minPrice=9&maxPrice=1')).status).toBe(400);
      expect((await get('/products/filters?gender=aliens')).status).toBe(400);
    });
  });

  describe('search', () => {
    it('finds products by name, tags and description, ranking name matches first', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Plain Tee',
        description: 'A soft linen blend for summer days.',
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Linen Shirt',
        description: 'Classic fit.',
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Wool Coat',
        tags: ['winter'],
      });

      const res = await get('/products?q=linen');
      expect(names(res)).toEqual(['Linen Shirt', 'Plain Tee']);
      expect(names(await get('/products?q=winter'))).toEqual(['Wool Coat']);
      expect((await get('/products?q=zzzznothing')).body.data).toEqual([]);
    });

    it('combines search with filters and ignores draft products', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Denim Jacket', price: 5000 });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Denim Shorts', price: 1500 });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Denim Draft',
        status: 'draft',
      });

      expect(names(await get('/products?q=denim&maxPrice=2000'))).toEqual(['Denim Shorts']);
      expect(names(await get('/products?q=denim')).sort()).toEqual([
        'Denim Jacket',
        'Denim Shorts',
      ]);
    });

    it('treats regex characters and operators in the query as plain text', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Safe Shirt' });
      expect((await get('/products?q=.*')).status).toBe(200);
      expect((await get('/products/suggest?q=.*')).body.data).toEqual([]);
      expect((await get('/products?q[$ne]=x')).status).toBe(400);
    });

    it('suggests products by the start of any word in the name', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Cotton Polo Shirt',
        soldCount: 10,
      });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Shirt Dress',
        soldCount: 50,
      });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Short Socks' });
      await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Draft Shirt',
        status: 'draft',
      });

      const res = await get('/products/suggest?q=shi');
      expect(names(res)).toEqual(['Shirt Dress', 'Cotton Polo Shirt']);
      expect(res.body.data[0]).toHaveProperty('slug');
      expect((await get('/products/suggest?q=s')).status).toBe(400);
    });
  });

  describe('filter options (facets)', () => {
    it('returns counts, sorted sizes, colors and the price range', async () => {
      const b1 = await makeBrand('Alpha');
      const b2 = await makeBrand('Beta');
      const cat = await makeCategory();
      await makeProduct({
        brand: b1._id,
        category: cat._id,
        gender: 'men',
        price: 1000,
        variants: [{ size: 'XL' }, { size: 'S' }, { size: 'M', color: 'White', hex: '#FFFFFF' }],
      });
      await makeProduct({
        brand: b2._id,
        category: cat._id,
        gender: 'women',
        price: 3000,
        variants: [{ size: 'M' }],
      });
      await makeProduct({ brand: b2._id, category: cat._id, status: 'draft', price: 99999 });

      const f = (await get('/products/filters')).body.data;
      expect(f.brands.map((b: { name: string; count: number }) => [b.name, b.count])).toEqual([
        ['Alpha', 1],
        ['Beta', 1],
      ]);
      expect(f.genders).toEqual(
        expect.arrayContaining([
          { value: 'men', count: 1 },
          { value: 'women', count: 1 },
        ]),
      );
      expect(f.sizes.map((s: { value: string }) => s.value)).toEqual(['S', 'M', 'XL']);
      expect(f.sizes.find((s: { value: string }) => s.value === 'M').count).toBe(2);
      expect(f.colors.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([
        ['Black', 2],
        ['White', 1],
      ]);
      expect(f.price).toEqual({ min: 1000, max: 3000 });
    });

    it('scopes options to a category and handles an empty catalogue', async () => {
      expect((await get('/products/filters')).body.data.price).toBeNull();

      const brand = await makeBrand();
      const men = await makeCategory('Men');
      const women = await makeCategory('Women');
      await makeProduct({ brand: brand._id, category: men._id, price: 1500 });
      await makeProduct({ brand: brand._id, category: women._id, price: 4500 });
      const f = (await get(`/products/filters?category=${men.slug}`)).body.data;
      expect(f.price).toEqual({ min: 1500, max: 1500 });
      expect((await get('/products/filters?category=nope')).body.data.price).toBeNull();
    });
  });

  describe('product detail', () => {
    it('returns the product with active variants, sorted, with safe stock info', async () => {
      const brand = await makeBrand('Urban Thread');
      const cat = await makeCategory('Shirts');
      const p = await makeProduct({
        brand: brand._id,
        category: cat._id,
        name: 'Detail Shirt',
        price: 2500,
        fabric: 'Cotton',
        variants: [
          { size: 'XL', stock: 500 },
          { size: 'S', stock: 3, lowStockThreshold: 5 },
          { size: 'M', stock: 0 },
          { size: 'L', stock: 10, isActive: false },
        ],
      });

      const res = await get(`/products/${p.slug}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d).toMatchObject({ name: 'Detail Shirt', basePrice: 2500, fabric: 'Cotton' });
      expect(d.variants.map((v: { size: string }) => v.size)).toEqual(['S', 'M', 'XL']);
      expect(d.variants[0]).toMatchObject({
        available: 3,
        lowStock: true,
        inStock: true,
        price: 2500,
      });
      expect(d.variants[1]).toMatchObject({ available: 0, inStock: false });
      expect(d.variants[2].available).toBe(10); // 500 in the warehouse is capped for display
      expect(d.seo.title).toBe('Detail Shirt');
      expect(JSON.stringify(d)).not.toMatch(
        /publicId|secret\/public-id|lowStockThreshold|"stock"|deletedAt|colorKey/,
      );
    });

    it('uses the variant price when it differs', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      const p = await makeProduct({
        brand: brand._id,
        category: cat._id,
        price: 2000,
        variants: [{ size: 'M' }, { size: 'XL', price: 2400 }],
      });
      const d = (await get(`/products/${p.slug}`)).body.data;
      expect(d.variants.map((v: { price: number }) => v.price)).toEqual([2000, 2400]);
      expect(d).toMatchObject({ price: 2000, priceMax: 2400 });
    });

    it('answers 404 for drafts, archived and unknown slugs', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      const draft = await makeProduct({ brand: brand._id, category: cat._id, status: 'draft' });
      expect((await get(`/products/${draft.slug}`)).status).toBe(404);
      expect((await get('/products/no-such-product')).status).toBe(404);
    });

    it('lists related products from the same category, excluding itself and drafts', async () => {
      const brand = await makeBrand();
      const cat = await makeCategory();
      const other = await makeCategory();
      const main = await makeProduct({ brand: brand._id, category: cat._id, name: 'Main' });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Sibling' });
      await makeProduct({ brand: brand._id, category: cat._id, name: 'Hidden', status: 'draft' });
      await makeProduct({ brand: brand._id, category: other._id, name: 'Elsewhere' });

      expect(names(await get(`/products/${main.slug}/related`))).toEqual(['Sibling']);
      expect((await get('/products/nope/related')).status).toBe(404);
    });
  });
});
