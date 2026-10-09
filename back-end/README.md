# Back-end — Payment Gateway API

NestJS + Prisma + PostgreSQL API for the mobile-first checkout.

See the root [`README.md`](../README.md) for the full overview, architecture, data model,
environment variables and how to run the whole project.

## Layout

- `src/domain` — entities, value objects and repository ports (no framework imports).
- `src/application` — use cases returning a typed `Result` (Railway Oriented Programming) and the `Result` helpers.
- `src/infrastructure` — Prisma repository, HTTP (controllers, filter, Swagger, `configureApp`) and config.

## Run

```bash
cp ../.env.example ../.env   # then fill in the values
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```

Swagger UI is served at `http://localhost:3000/docs` (openAPI JSON at `/docs-json`).

Endpoints: `GET /products` and `GET /products/:id`.

## Tests

```bash
npm run lint
npm run build
npm run test:cov
npm run test:e2e
```
