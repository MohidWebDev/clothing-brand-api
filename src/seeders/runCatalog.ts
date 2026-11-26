import { connectDB, disconnectDB } from '../config/db';
import { logger } from '../config/logger';
import { seedCatalog } from './catalog';

/** Usage: npm run seed:catalog */
async function main() {
  await connectDB();
  try {
    await seedCatalog();
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Catalog seeding failed');
  process.exit(1);
});
