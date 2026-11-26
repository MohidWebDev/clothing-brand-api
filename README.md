# clothing-brand-api

Backend API for the clothing brand e-commerce platform (Pakistan, PKR).

**Stack:** Node 22, Express 5, TypeScript, MongoDB (Mongoose), Redis + BullMQ, Zod, Pino.

## Getting started

```bash
cp .env.example .env
docker compose up -d      # MongoDB + Redis
npm install
npm run seed              # system roles + first super admin (set SEED_ADMIN_* in .env)
npm run dev               # http://localhost:4000/api/v1/health, docs at /api/docs
```

Local services (`docker compose up -d`): MongoDB, Redis, and **Mailpit**, which catches outgoing email.
Open http://localhost:8025 to read verification and password-reset emails.

## Scripts

| Script                            | Purpose                           |
| --------------------------------- | --------------------------------- |
| `npm run dev`                     | Start with hot reload             |
| `npm run build` / `npm start`     | Compile to `dist/` and run        |
| `npm run lint` / `npm run format` | ESLint / Prettier                 |
| `npm run typecheck`               | TypeScript check without emitting |
| `npm test`                        | Vitest (unit + integration)       |

## Structure

Layered architecture: `routes → controllers → services → repositories → models`.

```
src/
  config/        env validation, logger, db, storage, payments
  constants/     roles, permissions, order statuses
  models/        Mongoose schemas
  routes/v1/     versioned route definitions
  controllers/   request/response handling
  services/      business logic
  repositories/  database access
  middlewares/   auth, role check, validation, errors, rate limit
  validators/    Zod request schemas
  jobs/          BullMQ queues and workers
  utils/         tokens, API errors, response format
  templates/     transactional email templates
  docs/          OpenAPI / Swagger
  seeders/       roles, admin user, sample data
tests/           unit, integration, helpers
```

## Conventions

- Conventional commits (enforced by commitlint via Husky).
- Pre-commit runs lint-staged (ESLint + Prettier).
- Secrets live in `.env` (git-ignored). Add new variables to `src/config/env.ts` and `.env.example`.

## Auth model

- **Sessions:** a 15-minute JWT access token plus a 30-day opaque refresh token, both in HTTP-only
  cookies (the refresh cookie is only sent to `/api/v1/auth`). Refresh tokens rotate on every use and
  reuse of an old one revokes the whole session family. `Authorization: Bearer` is also accepted.
- **RBAC:** roles live in the database and map to `resource:action` permissions
  (`src/constants/permissions.ts`). Routes use `authenticate` + `authorize(PERMISSIONS.X)`; user, role
  and permissions are re-read on every request, so changes apply immediately.
- **Ownership:** role is never enough on its own. Use `assertOwnerOrPermission` for per-user resources;
  it answers 404 (not 403) so ids cannot be probed.
- **Hardening:** argon2id hashing, account lockout, per-endpoint rate limits, enumeration-safe
  responses, single-use hashed email tokens, Origin-based CSRF check.
- **Cookies and deployment:** keep the web app and API on the same site (same parent domain, or proxy
  `/api` through the web host) and leave `COOKIE_SAMESITE=lax`. Fully cross-site setups need
  `COOKIE_SAMESITE=none` over HTTPS, and Safari may still block those cookies.

## Testing

Pure-logic tests always run. Tests that need infrastructure are skipped unless you provide it:

```bash
MONGODB_URI_TEST=mongodb://localhost:27017 REDIS_URL_TEST=redis://localhost:6379 npm test
```

CI runs everything against MongoDB 7 and Redis 7 service containers.
