import request from 'supertest';
import type { Express } from 'express';
import { ROLES, type RoleName } from '../../src/constants';
import { roleRepository } from '../../src/repositories/role.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { outbox } from '../../src/services/mailer.service';
import { hashPassword } from '../../src/utils/password';

export const PASSWORD = 'Sup3r-secret';

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}${++counter}-${Date.now()}@example.com`;

/** Registers through the API and returns a cookie-keeping agent signed in as that user. */
export async function registerUser(app: Express, overrides: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const email = uniqueEmail();
  const res = await agent
    .post('/api/v1/auth/register')
    .send({ name: 'Test User', email, password: PASSWORD, ...overrides });
  return { agent, email, res };
}

/** Creates a user with a given role directly in the database (e.g. staff, admin). */
export async function createUserWithRole(
  role: RoleName = ROLES.CUSTOMER,
  { password = PASSWORD, verified = true }: { password?: string; verified?: boolean } = {},
) {
  const roleDoc = await roleRepository.findByName(role);
  const email = uniqueEmail(role);
  const user = await userRepository.create({
    name: `Test ${role}`,
    email,
    passwordHash: await hashPassword(password),
    role: roleDoc!._id,
    isEmailVerified: verified,
  });
  return { user, email, password };
}

export async function loginAs(app: Express, email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  return { agent, res };
}

/** Pulls the token out of the latest email sent to an address. */
export function tokenFromEmail(to: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === to);
  const match = mail && /token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!match) throw new Error(`No email with a token found for ${to}`);
  return match[1]!;
}

export const emailsTo = (to: string) => outbox.filter((m) => m.to === to);

/** Creates a user with the given role and returns a Cookie header for their session. */
export async function sessionCookieFor(
  app: Express,
  role: RoleName = ROLES.CUSTOMER,
  options: { verified?: boolean } = {},
) {
  const { email, password } = await createUserWithRole(role, options);
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  const cookie = (res.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0]!)
    .join('; ');
  return { cookie, email };
}
