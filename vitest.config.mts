import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests must never talk to a real mail server or queue, whatever the developer's .env says.
    env: {
      // Generous limits: one test file makes hundreds of requests from a single address.
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT_MAX: '100000',
      SMTP_HOST: '',
      REDIS_URL: '',
    },
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
