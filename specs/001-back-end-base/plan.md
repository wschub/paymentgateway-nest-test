# Implementation Plan: Back-end Base - Product Catalog API

**Branch**: `001-back-end-base` | **Date**: 2026-10-07 | **Spec**: specs/001-back-end-base/spec.md
**Data model**: specs/001-back-end-base/data-model.md

## Summary

Build the back-end foundation inside the existing `back-end/` NestJS project (already scaffolded with
`nest new`, CommonJS + Jest; do NOT re-run `nest new`). Deliver: hexagonal structure, Prisma schema for the
four entities, a CHECK-constrained migration, an idempotent seed, `GET /products`, `GET /products/:id`,
consistent error bodies, security baseline and Swagger docs.

Scope decision: the database schema covers all four entities (Product, Customer, Transaction, Delivery);
domain entities, ports, repositories and use cases are implemented for **Product only**. The others arrive
in feature 002 when a use case needs them.

## Technical Context
Prisma 6.14.0 pinned (prisma and @prisma/client same exact version), default client output in node_modules, provider prisma-client-js. Do not upgrade to Prisma 7.

- **Language/Version**: TypeScript (strict) on Node.js LTS, NestJS
- **Dependencies to add**: `@nestjs/config`, `@nestjs/swagger`, `@nestjs/throttler`, `helmet`,
  `class-validator`, `class-transformer`, `@prisma/client`, `prisma` (dev)
- **Storage**: PostgreSQL via Prisma; local DB with docker-compose (Postgres only)
- **Testing**: Jest (unit colocated as `*.spec.ts`, e2e in `test/` with supertest), coverage threshold 80%
- **Project type**: REST API, monorepo (`back-end/`, `front-end/`, `docs/`, `specs/`)
- **Constraints**: hexagonal, ROP, `stock >= 0` CHECK, money as integers in COP minor units

## Key Decisions

1. **IDs are UUIDs** (`@db.Uuid`): no sequential ids exposed. Malformed id -> 400 via `ParseUUIDPipe`.
2. **Swagger at `/docs`** (JSON at `/docs-json`), no global `/api` prefix: routes are `/products`, `/products/:id`.
3. **Ports** are TypeScript interfaces in `domain/ports`. **Use cases are plain classes** with no Nest
   imports; they are wired in the Nest module with `useFactory` providers and injection tokens.
4. **Result type** is a small custom discriminated union (`ok`/`err`, `map`, `flatMap`, `match`), no extra dependency.
5. **Controllers live under `infrastructure/http`** (driving adapter). They only parse input, call a use case
   and map the `Result` to an HTTP response through one shared mapper.
6. **Error body** (all errors, including framework ones, via one global filter):
   `{ statusCode, code, message, path, timestamp }`. Never stack traces or internals.
7. **CHECK constraints** go in a hand-edited SQL migration (`prisma migrate dev --create-only`), because
   `schema.prisma` cannot express them.
8. **Seed** is idempotent (`upsert` with fixed UUIDs), 8 to 10 tech accessories. `imageUrl` is a relative
   path (`/images/products/<slug>.webp`) served by the front-end; image files are added in the front-end feature.
9. **App bootstrap** is a `configureApp(app)` function (Helmet, CORS from env, ValidationPipe with
   `whitelist` and `forbidNonWhitelisted`, throttling, filter, Swagger) reused by `main.ts` and by e2e tests.
10. **Env config** validated at startup (fail fast): `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`,
    `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`. `.env.example` has the keys with empty values.
11. **Coverage**: global threshold 80% in Jest config; excluded from measurement and listed in the README:
    `main.ts`, `*.module.ts`, `*.dto.ts`, `prisma/seed.ts`.
12. **Repository errors**: the port methods throw; the Prisma adapter wraps any Prisma failure in DataAccessError (keeping cause); use cases convert only DataAccessError into err(...) and let any other error propagate to the global filter (generic 500).

## Constitution Check

| Principle | Gate | How it is verified |
|-----------|------|--------------------|
| I Source of truth | Behavior matches docs/requirements.md | Spec/plan review |
| II Hexagonal | domain has no framework or infra imports; use cases never import Prisma or Nest | Folder structure; lint rule or import check; unit tests with fakes |
| III Testing | Tests first for domain and use cases; Jest; coverage >= 80% enforced | `coverageThreshold` fails the run |
| IV ROP | Use cases return `Result`; no throws for business failures | Unit tests on err paths |
| V Security | Helmet, restricted CORS, rate limiting, validation, safe errors, no secrets committed | e2e tests on headers, CORS, 429 and error body |
| VI Integrity | `stock >= 0` and other CHECKs, FKs, enums, integer money | Migration SQL; manual insert of stock -1 must fail |
| VII Simplicity | Product-only domain in this feature; no provider names | grep check; review |

## Project Structure

### Documentation (this feature)

```text
specs/001-back-end-base/
├── spec.md
├── plan.md
├── data-model.md
└── tasks.md
```

### Source Code

```text
back-end/
├── src/
│   ├── domain/
│   │   ├── entities/            # Product
│   │   ├── ports/               # ProductRepository (interface)
│   │   └── errors/              # ProductNotFoundError, DataAccessError
│   ├── application/
│   │   ├── result/              # Result type + helpers
│   │   └── use-cases/           # GetProducts, GetProductById
│   ├── infrastructure/
│   │   ├── config/              # env validation
│   │   ├── persistence/         # PrismaService, PrismaProductRepository
│   │   ├── http/                # controllers, dto, filters, result mapper, configureApp, swagger
│   │   └── modules/             # Nest modules and useFactory wiring
│   ├── main.ts
│   └── app.module.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/              # includes the hand-edited CHECK migration
│   └── seed.ts
└── test/                        # e2e (supertest) with an in-memory fake overriding the port
docker-compose.yml               # repo root, Postgres only
.env.example
```

**Structure Decision**: three layers (domain, application, infrastructure) as defined in the constitution.
HTTP controllers are driving adapters inside infrastructure.

## Testing Strategy

- **Unit (TDD)**: Result helpers, use cases with an in-memory fake repository, error mapper and filter,
  Prisma repository adapter with a mocked PrismaService.
- **e2e**: `GET /products` (list, empty, stock 0 listed), `GET /products/:id` (200, 404, 400), security
  headers, CORS rejection, rate limiting (429), safe 500 on repository failure, `/docs` reachable.
- **Manual DB check** (documented in the README): inserting `stock = -1` is rejected.

## Risks

- Prisma version differences for the seed command: configure it per the installed version.
- Throttling can interfere with e2e tests: use a low limit only inside the rate-limit test.
