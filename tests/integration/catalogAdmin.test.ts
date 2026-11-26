import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ROLES } from '../../src/constants';
import { Product, StockMovement } from '../../src/models';
import { seedRoles } from '../../src/seeders';
import { sessionCookieFor } from '../helpers/auth';
import { makeBrand, makeCategory, variantInput } from '../helpers/catalog';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();

describeDb('catalog admin API', () => {
  let manager: string; // inventory manager: product + brand + category + inventory
  let staff: string; // support staff: can read inventory only
  let customer: string;

  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, cookie?: string) => {
    const req = request(app)[method](`/api/v1${path}`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  const productBody = async (over: Record<string, unknown> = {}) => {
    const brand = await makeBrand();
    const category = await makeCategory();
    return {
      name: 'Linen Shirt',
      description: 'Soft and breathable linen.',
      brand: String(brand._id),
      category: String(category._id),
      gender: 'men',
      price: 3490,
      ...over,
    };
  };

  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
    manager = (await sessionCookieFor(app, ROLES.INVENTORY_MANAGER)).cookie;
    staff = (await sessionCookieFor(app, ROLES.STAFF)).cookie;
    customer = (await sessionCookieFor(app, ROLES.CUSTOMER)).cookie;
  });

  describe('access control', () => {
    it('rejects guests with 401 and customers with 403', async () => {
      expect((await api('post', '/admin/products').send({})).status).toBe(401);
      expect((await api('post', '/admin/products', customer).send({})).status).toBe(403);
      expect((await api('get', '/admin/products', customer)).status).toBe(403);
      expect((await api('post', '/admin/brands', customer).send({ name: 'X' })).status).toBe(403);
      expect((await api('post', '/admin/uploads/images', customer)).status).toBe(403);
    });

    it('lets support staff look at products but not change them', async () => {
      expect((await api('get', '/admin/products', staff)).status).toBe(200);
      const res = await api('post', '/admin/products', staff).send(await productBody());
      expect(res.status).toBe(403);
    });

    it('lets an inventory manager do everything catalog related', async () => {
      expect((await api('post', '/admin/products', manager).send(await productBody())).status).toBe(
        201,
      );
      expect((await api('post', '/admin/brands', manager).send({ name: 'Acme' })).status).toBe(201);
      expect((await api('post', '/admin/categories', manager).send({ name: 'Tops' })).status).toBe(
        201,
      );
    });
  });

  describe('brands', () => {
    it('creates a brand with a slug and rejects duplicate names regardless of case', async () => {
      const created = await api('post', '/admin/brands', manager).send({ name: 'Urban Thread' });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ name: 'Urban Thread', slug: 'urban-thread' });

      const dup = await api('post', '/admin/brands', manager).send({ name: 'urban thread' });
      expect(dup.status).toBe(409);
    });

    it('keeps the slug when renamed so links do not break', async () => {
      const { body } = await api('post', '/admin/brands', manager).send({ name: 'Old Name' });
      const res = await api('patch', `/admin/brands/${body.data.id}`, manager).send({
        name: 'New Name',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'New Name', slug: 'old-name' });
    });

    it('hides inactive brands from the public list but not from admins', async () => {
      const { body } = await api('post', '/admin/brands', manager).send({ name: 'Hidden Co' });
      await api('patch', `/admin/brands/${body.data.id}`, manager).send({ isActive: false });

      const pub = await api('get', '/brands');
      expect(pub.body.data.map((b: { name: string }) => b.name)).not.toContain('Hidden Co');
      const admin = await api('get', '/admin/brands', manager);
      expect(admin.body.data.map((b: { name: string }) => b.name)).toContain('Hidden Co');
    });

    it('refuses to delete a brand that still has products', async () => {
      const body = await productBody();
      await api('post', '/admin/products', manager).send(body);

      const res = await api('delete', `/admin/brands/${body.brand}`, manager);
      expect(res.status).toBe(409);
    });

    it('soft deletes an unused brand', async () => {
      const { body } = await api('post', '/admin/brands', manager).send({ name: 'Short Lived' });
      expect((await api('delete', `/admin/brands/${body.data.id}`, manager)).status).toBe(204);
      expect((await api('get', '/brands')).body.data).toHaveLength(0);
    });

    it('validates ids and bodies', async () => {
      expect((await api('patch', '/admin/brands/not-an-id', manager).send({})).status).toBe(400);
      expect((await api('post', '/admin/brands', manager).send({})).status).toBe(400);
      expect((await api('patch', `/admin/brands/${'a'.repeat(24)}`, manager).send({})).status).toBe(
        404,
      );
    });
  });

  describe('categories', () => {
    const create = async (name: string, parent?: string) => {
      const res = await api('post', '/admin/categories', manager).send({
        name,
        ...(parent && { parent }),
      });
      return res;
    };

    it('builds a nested tree for the storefront', async () => {
      const men = (await create('Men')).body.data;
      await create('Shirts', men.id);
      await create('T-Shirts', men.id);

      const tree = (await api('get', '/categories')).body.data;
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Men');
      expect(tree[0].children.map((c: { name: string }) => c.name).sort()).toEqual([
        'Shirts',
        'T-Shirts',
      ]);
    });

    it('limits nesting to three levels', async () => {
      const a = (await create('Level 1')).body.data;
      const b = (await create('Level 2', a.id)).body.data;
      const c = (await create('Level 3', b.id)).body.data;
      const tooDeep = await create('Level 4', c.id);
      expect(tooDeep.status).toBe(400);
      expect(tooDeep.body.error.details[0].path).toBe('parent');
    });

    it('prevents cycles and moving a category under its own descendant', async () => {
      const a = (await create('Parent')).body.data;
      const b = (await create('Child', a.id)).body.data;

      const underSelf = await api('patch', `/admin/categories/${a.id}`, manager).send({
        parent: a.id,
      });
      expect(underSelf.status).toBe(400);
      const underChild = await api('patch', `/admin/categories/${a.id}`, manager).send({
        parent: b.id,
      });
      expect(underChild.status).toBe(400);
    });

    it('rejects a duplicate name under the same parent but allows it elsewhere', async () => {
      const men = (await create('Men')).body.data;
      const women = (await create('Women')).body.data;
      expect((await create('Kurtas', men.id)).status).toBe(201);
      expect((await create('kurtas', men.id)).status).toBe(409);
      expect((await create('Kurtas', women.id)).status).toBe(201);
    });

    it('refuses to delete a category with subcategories or products', async () => {
      const parent = (await create('Parent')).body.data;
      const child = (await create('Child', parent.id)).body.data;
      expect((await api('delete', `/admin/categories/${parent.id}`, manager)).status).toBe(409);

      const body = await productBody({ category: child.id });
      await api('post', '/admin/products', manager).send(body);
      expect((await api('delete', `/admin/categories/${child.id}`, manager)).status).toBe(409);
    });

    it('returns a category with its breadcrumb and children by slug', async () => {
      const men = (await create('Men')).body.data;
      const shirts = (await create('Shirts', men.id)).body.data;
      const res = await api('get', `/categories/${shirts.slug}`);
      expect(res.body.data.ancestors.map((a: { name: string }) => a.name)).toEqual(['Men']);
      expect((await api('get', `/categories/${men.slug}`)).body.data.children).toHaveLength(1);
      expect((await api('get', '/categories/nope')).status).toBe(404);
    });
  });

  describe('creating products', () => {
    it('creates a product with variants, derived fields and an initial stock ledger', async () => {
      const res = await api('post', '/admin/products', manager).send(
        await productBody({
          status: 'active',
          compareAtPrice: 4490,
          variants: [
            variantInput({ sku: 'LS-M-BLK', size: 'm', stock: 8 }),
            variantInput({ sku: 'LS-L-BLK', size: 'L', stock: 0 }),
            variantInput({
              sku: 'LS-M-WHT',
              color: { name: 'White', hex: '#FFFFFF' },
              stock: 2,
              price: 3690,
            }),
          ],
        }),
      );

      expect(res.status).toBe(201);
      const p = res.body.data;
      expect(p.slug).toBe('linen-shirt');
      expect(p).toMatchObject({
        status: 'active',
        priceMin: 3490,
        priceMax: 3690,
        totalStock: 10,
        inStock: true,
        onSale: true,
        discountPercent: 22,
      });
      expect(p.sizes).toEqual(['M']);
      expect(p.swatches.map((s: { name: string }) => s.name)).toEqual(['Black', 'White']);
      expect(p.variants[0]).toMatchObject({ size: 'M', colorKey: 'black' });

      const ledger = await StockMovement.find({ product: p.id });
      expect(ledger).toHaveLength(2);
      expect(ledger.every((m) => m.reason === 'initial')).toBe(true);
    });

    it('gives duplicate names unique slugs', async () => {
      const first = await api('post', '/admin/products', manager).send(await productBody());
      const second = await api('post', '/admin/products', manager).send(await productBody());
      expect(first.body.data.slug).toBe('linen-shirt');
      expect(second.body.data.slug).toBe('linen-shirt-2');
    });

    it.each([
      ['a fractional price', { price: 99.5 }],
      ['a compare-at price that is not higher', { price: 3000, compareAtPrice: 3000 }],
    ])('rejects %s', async (_label, over) => {
      const res = await api('post', '/admin/products', manager).send(await productBody(over));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown brand or category with a clear path', async () => {
      const res = await api('post', '/admin/products', manager).send(
        await productBody({ brand: 'b'.repeat(24), category: 'c'.repeat(24) }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'brand',
        'category',
      ]);
    });

    it('rejects duplicate SKUs or size/color pairs within a product', async () => {
      const dupSku = await api('post', '/admin/products', manager).send(
        await productBody({
          variants: [
            variantInput({ sku: 'DUP-1', size: 'S' }),
            variantInput({ sku: 'DUP-1', size: 'L' }),
          ],
        }),
      );
      expect(dupSku.status).toBe(400);

      const dupCombo = await api('post', '/admin/products', manager).send(
        await productBody({
          variants: [
            variantInput({ sku: 'A-1', size: 'M' }),
            variantInput({ sku: 'A-2', size: 'm' }),
          ],
        }),
      );
      expect(dupCombo.status).toBe(400);
    });

    it('rejects a SKU already used by another product', async () => {
      await api('post', '/admin/products', manager).send(
        await productBody({ variants: [variantInput({ sku: 'SHARED-1' })] }),
      );
      const res = await api('post', '/admin/products', manager).send(
        await productBody({ name: 'Other', variants: [variantInput({ sku: 'shared-1' })] }),
      );
      expect(res.status).toBe(409);
      expect(res.body.error.details[0].path).toBe('variants.0.sku');
    });

    it('will not publish a product that has no variants', async () => {
      const res = await api('post', '/admin/products', manager).send(
        await productBody({ status: 'active' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].path).toBe('status');
    });
  });

  describe('updating products', () => {
    const createActive = async () => {
      const res = await api('post', '/admin/products', manager).send(
        await productBody({
          status: 'active',
          tags: ['summer'],
          images: [{ url: 'https://example.com/a.jpg', alt: 'front' }],
          variants: [variantInput({ sku: 'U-1', stock: 7 })],
        }),
      );
      return res.body.data;
    };

    it('changes only the fields that were sent', async () => {
      const p = await createActive();
      const res = await api('patch', `/admin/products/${p.id}`, manager).send({ price: 2990 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        price: 2990,
        priceMin: 2990,
        status: 'active',
        tags: ['summer'],
      });
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.variants).toHaveLength(1);
      expect(res.body.data.variants[0].stock).toBe(7);
    });

    it('can clear optional fields with null', async () => {
      const p = await createActive();
      await api('patch', `/admin/products/${p.id}`, manager).send({
        price: 2000,
        compareAtPrice: 2500,
      });
      const res = await api('patch', `/admin/products/${p.id}`, manager).send({
        compareAtPrice: null,
      });
      expect(res.body.data.onSale).toBe(false);
      expect(res.body.data.compareAtPrice).toBeFalsy();
    });

    it('refuses a price change that breaks the compare-at rule', async () => {
      const p = await createActive();
      await api('patch', `/admin/products/${p.id}`, manager).send({ compareAtPrice: 4000 });
      const res = await api('patch', `/admin/products/${p.id}`, manager).send({ price: 4500 });
      expect(res.status).toBe(400);
    });

    it('unpublishes and republishes', async () => {
      const p = await createActive();
      expect(
        (await api('patch', `/admin/products/${p.id}`, manager).send({ status: 'draft' })).body.data
          .status,
      ).toBe('draft');
      expect((await api('get', `/products/${p.slug}`)).status).toBe(404);
      await api('patch', `/admin/products/${p.id}`, manager).send({ status: 'active' });
      expect((await api('get', `/products/${p.slug}`)).status).toBe(200);
    });

    it('soft deletes: gone from the shop and the admin, but kept in the database', async () => {
      const p = await createActive();
      expect((await api('delete', `/admin/products/${p.id}`, manager)).status).toBe(204);
      expect((await api('get', `/products/${p.slug}`)).status).toBe(404);
      expect((await api('get', `/admin/products/${p.id}`, manager)).status).toBe(404);
      expect(await Product.countDocuments({ _id: p.id, deletedAt: { $ne: null } })).toBe(1);
    });

    it('lists drafts for admins with search by name and SKU', async () => {
      await api('post', '/admin/products', manager).send(await productBody({ name: 'Draft Item' }));
      await createActive();

      const all = await api('get', '/admin/products', manager);
      expect(all.body.meta.total).toBe(2);
      const drafts = await api('get', '/admin/products?status=draft', manager);
      expect(drafts.body.data.map((p: { name: string }) => p.name)).toEqual(['Draft Item']);
      const bySku = await api('get', '/admin/products?q=u-1', manager);
      expect(bySku.body.data).toHaveLength(1);
    });
  });

  describe('variants', () => {
    const setup = async (sku = 'V-1') => {
      const res = await api('post', '/admin/products', manager).send(
        await productBody({ status: 'active', variants: [variantInput({ sku, size: 'M' })] }),
      );
      return res.body.data;
    };

    it('adds a variant and refreshes the derived fields', async () => {
      const p = await setup();
      const res = await api('post', `/admin/products/${p.id}/variants`, manager).send(
        variantInput({ sku: 'V-2', size: 'XL', stock: 6, price: 3900 }),
      );
      expect(res.status).toBe(201);
      expect(res.body.data.variants).toHaveLength(2);
      expect(res.body.data).toMatchObject({ priceMax: 3900, totalStock: 16 });
      expect(res.body.data.sizes).toEqual(['M', 'XL']);
      expect(await StockMovement.countDocuments({ sku: 'V-2', reason: 'initial' })).toBe(1);
    });

    it('rejects a duplicate size and color, or a SKU from another product', async () => {
      const p = await setup();
      const dupCombo = await api('post', `/admin/products/${p.id}/variants`, manager).send(
        variantInput({ sku: 'V-9', size: 'M' }),
      );
      expect(dupCombo.status).toBe(400);

      const other = await setup('V-OTHER');
      const dupSku = await api('post', `/admin/products/${other.id}/variants`, manager).send(
        variantInput({ sku: 'V-1', size: 'XL' }),
      );
      expect(dupSku.status).toBe(409);
    });

    it('updates a variant without touching its stock', async () => {
      const p = await setup();
      const variantId = p.variants[0].id;
      const res = await api('patch', `/admin/products/${p.id}/variants/${variantId}`, manager).send(
        {
          price: 3000,
          stock: 999,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.data.variants[0]).toMatchObject({ price: 3000, stock: 10 });
    });

    it('removes a variant but protects the last active one of a published product', async () => {
      const p = await setup();
      const added = await api('post', `/admin/products/${p.id}/variants`, manager).send(
        variantInput({ sku: 'V-3', size: 'L' }),
      );
      const [first, second] = added.body.data.variants;

      expect(
        (await api('delete', `/admin/products/${p.id}/variants/${first.id}`, manager)).status,
      ).toBe(200);
      const last = await api('delete', `/admin/products/${p.id}/variants/${second.id}`, manager);
      expect(last.status).toBe(409);
    });

    it('answers 404 for an unknown variant', async () => {
      const p = await setup();
      const res = await api(
        'patch',
        `/admin/products/${p.id}/variants/${'a'.repeat(24)}`,
        manager,
      ).send({ isActive: false });
      expect(res.status).toBe(404);
    });
  });
});
