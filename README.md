# clothing-brand-api

Backend API for the clothing brand e-commerce platform (Pakistan, PKR).

**Stack:** Node 22, Express 5, TypeScript, MongoDB (Mongoose), Redis + BullMQ, Zod, Pino.

## Getting started

```bash
cp .env.example .env
docker compose up -d      # MongoDB + Redis
npm install
npm run dev               # http://localhost:4000/api/v1/health
```

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
