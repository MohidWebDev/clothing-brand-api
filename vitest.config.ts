import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests must never talk to a real mail server or queue, whatever the developer's .env says.
    env: { AUTH_RATE_LIMIT_MAX: '1000', SMTP_HOST: '', REDIS_URL: '' },
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
