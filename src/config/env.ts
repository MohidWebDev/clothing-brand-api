import 'dotenv/config';
import { z } from 'zod';

const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0000000000';

/**
 * Environment variables are validated once at startup. The app refuses to boot
 * with a clear message if something is missing or malformed.
 * New variables are added here as each phase needs them.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_NAME: z.string().min(1).default('Clothing Brand'),

    /** Primary frontend URL: used for CORS and for links inside emails. */
    CLIENT_URL: z.string().url().default('http://localhost:5173'),
    /** Extra allowed origins, comma separated (e.g. a Vercel preview domain). */
    CORS_EXTRA_ORIGINS: z.string().default(''),

    MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/clothing-brand'),
    /** Optional in development: without Redis, emails are sent inline instead of queued. */
    REDIS_URL: z.string().optional(),

    /** Number of reverse proxies in front of the app (Render/Railway/Nginx = 1). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    DOCS_ENABLED: z.stringbool().default(true),

    // --- Auth ---
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().positive().default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    /** Use `none` only when the web app and API are on different sites (needs HTTPS). */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),

    // --- Email (SMTP) ---
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z.stringbool().default(false),
    EMAIL_FROM: z.string().min(1).default('Clothing Brand <no-reply@localhost>'),

    // --- Seeding ---
    SEED_ADMIN_NAME: z.string().default('Super Admin'),
    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Must be set to a strong secret in production',
      });
    }
  });

// `KEY=` lines in a .env file arrive as empty strings; treat them as unset.
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const allowedOrigins = [
  env.CLIENT_URL,
  ...env.CORS_EXTRA_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
].map((o) => o.replace(/\/$/, ''));
