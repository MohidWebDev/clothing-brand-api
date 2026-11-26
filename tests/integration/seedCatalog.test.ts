import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { Brand, Category, Product } from '../../src/models';
import { seedCatalog } from '../../src/seeders/catalog';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();

describeDb('demo catalogue seeder', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(clearTestDb);

  it('creates a browsable catalogue with every stock state represented', async () => {
    await seedCatalog();

    expect(await Brand.countDocuments()).toBe(4);
    expect(await Category.countDocuments()).toBe(13); // 3 top-level + 10 children
    const products = await Product.find();
    expect(products.length).toBeGreaterThanOrEqual(25);

    // Whole rupees, unique SKUs, sensible derived data.
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(products.every((p) => Number.isInteger(p.price) && p.priceMin > 0)).toBe(true);
    expect(products.some((p) => p.onSale)).toBe(true);
    expect(products.some((p) => p.variants.some((v) => v.stock === 0))).toBe(true);

    const list = await request(app).get('/api/v1/products?limit=100');
    expect(list.body.meta.total).toBe(products.length);

    const men = await request(app).get('/api/v1/products?category=men');
    expect(men.body.meta.total).toBeGreaterThan(0);
    expect(men.body.meta.total).toBeLessThan(products.length);

    const tree = (await request(app).get('/api/v1/categories')).body.data;
    expect(tree.map((c: { name: string }) => c.name)).toEqual(['Men', 'Women', 'Kids']);
  });

  it('is safe to run twice', async () => {
    await seedCatalog();
    const before = await Product.countDocuments();
    await seedCatalog();
    expect(await Product.countDocuments()).toBe(before);
    expect(await Brand.countDocuments()).toBe(4);
    expect(await Category.countDocuments()).toBe(13);
  });
});
