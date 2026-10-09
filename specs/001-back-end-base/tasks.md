---
description: "Task list for Back-end Base - Product Catalog API"
---

# Tasks: Back-end Base - Product Catalog API

**Input**: `specs/001-back-end-base/` (spec.md, plan.md, data-model.md)

**Important**: `back-end/` already exists (created with `nest new`, CommonJS + Jest). Do NOT re-run
`nest new`. Work inside it. Do not run `git commit` or `git push`; the developer commits after each phase.

## Format: `[ID] [P?] [Story] Description (refs)`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3
- Write tests first for domain and use cases (Red-Green-Refactor)

---

## Phase 1: Setup

- [ ] T001 Install dependencies in `back-end/`: `@nestjs/config`, `@nestjs/swagger`, `@nestjs/throttler`, `helmet`, `class-validator`, `class-transformer`, `@prisma/client`, and `prisma` (dev)
- [ ] T002 Create the folder structure from plan.md under `back-end/src` (domain, application, infrastructure) and `back-end/prisma`
- [ ] T003 [P] Verify `npm run lint` and `npm run build` pass on the scaffold; add scripts `test:cov` and `test:e2e` if missing
- [ ] T004 [P] Configure Jest: global `coverageThreshold` 80 (branches, functions, lines, statements); `collectCoverageFrom` excluding `main.ts`, `*.module.ts`, `*.dto.ts` (SC-007)
- [ ] T005 Create root `docker-compose.yml` with PostgreSQL only (named volume, healthcheck, credentials read from `.env`)
- [ ] T006 [P] Create `.env.example` with empty values: `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; confirm `.env` is git-ignored

---

## Phase 2: Foundational (blocks all user stories)

- [ ] T007 Define `back-end/prisma/schema.prisma` for Product, Customer, Transaction, Delivery exactly as in data-model.md (UUID ids, enums, FKs, unique keys, indexes, `*InCents` Int fields) (FR-007, FR-008)
- [X] T008 Create the migration with `prisma migrate dev --create-only`, edit the generated SQL to add the CHECK constraints listed in data-model.md, then apply it. Verify manually that inserting `stock = -1` fails and note the check in the README (FR-006)
- [X] T009 [P] Create idempotent `back-end/prisma/seed.ts` (upsert with fixed UUIDs, 8 to 10 tech accessories, relative `.webp` image paths); configure the seed command for the installed Prisma version; run it twice to prove idempotency (FR-009, SC-002)
- [X] T010 [P] Environment config with startup validation (fail fast on missing variables) in `back-end/src/infrastructure/config/`
- [X] T011 [P] `PrismaService` and its module in `back-end/src/infrastructure/persistence/`
- [X] T012 [P] Write unit tests, then implement the `Result` type (`ok`, `err`, `map`, `flatMap`, `match`) in `back-end/src/application/result/`
- [X] T013 [P] Domain for Product only: `Product` entity, `ProductRepository` port (interface), errors `ProductNotFoundError` and `DataAccessError` in `back-end/src/domain/`
- [X] T014 [P] Write unit tests, then implement the error body format `{ statusCode, code, message, path, timestamp }`, the global exception filter (also normalizes framework errors, never leaks internals) and the Result-to-HTTP error mapper in `back-end/src/infrastructure/http/` (FR-011)
- [X] T015 `configureApp(app)` in `back-end/src/infrastructure/http/`: Helmet, CORS from `CORS_ORIGINS`, `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), throttling, global filter; used by `main.ts` and by e2e tests (FR-012)

**Checkpoint**: foundation ready

---

## Phase 3: User Story 1 - Browse Products (P1) MVP

**Independent test**: `GET /products` returns 200 with the full product list

### Tests first

- [X] T016 [P] [US1] Unit tests for `GetProductsUseCase` with an in-memory fake repository: full list, empty list (returns empty array), product with stock 0 still listed, repository failure returns `err`
- [X] T017 [P] [US1] e2e test `back-end/test/products-list.e2e-spec.ts` using the fake repository override: 200 with expected fields (id, name, description, priceInCents, stock, imageUrl), empty catalog returns `[]`

### Implementation

- [X] T018 [US1] Implement `GetProductsUseCase` returning `Result` in `back-end/src/application/use-cases/` (FR-001)
- [X] T019 [US1] Implement `PrismaProductRepository` (`findAll`) in `back-end/src/infrastructure/persistence/`; catch Prisma failures and return `err(DataAccessError)`; unit test with a mocked `PrismaService`
- [X] T020 [US1] `ProductsController` with `GET /products`, response DTO and mapper in `back-end/src/infrastructure/http/` (no business logic)
- [X] T021 [US1] Wire everything in Nest modules with `useFactory` providers and an injection token for the port; register in `app.module.ts`

**Checkpoint**: US1 works on its own

---

## Phase 4: User Story 2 - View Product Details (P1)

**Independent test**: `GET /products/:id` returns 200, 404 for unknown id, 400 for malformed id

### Tests first

- [X] T022 [P] [US2] Unit tests for `GetProductByIdUseCase` with the fake repository: found, not found (`err(ProductNotFoundError)`), repository failure
- [X] T023 [P] [US2] e2e tests `back-end/test/product-detail.e2e-spec.ts`: 200 with full object, 404 with consistent error body, 400 for a non-UUID id with the same body shape (FR-002 to FR-005)

### Implementation

- [X] T024 [US2] Implement `GetProductByIdUseCase` in `back-end/src/application/use-cases/`
- [X] T025 [US2] Add `findById` to `PrismaProductRepository` (and its unit test)
- [X] T026 [US2] Add `GET /products/:id` to the controller with `ParseUUIDPipe`; map `ProductNotFoundError` to 404 through the shared mapper

**Checkpoint**: US1 and US2 work independently

---

## Phase 5: User Story 3 - API Documentation (P2)

- [X] T027 [US3] Swagger setup in `configureApp`: UI at `/docs`, JSON at `/docs-json`; metadata and tags (FR-010)
- [X] T028 [US3] Swagger decorators on controller and DTOs: 200/400/404/500 responses and the shared error schema
- [X] T029 [US3] e2e test: `/docs` is reachable and `/docs-json` lists `/products` and `/products/{id}` (SC-008)

---

## Phase 6: Polish and verification

- [X] T030 [P] e2e security tests: Helmet headers present, no `x-powered-by`, CORS rejects a non-allowed origin, rate limit returns 429 (use a low limit only inside this test) (FR-012)
- [X] T031 [P] e2e test: repository failure produces a generic 500 body with no internal details
- [ ] T032 [P] Root `README.md`: overview, architecture (hexagonal layers), how to run (docker compose, migrate, seed, start), tests and coverage commands, Swagger path, the Mermaid ER diagram from data-model.md, coverage exclusions and the CHECK verification note
- [ ] T033 Run `npm run test:cov` and `npm run test:e2e`; confirm coverage is at least 80% and add the summary to the README (SC-007)
- [ ] T034 Clean-start validation: from a fresh clone run docker compose, migrate, seed, start, then call both endpoints with `curl` (SC-001, SC-003 to SC-006)
- [ ] T035 [P] Final checks: `npm run lint`, `npm run build`, search the repo for provider company names and for secrets, no files left from placeholders

---

## Dependencies

- Phase 1 then Phase 2, which blocks all stories
- US1 first (introduces the controller, repository and wiring); US2 extends them; US3 after both endpoints exist
- Within a story: tests, then use case, then adapter, then controller, then wiring
- Polish after all stories
