import { connectDB, disconnectDB } from '../config/db';
import { logger } from '../config/logger';
import { seedRoles, seedSuperAdmin } from './index';

/** Usage: npm run seed [-- --sync-permissions] */
async function main() {
  const syncPermissions = process.argv.includes('--sync-permissions');
  await connectDB();
  try {
    await seedRoles({ syncPermissions });
    await seedSuperAdmin();
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Seeding failed');
  process.exit(1);
});
