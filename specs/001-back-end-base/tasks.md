---

description: "Task list for Back-end Base - Product Catalog API"
---

# Tasks: Back-end Base - Product Catalog API

**Input**: Design documents from `/specs/001-back-end-base/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md: monorepo with `back-end/` containing NestJS app following hexagonal architecture (domain, application, infrastructure, controllers), Prisma in `prisma/`, tests in `test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create back-end project structure per implementation plan (back-end/src/{domain,application,infrastructure,controllers}, back-end/prisma, back-end/test)
- [ ] T002 Initialize NestJS + TypeScript project in back-end/ with core dependencies (NestJS, Prisma, @nestjs/swagger, class-validator, class-transformer, @prisma/client)
- [ ] T003 [P] Configure linting and formatting (ESLint, Prettier) in back-end/
- [ ] T004 [P] Configure Jest for testing in back-end/
- [ ] T005 Create root-level docker-compose.yml for PostgreSQL and docker files as needed (back-end/Dockerfile, docker-compose.yml)
- [ ] T006 [P] Create .env.example with empty values per requirements

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Define Prisma schema for Product, Customer, Transaction, Delivery with constraints (stock >= 0 CHECK, unique keys, foreign keys, enums for transaction status) - money as integers in minor units (COP)
- [ ] T008 Create Prisma migration and setup seed.ts with 8-10 tech-accessory products (WebP images)
- [ ] T009 [P] Setup database module and Prisma service in infrastructure layer
- [ ] T010 [P] Setup common error handling (consistent error response format), validation pipes, exception filters
- [ ] T011 [P] Configure security middleware: Helmet, CORS (restricted), rate limiting basics
- [ ] T012 [P] Setup Swagger/OpenAPI configuration accessible at public path
- [ ] T013 Create base domain entities/value objects and ports interfaces (Product, Customer, Transaction, Delivery ports)
- [ ] T014 [P] Setup application result types (Railway Oriented Programming pattern with Result)
- [ ] T015 Configure environment configuration management

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Browse Products (Priority: P1) 🎯 MVP

**Goal**: Provide GET /products endpoint to list all products with stock information

**Independent Test**: Call GET /products and receive array of products with complete data (200 OK)

### Tests for User Story 1

- [ ] T016 [P] [US1] Contract test for GET /products in back-end/test/contract/products.get.spec.ts
- [ ] T017 [P] [US1] Integration test for browsing products in back-end/test/integration/products-list.spec.ts

### Implementation for User Story 1

- [ ] T018 [P] [US1] Create Product domain entity in back-end/src/domain/entities/product.entity.ts
- [ ] T019 [P] [US1] Create Product repository port interface in back-end/src/domain/ports/product.repository.port.ts
- [ ] T020 [US1] Implement GetProducts use case with Result pattern in back-end/src/application/use-cases/get-products.use-case.ts (depends on T018, T019)
- [ ] T021 [US1] Implement Product repository adapter (Prisma) in back-end/src/infrastructure/repositories/product.repository.ts (depends on T009, T019)
- [ ] T022 [US1] Implement Products controller with GET /products in back-end/src/controllers/products.controller.ts (depends on T020)
- [ ] T023 [US1] Wire up modules (domain/application/infrastructure/controllers) in app.module.ts
- [ ] T024 [US1] Add validation and consistent error handling for products endpoints

**Checkpoint**: US1 functional - GET /products works independently

---

## Phase 4: User Story 2 - View Product Details (Priority: P1)

**Goal**: Provide GET /products/:id endpoint with proper error handling (404, 400)

**Independent Test**: Call GET /products/:id with valid id returns 200; non-existent returns 404; malformed returns 400 with consistent error body

### Tests for User Story 2

- [ ] T025 [P] [US2] Contract test for GET /products/:id (success, 404, 400 cases) in back-end/test/contract/product.get-by-id.spec.ts
- [ ] T026 [P] [US2] Integration test for viewing product details with error cases in back-end/test/integration/product-detail.spec.ts

### Implementation for User Story 2

- [ ] T027 [US2] Implement GetProductById use case with Result pattern and proper error types in back-end/src/application/use-cases/get-product-by-id.use-case.ts (depends on T018, T019)
- [ ] T028 [US2] Add GET /products/:id endpoint to Products controller with id validation (parseInt/uuid as appropriate) in back-end/src/controllers/products.controller.ts (depends on T027)
- [ ] T029 [US2] Define error types for NotFound and BadRequest with consistent error body format
- [ ] T030 [US2] Ensure exception filter returns consistent error responses for all cases

**Checkpoint**: US1 and US2 both functional independently

---

## Phase 5: User Story 3 - API Documentation (Priority: P2)

**Goal**: Swagger API documentation accessible at public path documenting both endpoints

**Independent Test**: Swagger UI accessible and shows GET /products and GET /products/:id endpoints

### Implementation for User Story 3

- [ ] T031 [US3] Configure Swagger with proper API metadata, tags, and document both product endpoints with request/response schemas
- [ ] T032 [US3] Add DTOs with class-validator decorators and Swagger decorators for API documentation
- [ ] T033 [US3] Verify Swagger is accessible at public path (e.g., /api/docs or /docs as configured)

**Checkpoint**: All user stories functional independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalization, testing, documentation

- [ ] T034 [P] Create README with setup instructions, how to run, test, API docs link, architecture overview (hexagonal), data model diagram reference
- [ ] T035 [P] Add/update .env.example with all required env vars (database, app config)
- [ ] T036 Run all unit/integration tests and verify ≥ 80% coverage for backend
- [ ] T037 [P] Verify security: security headers present, CORS restricted, input validation working, safe error messages
- [ ] T038 Verify seed data loads correctly (8-10 products with WebP images)
- [ ] T039 Final validation: API starts from clean state with docker-compose, all endpoints behave as specified
- [ ] T040 [P] Code cleanup, ensure no provider company names anywhere, follow constitution principles

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS** all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 (P1), US2 (P1), US3 (P2) can proceed in parallel after Foundation; US2 depends conceptually on US1's entities/ports but can be implemented once foundation + Product entity/port exist
- **Polish (Phase 6)**: Depends on all user stories complete

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel
- Foundational tasks marked [P] can run in parallel
- Once Foundation complete: US1 tests (T016,T017) parallel; US1 implementation pieces (T018,T019) parallel; US2 tests parallel after understanding; etc.
- Polish tasks marked [P] can run in parallel where independent

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story must be independently testable per spec
- Write tests first (TDD) - ensure they fail before implementation
- Follow hexagonal architecture strictly: domain has no deps on infra; application depends only on domain; infra implements ports; controllers use use cases
- Railway Oriented Programming with typed Result for use cases
- Money stored as integers in minor units (COP)
- Stock >= 0 enforced via DB CHECK constraint
- Consistent error body format across all endpoints
- No payment provider company names anywhere
