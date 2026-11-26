import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ROLES } from '../../src/constants';
import { Product, StockMovement } from '../../src/models';
import { seedRoles } from '../../src/seeders';
import { sessionCookieFor } from '../helpers/auth';
import { makeBrand, makeCategory, makeProduct } from '../helpers/catalog';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();

describeDb('inventory API', () => {
  let manager: string;
  let staff: string;

  const api = (method: 'get' | 'patch', path: string, cookie: string) =>
    request(app)[method](`/api/v1/admin${path}`).set('Cookie', cookie);

  const setup = async (variants = [{ size: 'M', stock: 5 }]) => {
    const brand = await makeBrand();
    const category = await makeCategory();
    const product = await makeProduct({ brand: brand._id, category: category._id, variants });
    return { product, variant: product.variants[0]! };
  };

  const stockPath = (productId: unknown, variantId: unknown) =>
    `/inventory/${String(productId)}/variants/${String(variantId)}/stock`;

  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
    manager = (await sessionCookieFor(app, ROLES.INVENTORY_MANAGER)).cookie;
    staff = (await sessionCookieFor(app, ROLES.STAFF)).cookie;
  });

  describe('adjusting stock', () => {
    it('adds and removes stock by delta and records the movement', async () => {
      const { product, variant } = await setup();

      const added = await api('patch', stockPath(product._id, variant._id), manager).send({
        delta: 20,
        reason: 'restock',
        note: 'Supplier delivery',
      });
      expect(added.status).toBe(200);
      expect(added.body.data).toMatchObject({ stock: 25, delta: 20, changed: true });

      const removed = await api('patch', stockPath(product._id, variant._id), manager).send({
        delta: -3,
        reason: 'damage',
      });
      expect(removed.body.data.stock).toBe(22);

      const ledger = await StockMovement.find({ product: product._id }).sort({ createdAt: 1 });
      expect(ledger.map((m) => [m.delta, m.balanceAfter, m.reason])).toEqual([
        [20, 25, 'restock'],
        [-3, 22, 'damage'],
      ]);
      expect(ledger[0]!.note).toBe('Supplier delivery');
      expect(ledger[0]!.performedBy).toBeTruthy();
    });

    it('never lets stock go below zero', async () => {
      const { product, variant } = await setup();
      const res = await api('patch', stockPath(product._id, variant._id), manager).send({
        delta: -6,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Not enough stock/);

      const fresh = await Product.findById(product._id);
      expect(fresh!.variants[0]!.stock).toBe(5);
      expect(await StockMovement.countDocuments({ product: product._id })).toBe(0);
    });

    it('stays correct under concurrent decrements', async () => {
      const { product, variant } = await setup([{ size: 'M', stock: 5 }]);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api('patch', stockPath(product._id, variant._id), manager).send({
            delta: -1,
            reason: 'sale',
          }),
        ),
      );

      expect(results.filter((r) => r.status === 200)).toHaveLength(5);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);

      const fresh = await Product.findById(product._id);
      expect(fresh!.variants[0]!.stock).toBe(0);
      expect(fresh!.inStock).toBe(false);
      expect(await StockMovement.countDocuments({ product: product._id })).toBe(5);
    });

    it('keeps the cached stock fields correct under repeated concurrent changes', async () => {
      // Run many rounds: a stale recalculation overwriting a newer one is intermittent.
      for (let round = 0; round < 15; round++) {
        const { product, variant } = await setup([{ size: 'M', stock: 6 }]);
        const path = stockPath(product._id, variant._id);

        await Promise.all([
          ...Array.from({ length: 6 }, () => api('patch', path, manager).send({ delta: -1 })),
          ...Array.from({ length: 2 }, () =>
            api('patch', path, manager).send({ delta: 3, reason: 'restock' }),
          ),
        ]);

        const fresh = await Product.findById(product._id);
        const stock = fresh!.variants[0]!.stock;
        expect(fresh!.totalStock).toBe(stock);
        expect(fresh!.inStock).toBe(stock > 0);
        expect(fresh!.sizes).toEqual(stock > 0 ? ['M'] : []);
      }
    });

    it('sets an absolute value and reports no-ops', async () => {
      const { product, variant } = await setup();
      const set = await api('patch', stockPath(product._id, variant._id), manager).send({
        set: 40,
        reason: 'correction',
      });
      expect(set.body.data).toMatchObject({ stock: 40, delta: 35, changed: true });

      const same = await api('patch', stockPath(product._id, variant._id), manager).send({
        set: 40,
      });
      expect(same.status).toBe(200);
      expect(same.body.data).toMatchObject({ changed: false, delta: 0 });
      expect(await StockMovement.countDocuments({ product: product._id })).toBe(1);
    });

    it('keeps the product-level derived fields in sync', async () => {
      const { product, variant } = await setup([{ size: 'M', stock: 2 }]);
      expect((await Product.findById(product._id))!.inStock).toBe(true);

      await api('patch', stockPath(product._id, variant._id), manager).send({ set: 0 });
      let fresh = await Product.findById(product._id);
      expect(fresh).toMatchObject({ inStock: false, totalStock: 0, sizes: [] });

      await api('patch', stockPath(product._id, variant._id), manager).send({
        delta: 7,
        reason: 'restock',
      });
      fresh = await Product.findById(product._id);
      expect(fresh).toMatchObject({ inStock: true, totalStock: 7 });
      expect(fresh!.sizes).toEqual(['M']);
    });

    it('validates the request', async () => {
      const { product, variant } = await setup();
      const path = stockPath(product._id, variant._id);
      expect((await api('patch', path, manager).send({})).status).toBe(400);
      expect((await api('patch', path, manager).send({ delta: 1, set: 5 })).status).toBe(400);
      expect((await api('patch', path, manager).send({ delta: 0 })).status).toBe(400);
      expect((await api('patch', path, manager).send({ delta: 1.5 })).status).toBe(400);
      expect((await api('patch', path, manager).send({ set: -1 })).status).toBe(400);
    });

    it('answers 404 for unknown products and variants', async () => {
      const { product } = await setup();
      const missing = 'a'.repeat(24);
      expect(
        (await api('patch', stockPath(missing, missing), manager).send({ delta: 1 })).status,
      ).toBe(404);
      expect(
        (await api('patch', stockPath(product._id, missing), manager).send({ delta: 1 })).status,
      ).toBe(404);
    });

    it('requires the inventory:update permission', async () => {
      const { product, variant } = await setup();
      const res = await api('patch', stockPath(product._id, variant._id), staff).send({ delta: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('low stock and movements', () => {
    it('lists variants at or below their threshold, emptiest first', async () => {
      const brand = await makeBrand();
      const category = await makeCategory();
      await makeProduct({
        brand: brand._id,
        category: category._id,
        name: 'Healthy',
        variants: [{ size: 'M', stock: 50 }],
      });
      await makeProduct({
        brand: brand._id,
        category: category._id,
        name: 'Running Low',
        variants: [
          { size: 'S', stock: 3 },
          { size: 'M', stock: 0 },
          { size: 'L', stock: 5, lowStockThreshold: 5 },
          { size: 'XL', stock: 6 },
          { size: 'XXL', stock: 1, isActive: false },
        ],
      });
      await makeProduct({
        brand: brand._id,
        category: category._id,
        name: 'Archived',
        status: 'archived',
        variants: [{ size: 'M', stock: 0 }],
      });

      const res = await api('get', '/inventory/low-stock', staff);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.data.map((r: { size: string; stock: number }) => [r.size, r.stock])).toEqual([
        ['M', 0],
        ['S', 3],
        ['L', 5],
      ]);
      expect(res.body.data[0]).toMatchObject({ name: 'Running Low', lowStockThreshold: 5 });
      expect(res.body.data[0]).toHaveProperty('sku');
    });

    it('paginates low stock results', async () => {
      const brand = await makeBrand();
      const category = await makeCategory();
      await makeProduct({
        brand: brand._id,
        category: category._id,
        variants: ['S', 'M', 'L'].map((size) => ({ size, stock: 1 })),
      });
      const res = await api('get', '/inventory/low-stock?limit=2&page=2', manager);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ total: 3, totalPages: 2, hasPrevPage: true });
    });

    it('lists movements, newest first, filtered by product', async () => {
      const a = await setup();
      const b = await setup();
      await api('patch', stockPath(a.product._id, a.variant._id), manager).send({ delta: 1 });
      await api('patch', stockPath(a.product._id, a.variant._id), manager).send({ delta: 2 });
      await api('patch', stockPath(b.product._id, b.variant._id), manager).send({ delta: 9 });

      const all = await api('get', '/inventory/movements', manager);
      expect(all.body.meta.total).toBe(3);
      expect(all.body.data[0].delta).toBe(9);

      const onlyA = await api('get', `/inventory/movements?productId=${a.product._id}`, manager);
      expect(onlyA.body.data.map((m: { delta: number }) => m.delta)).toEqual([2, 1]);
    });

    it('is not available to customers or guests', async () => {
      const customer = (await sessionCookieFor(app, ROLES.CUSTOMER)).cookie;
      expect((await api('get', '/inventory/low-stock', customer)).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/inventory/low-stock')).status).toBe(401);
    });
  });
});
