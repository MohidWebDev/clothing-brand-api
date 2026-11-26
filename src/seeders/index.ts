import { ALL_ROLES, DEFAULT_ROLE_PERMISSIONS, ROLES } from '../constants';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { roleRepository } from '../repositories/role.repository';
import { userRepository } from '../repositories/user.repository';
import { hashPassword } from '../utils/password';

const DISPLAY_NAMES: Record<string, string> = {
  [ROLES.CUSTOMER]: 'Customer',
  [ROLES.STAFF]: 'Staff / Support',
  [ROLES.INVENTORY_MANAGER]: 'Inventory / Product Manager',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.SUPER_ADMIN]: 'Super Admin',
};

/**
 * Creates the system roles. Existing roles keep their permissions (admins may have tuned
 * them); pass `syncPermissions` to reset them to the defaults in code.
 */
export async function seedRoles({ syncPermissions = false } = {}) {
  for (const name of ALL_ROLES) {
    await roleRepository.upsertSystemRole(
      {
        name,
        displayName: DISPLAY_NAMES[name] ?? name,
        permissions: [...DEFAULT_ROLE_PERMISSIONS[name]],
      },
      syncPermissions,
    );
  }
  logger.info(`Seeded ${ALL_ROLES.length} roles${syncPermissions ? ' (permissions synced)' : ''}`);
}

interface AdminSeed {
  name: string;
  email: string;
  password: string;
}

/** Creates the first super admin from SEED_ADMIN_* env vars (or the given values). */
export async function seedSuperAdmin(input?: AdminSeed) {
  const seed =
    input ??
    (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD
      ? {
          name: env.SEED_ADMIN_NAME,
          email: env.SEED_ADMIN_EMAIL,
          password: env.SEED_ADMIN_PASSWORD,
        }
      : null);

  if (!seed) {
    logger.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping super admin');
    return null;
  }

  const email = seed.email.trim().toLowerCase();
  if (await userRepository.emailExists(email)) {
    logger.info('Super admin already exists, leaving it untouched');
    return null;
  }

  const role = await roleRepository.findByName(ROLES.SUPER_ADMIN);
  if (!role) throw new Error('Run seedRoles() before seedSuperAdmin()');

  const user = await userRepository.create({
    name: seed.name,
    email,
    passwordHash: await hashPassword(seed.password),
    role: role._id,
    isEmailVerified: true,
  });
  logger.info(`Created super admin ${email}`);
  return user;
}
