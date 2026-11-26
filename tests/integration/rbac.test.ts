import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { PERMISSIONS, ROLES } from '../../src/constants';
import {
  authenticate,
  authorize,
  authorizeAny,
  optionalAuth,
  requireVerifiedEmail,
} from '../../src/middlewares/auth';
import { Role, User } from '../../src/models';
import { seedRoles, seedSuperAdmin } from '../../src/seeders';
import { sendSuccess } from '../../src/utils/apiResponse';
import { assertOwnerOrPermission } from '../../src/utils/ownership';
import { sessionCookieFor, uniqueEmail } from '../helpers/auth';
import { createTestApp } from '../helpers/createTestApp';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

/** The real app issues sessions; this app has routes that exercise each middleware. */
const realApp = createApp();
const guardedApp = createTestApp((r) => {
  r.get('/public', optionalAuth, (req, res) => sendSuccess(res, { user: req.user?.email ?? null }));
  r.get('/me-only', authenticate, (req, res) => sendSuccess(res, { id: req.user!.id }));
  r.get('/users', authenticate, authorize(PERMISSIONS.USER_READ), (_req, res) =>
    sendSuccess(res, []),
  );
  r.get(
    '/orders',
    authenticate,
    authorizeAny(PERMISSIONS.ORDER_READ_OWN, PERMISSIONS.ORDER_READ_ANY),
    (_req, res) => sendSuccess(res, []),
  );
  r.get(
    '/super',
    authenticate,
    authorize(PERMISSIONS.ADMIN_MANAGE, PERMISSIONS.SYSTEM_CONFIGURE),
    (_req, res) => sendSuccess(res, []),
  );
  r.get('/checkout', authenticate, requireVerifiedEmail, (_req, res) =>
    sendSuccess(res, { ok: true }),
  );
  // Ownership: the path segment stands in for the owner id of the requested order.
  r.get('/orders/:ownerId', authenticate, (req, res) => {
    const ownerId = req.params.ownerId as string;
    assertOwnerOrPermission(req.user!, ownerId, PERMISSIONS.ORDER_READ_ANY, 'Order');
    sendSuccess(res, { ownerId });
  });
});

const get = (path: string, cookie?: string) => {
  const req = request(guardedApp).get(path);
  return cookie ? req.set('Cookie', cookie) : req;
};

describeDb('RBAC middleware', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
  });

  it('answers 401 without a token and for invalid tokens', async () => {
    expect((await get('/me-only')).status).toBe(401);
    expect((await get('/me-only').set('Authorization', 'Bearer junk')).status).toBe(401);
  });

  it('treats guests as guests on optional-auth routes, even with a bad token', async () => {
    expect((await get('/public')).body.data.user).toBeNull();
    expect((await get('/public').set('Authorization', 'Bearer junk')).body.data.user).toBeNull();
  });

  it('identifies signed-in users on optional-auth routes', async () => {
    const { cookie, email } = await sessionCookieFor(realApp);
    expect((await get('/public', cookie)).body.data.user).toBe(email);
  });

  it('lets a customer in as themselves but keeps them out of back-office routes', async () => {
    const { cookie } = await sessionCookieFor(realApp, ROLES.CUSTOMER);
    expect((await get('/me-only', cookie)).status).toBe(200);
    expect((await get('/users', cookie)).status).toBe(403);
    expect((await get('/orders', cookie)).status).toBe(200);
  });

  it('grants permissions through roles', async () => {
    const staff = await sessionCookieFor(realApp, ROLES.STAFF);
    const admin = await sessionCookieFor(realApp, ROLES.ADMIN);
    const superAdmin = await sessionCookieFor(realApp, ROLES.SUPER_ADMIN);

    expect((await get('/users', staff.cookie)).status).toBe(403);
    expect((await get('/users', admin.cookie)).status).toBe(200);
    expect((await get('/super', admin.cookie)).status).toBe(403);
    expect((await get('/super', superAdmin.cookie)).status).toBe(200);
  });

  it('applies permission changes to existing sessions immediately', async () => {
    const { cookie } = await sessionCookieFor(realApp, ROLES.CUSTOMER);
    expect((await get('/users', cookie)).status).toBe(403);

    await Role.updateOne(
      { name: ROLES.CUSTOMER },
      { $addToSet: { permissions: PERMISSIONS.USER_READ } },
    );
    expect((await get('/users', cookie)).status).toBe(200);

    await Role.updateOne(
      { name: ROLES.CUSTOMER },
      { $pull: { permissions: PERMISSIONS.USER_READ } },
    );
    expect((await get('/users', cookie)).status).toBe(403);
  });

  it('enforces ownership: 404 for other users resources, staff can read any', async () => {
    const customer = await sessionCookieFor(realApp, ROLES.CUSTOMER);
    const staff = await sessionCookieFor(realApp, ROLES.STAFF);
    const myId = (await get('/me-only', customer.cookie)).body.data.id;

    expect((await get(`/orders/${myId}`, customer.cookie)).status).toBe(200);
    expect((await get('/orders/someone-else', customer.cookie)).status).toBe(404);
    expect((await get('/orders/someone-else', staff.cookie)).status).toBe(200);
  });

  it('requires a verified email where asked', async () => {
    const { cookie, email } = await sessionCookieFor(realApp, ROLES.CUSTOMER, { verified: false });
    expect((await get('/checkout', cookie)).status).toBe(403);

    await User.updateOne({ email }, { isEmailVerified: true });
    expect((await get('/checkout', cookie)).status).toBe(200);
  });
});

describeDb('seeders', () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(clearTestDb);

  it('seeds every system role idempotently', async () => {
    await seedRoles();
    await seedRoles();
    const roles = await Role.find();
    expect(roles.map((r) => r.name).sort()).toEqual([...Object.values(ROLES)].sort());
    expect(roles.every((r) => r.isSystem)).toBe(true);
    expect(await mongoose.connection.collection('roles').countDocuments()).toBe(roles.length);
  });

  it('keeps customised permissions on re-seed unless asked to sync', async () => {
    await seedRoles();
    await Role.updateOne({ name: ROLES.STAFF }, { permissions: [PERMISSIONS.TICKET_REPLY] });

    await seedRoles();
    expect((await Role.findOne({ name: ROLES.STAFF }))!.permissions).toEqual([
      PERMISSIONS.TICKET_REPLY,
    ]);

    await seedRoles({ syncPermissions: true });
    expect((await Role.findOne({ name: ROLES.STAFF }))!.permissions.length).toBeGreaterThan(1);
  });

  it('creates a verified super admin once and never overwrites an existing one', async () => {
    await seedRoles();
    const email = uniqueEmail('root');
    expect(await seedSuperAdmin({ name: 'Root', email, password: 'Root-pass-123' })).toBeTruthy();

    const user = await User.findOne({ email }).populate<{ role: { name: string } }>('role');
    expect(user!.role.name).toBe(ROLES.SUPER_ADMIN);
    expect(user!.isEmailVerified).toBe(true);

    expect(await seedSuperAdmin({ name: 'Other', email, password: 'Different-pass-1' })).toBeNull();
    expect((await User.findOne({ email }))!.name).toBe('Root');
  });
});
