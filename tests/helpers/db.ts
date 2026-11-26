import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe } from 'vitest';

/**
 * Database-backed tests need a real MongoDB. They run when MONGODB_URI_TEST is set (CI does
 * this) and are skipped otherwise, e.g.  MONGODB_URI_TEST=mongodb://localhost:27017 npm test
 */
export const describeDb = process.env.MONGODB_URI_TEST ? describe : describe.skip;

/** Connects to a throwaway database so test files can run in parallel without colliding. */
export async function connectTestDb() {
  await mongoose.connect(process.env.MONGODB_URI_TEST!, {
    dbName: `test_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
  });
  // Build indexes up front so unique constraints are enforced from the first test.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function clearTestDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function disconnectTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
