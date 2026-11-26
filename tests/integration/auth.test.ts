import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { RefreshToken, User, VerificationToken } from '../../src/models';
import { seedRoles } from '../../src/seeders';
import {
  PASSWORD,
  emailsTo,
  loginAs,
  registerUser,
  tokenFromEmail,
  uniqueEmail,
} from '../helpers/auth';
import { clearTestDb, connectTestDb, describeDb, disconnectTestDb } from '../helpers/db';

const app = createApp();
const cookieNames = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.map((c) => c.split('=')[0]) ?? [];

describeDb('auth API', () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    await seedRoles();
  });

  describe('POST /auth/register', () => {
    it('creates a customer, signs them in and sends a verification email', async () => {
      const { res, email } = await registerUser(app, { phone: '0300-1234567' });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        email,
        role: 'customer',
        isEmailVerified: false,
        phone: '+923001234567',
      });
      expect(res.body.data.user.permissions).toContain('order:read_own');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);

      expect(cookieNames(res)).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
      for (const cookie of res.headers['set-cookie'] as unknown as string[]) {
        expect(cookie).toContain('HttpOnly');
      }

      expect(emailsTo(email)).toHaveLength(1);
      expect(emailsTo(email)[0]!.subject).toContain('Verify');
    });

    it('stores only a hash of the password and of tokens', async () => {
      const { email } = await registerUser(app);
      const user = await User.findOne({ email }).select('+passwordHash');
      expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
      const token = tokenFromEmail(email);
      expect(await VerificationToken.countDocuments({ tokenHash: token })).toBe(0);
    });

    it('ignores attempts to choose a role', async () => {
      const { res } = await registerUser(app, { role: 'super_admin', isEmailVerified: true });
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.user.isEmailVerified).toBe(false);
    });

    it('rejects duplicate emails regardless of case', async () => {
      const { email } = await registerUser(app);
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Other', email: email.toUpperCase(), password: PASSWORD });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it.each([
      ['short password', { password: 'a1' }, 'password'],
      ['password without a number', { password: 'onlyletters' }, 'password'],
      ['bad email', { email: 'nope' }, 'email'],
      ['bad phone', { phone: '12345' }, 'phone'],
      ['short name', { name: 'A' }, 'name'],
    ])('validates: %s', async (_label, override, path) => {
      const { res } = await registerUser(app, override);
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    });
  });

  describe('POST /auth/login', () => {
    it('signs in with correct credentials', async () => {
      const { email } = await registerUser(app);
      const { res, agent } = await loginAs(app, email.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(email);
      expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const { email } = await registerUser(app);
      const wrong = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong-pass1' });
      const unknown = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: 'Wrong-pass1' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('locks the account after too many failures, even for the right password', async () => {
      const { email } = await registerUser(app);
      for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'Wrong-pass1' });
        expect(res.status).toBe(401);
      }
      const locked = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });
      expect(locked.status).toBe(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('lets the user back in once the lock has expired', async () => {
      const { email } = await registerUser(app);
      await User.updateOne({ email }, { lockUntil: new Date(Date.now() - 1000) });
      const { res } = await loginAs(app, email);
      expect(res.status).toBe(200);
      expect((await User.findOne({ email }))!.lockUntil).toBeUndefined();
    });

    it('resets the failure counter after a successful login', async () => {
      const { email } = await registerUser(app);
      for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS - 1; i++) {
        await request(app).post('/api/v1/auth/login').send({ email, password: 'Wrong-pass1' });
      }
      await loginAs(app, email);
      expect((await User.findOne({ email }))!.failedLoginAttempts).toBe(0);
    });

    it('refuses disabled accounts', async () => {
      const { email } = await registerUser(app);
      await User.updateOne({ email }, { isActive: false });
      const { res } = await loginAs(app, email);
      expect(res.status).toBe(403);
    });

    it('refuses soft-deleted accounts', async () => {
      const { email } = await registerUser(app);
      await User.updateOne({ email }, { deletedAt: new Date() });
      const { res } = await loginAs(app, email);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me and access tokens', () => {
    it('requires authentication', async () => {
      expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    });

    it('rejects a garbage bearer token', async () => {
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer nope');
      expect(res.status).toBe(401);
    });

    it('returns the user, role and permissions', async () => {
      const { agent, email } = await registerUser(app);
      const res = await agent.get('/api/v1/auth/me');
      expect(res.body.data.user).toMatchObject({ email, role: 'customer' });
    });

    it('stops working immediately when the account is disabled', async () => {
      const { agent, email } = await registerUser(app);
      await User.updateOne({ email }, { isActive: false });
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    });
  });

  describe('refresh token rotation', () => {
    const refreshCookie = (res: request.Response) =>
      (res.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('refreshToken='))!
        .split(';')[0]!;

    it('issues a new pair and invalidates the old refresh token', async () => {
      const { res: registered, email } = await registerUser(app);
      const oldCookie = refreshCookie(registered);

      const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
      expect(first.status).toBe(200);
      expect(refreshCookie(first)).not.toBe(oldCookie);
      expect(first.body.data.user.email).toBe(email);

      const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
      expect(reuse.status).toBe(401);
    });

    it('revokes the whole family when an old token is replayed after the grace period', async () => {
      const { res: registered } = await registerUser(app);
      const oldCookie = refreshCookie(registered);

      const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
      const newCookie = refreshCookie(rotated);

      // Pretend the rotation happened a minute ago, so a replay looks like theft.
      await RefreshToken.updateMany(
        { revokedAt: { $exists: true } },
        { revokedAt: new Date(Date.now() - 60_000) },
      );

      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status,
      ).toBe(401);
      // The legitimate holder of the newest token is signed out too.
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie)).status,
      ).toBe(401);
    });

    it('does not treat a near-simultaneous second refresh as theft', async () => {
      const { res: registered } = await registerUser(app);
      const oldCookie = refreshCookie(registered);

      const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
      const newCookie = refreshCookie(rotated);

      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status,
      ).toBe(401);
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie)).status,
      ).toBe(200);
    });

    it('only lets one of several concurrent refreshes win', async () => {
      const { res: registered } = await registerUser(app);
      const cookie = refreshCookie(registered);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('rejects missing, unknown and expired refresh tokens', async () => {
      expect((await request(app).post('/api/v1/auth/refresh')).status).toBe(401);
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', 'refreshToken=nonsense'))
          .status,
      ).toBe(401);

      const { res } = await registerUser(app);
      await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(res))).status,
      ).toBe(401);
    });

    it('refuses to refresh for a disabled user', async () => {
      const { res, email } = await registerUser(app);
      await User.updateOne({ email }, { isActive: false });
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(res))).status,
      ).toBe(401);
    });
  });

  describe('logout', () => {
    it('ends the session and clears the cookies', async () => {
      const { agent, res: registered } = await registerUser(app);
      const cookie = (registered.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('refreshToken='))!
        .split(';')[0]!;

      const res = await agent.post('/api/v1/auth/logout');
      expect(res.status).toBe(200);
      expect(cookieNames(res)).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));

      expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(
        401,
      );
    });

    it('succeeds even when not signed in', async () => {
      expect((await request(app).post('/api/v1/auth/logout')).status).toBe(200);
    });

    it('logout-all revokes every device', async () => {
      const { email, agent } = await registerUser(app);
      const other = await loginAs(app, email);
      expect((await agent.post('/api/v1/auth/logout-all')).status).toBe(200);
      expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
      expect(other.res.status).toBe(200);
    });
  });

  describe('email verification', () => {
    it('verifies the email with the emailed token, once or repeatedly', async () => {
      const { email, agent } = await registerUser(app);
      const token = tokenFromEmail(email);

      const first = await request(app).post('/api/v1/auth/verify-email').send({ token });
      expect(first.status).toBe(200);
      expect((await agent.get('/api/v1/auth/me')).body.data.user.isEmailVerified).toBe(true);

      // A double-click or double-fired effect must not show an error.
      const again = await request(app).post('/api/v1/auth/verify-email').send({ token });
      expect(again.status).toBe(200);
    });

    it('rejects invalid and expired tokens', async () => {
      expect(
        (
          await request(app)
            .post('/api/v1/auth/verify-email')
            .send({ token: 'x'.repeat(43) })
        ).status,
      ).toBe(400);

      const { email } = await registerUser(app);
      const token = tokenFromEmail(email);
      await VerificationToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(
        400,
      );
    });

    it('resends a fresh link and invalidates the old one', async () => {
      const { email, agent } = await registerUser(app);
      const oldToken = tokenFromEmail(email);

      expect((await agent.post('/api/v1/auth/resend-verification')).status).toBe(200);
      expect(emailsTo(email)).toHaveLength(2);
      const newToken = tokenFromEmail(email);
      expect(newToken).not.toBe(oldToken);

      expect(
        (await request(app).post('/api/v1/auth/verify-email').send({ token: oldToken })).status,
      ).toBe(400);
      expect(
        (await request(app).post('/api/v1/auth/verify-email').send({ token: newToken })).status,
      ).toBe(200);
    });

    it('does not resend to already verified users', async () => {
      const { email, agent } = await registerUser(app);
      await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: tokenFromEmail(email) });
      const res = await agent.post('/api/v1/auth/resend-verification');
      expect(res.body.message).toBe('Email is already verified');
      expect(emailsTo(email)).toHaveLength(1);
    });
  });

  describe('forgot and reset password', () => {
    it('answers identically for known and unknown emails, and only emails real users', async () => {
      const { email } = await registerUser(app);
      const ghost = uniqueEmail('ghost');

      const known = await request(app).post('/api/v1/auth/forgot-password').send({ email });
      const unknown = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: ghost });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);

      expect(emailsTo(email).filter((m) => m.subject.includes('Reset'))).toHaveLength(1);
      expect(emailsTo(ghost)).toHaveLength(0);
    });

    it('resets the password, signs out every device and consumes the token', async () => {
      const { email, agent } = await registerUser(app);
      await request(app).post('/api/v1/auth/forgot-password').send({ email });
      const token = tokenFromEmail(email);
      const newPassword = 'Brand-new-pass9';

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: newPassword });
      expect(res.status).toBe(200);

      expect((await loginAs(app, email, PASSWORD)).res.status).toBe(401);
      expect((await loginAs(app, email, newPassword)).res.status).toBe(200);

      // Existing sessions die: the old access token predates the password change.
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);

      // The link cannot be reused.
      const reuse = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another-pass9' });
      expect(reuse.status).toBe(400);

      // And the owner is told about the change.
      expect(emailsTo(email).some((m) => m.subject.includes('changed'))).toBe(true);
    });

    it('unlocks a locked account', async () => {
      const { email } = await registerUser(app);
      for (let i = 0; i < env.LOGIN_MAX_ATTEMPTS; i++) {
        await request(app).post('/api/v1/auth/login').send({ email, password: 'Wrong-pass1' });
      }
      await request(app).post('/api/v1/auth/forgot-password').send({ email });
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: tokenFromEmail(email), password: 'Fresh-pass99' });
      expect((await loginAs(app, email, 'Fresh-pass99')).res.status).toBe(200);
    });

    it('enforces the password policy and rejects bad tokens', async () => {
      const weak = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'x'.repeat(43), password: 'short' });
      expect(weak.status).toBe(400);

      const bad = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'x'.repeat(43), password: 'Valid-pass1' });
      expect(bad.status).toBe(400);
    });

    it('invalidates earlier reset links when a new one is requested', async () => {
      const { email } = await registerUser(app);
      await request(app).post('/api/v1/auth/forgot-password').send({ email });
      const first = tokenFromEmail(email);
      await request(app).post('/api/v1/auth/forgot-password').send({ email });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: first, password: 'Valid-pass1' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/change-password', () => {
    it('changes the password, keeps the caller signed in and signs out other devices', async () => {
      const { email, agent } = await registerUser(app);
      const other = await loginAs(app, email);

      const res = await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'Changed-pass1' });
      expect(res.status).toBe(200);

      expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
      expect((await other.agent.get('/api/v1/auth/me')).status).toBe(401);
      expect((await loginAs(app, email, 'Changed-pass1')).res.status).toBe(200);
    });

    it('requires the correct current password', async () => {
      const { agent } = await registerUser(app);
      const res = await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'Wrong-pass1', newPassword: 'Changed-pass1' });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].path).toBe('currentPassword');
    });

    it('rejects reusing the same password and requires authentication', async () => {
      const { agent } = await registerUser(app);
      const same = await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(same.status).toBe(400);

      const anon = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'Changed-pass1' });
      expect(anon.status).toBe(401);
    });
  });

  describe('CSRF origin check', () => {
    it('blocks state-changing requests from unknown origins', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
    });

    it('blocks cross-site requests that carry no Origin header', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Sec-Fetch-Site', 'cross-site');
      expect(res.status).toBe(403);
    });

    it('allows the configured frontend origin', async () => {
      const res = await request(app).post('/api/v1/auth/logout').set('Origin', env.CLIENT_URL);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(env.CLIENT_URL);
    });

    it('never blocks safe methods', async () => {
      const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
      expect(res.status).toBe(200);
    });
  });
});
