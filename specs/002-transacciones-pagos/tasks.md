# Tasks: Transactions and Card Payment Processing

**Input**: Design documents from `/specs/002-transacciones-pagos/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/rest-api.md`, `contracts/payment-provider.md`, `quickstart.md`

**Tests**: Included — the feature explicitly requests test-first work with in-memory fakes, a mocked `fetch`, e2e with a fake gateway, and a real-PostgreSQL integration suite (constitution III).

**Organization**: Tasks follow the team's requested **build order** so that **every task ends with lint, type-check, build and the relevant Jest suite green**. `[USx]` labels (`US1`–`US4`) preserve per-story traceability even though shared infrastructure is grouped into its own phases. Main tasks carry `(FR-xxx)` tags.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`–`[US4]`, only on tasks that deliver a story's acceptance criteria
- Every description ends with the exact file path(s) to touch and its `(FR-xxx)` tag

## Path Conventions

- Back-end only, inside the monorepo: `back-end/src/**`, `back-end/test/**`, `back-end/prisma/**`.
- Unit specs live next to the code (`*.spec.ts`); e2e specs in `back-end/test/` (`*.e2e-spec.ts`); integration specs in `back-end/test/integration/` (`*.int-spec.ts`).

**Per-task green gate** (end of every task): `cd back-end && npm run lint && npx tsc -p tsconfig.json --noEmit && npm run build && npm run test:cov` (plus `npm run test:e2e`, and `npm run test:int` once it exists, for e2e/integration tasks). Commit after each task or small logical group.

---

## Phase 1: Setup (data model, environment, hermetic tests)

**Purpose**: Add the new columns/constraints and the validated configuration the whole feature depends on, and make the test suite hermetic. Keeps the tree green at every step.

- [X] T001 [P] Create the hermetic test setup `back-end/test/setup-env.ts`: set non-secret placeholder values for every required variable (`DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `pub_stagtest`, `prv_stagtest`, `stagtest_events`, `stagtest_integrity`, `UAT_SANDBOX_URL`) **and replace `global.fetch` with a function that throws `network calls are forbidden in tests`**; register it via `setupFiles` in `back-end/jest.config.ts` and `back-end/test/jest-e2e.json`; **make the config module ignore the `.env` file when `NODE_ENV === 'test'`** in `back-end/src/infrastructure/config/config.module.ts` (+ `back-end/src/infrastructure/config/config.module.spec.ts`); add `back-end/test/setup-env.spec.ts` asserting the guard throws that exact message; **confirm the existing `NODE_ENV` validation already accepts `test` (it does, via the `NODE_ENVS` list) — if it did not, extend it in T003 with a dedicated test**.
- [X] T002 [P] Extend the Prisma schema and add a migration: add `installments Int?`, `card_brand String?`, `card_last_four String?`, `payment_started_at DateTime?` to the `transaction` model; add `CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$')`, `CHECK (installments IS NULL OR installments >= 1)`, and an index on `(status, created_at)`. Files: `back-end/prisma/schema.prisma`, `back-end/prisma/migrations/<timestamp>_payment_fields/migration.sql`.
- [X] T003 Extend `back-end/src/infrastructure/config/env.validation.ts` (+ `AppEnv`) with required non-empty strings `pub_stagtest`, `prv_stagtest`, `stagtest_events`, `stagtest_integrity` and `UAT_SANDBOX_URL` (must be an `http`/`https` URL); extend `back-end/src/infrastructure/config/env.validation.spec.ts`; **update `.env.example` with the provider variable names** (names only, no values). Depends on T001.
- [X] T004 Extend `back-end/src/infrastructure/config/env.validation.ts` with positive-integer options and defaults `BASE_FEE_IN_CENTS`=300000, `DELIVERY_FEE_IN_CENTS`=900000, `PAYMENT_TIMEOUT_MS`=10000, `RESERVATION_TTL_SECONDS`=900, `PAYMENT_CLAIM_LEASE_SECONDS`=120; extend `back-end/src/infrastructure/config/env.validation.spec.ts`; **add the fee and timer names to `.env.example` with every value left empty and the default shown as a comment next to each name** (`BASE_FEE_IN_CENTS` `# 300000`, `DELIVERY_FEE_IN_CENTS` `# 900000`, `PAYMENT_TIMEOUT_MS` `# 10000`, `RESERVATION_TTL_SECONDS` `# 900`, `PAYMENT_CLAIM_LEASE_SECONDS` `# 120`), and **add `TEST_DATABASE_URL` (empty)** for the integration suite (T056). Depends on T003.

**Checkpoint**: Schema and configuration ready; tests still hermetic and green.

---

## Phase 2: Foundational (domain errors, entities, value objects, ports, test doubles)

**Purpose**: The provider-agnostic domain and the test doubles every use case needs.

- [X] T005 [P] Create the business domain errors next to `back-end/src/domain/errors/product-not-found.error.ts`, each extending `Error` with a stable `code`: `back-end/src/domain/errors/insufficient-stock.error.ts`, `back-end/src/domain/errors/transaction-not-found.error.ts`, `back-end/src/domain/errors/transaction-not-payable.error.ts`, `back-end/src/domain/errors/contracts-not-accepted.error.ts`, `back-end/src/domain/errors/idempotency-key-reused.error.ts`, each with a sibling `*.spec.ts` (FR-012).
- [X] T006 [P] Create the provider/boundary errors: `back-end/src/domain/errors/invalid-payment-token.error.ts`, `back-end/src/domain/errors/payment-provider-unavailable.error.ts`, `back-end/src/domain/errors/payment-provider-rejected.error.ts`, each with a sibling `*.spec.ts` (FR-012).
- [X] T007 [P] Create the `Transaction` entity `back-end/src/domain/entities/transaction.entity.ts` (+ `back-end/src/domain/entities/transaction.entity.spec.ts`): `id` (uuid), `reference` (unique, non-empty, crypto-random, not only a timestamp), `idempotencyKey` (unique, 16–64 chars of `A-Za-z0-9_-`), `status` (`PENDING|APPROVED|DECLINED|VOIDED|ERROR`, starts `PENDING`), `quantity` (> 0), `productAmountInCents` (= `priceInCents * quantity`, > 0), `baseFeeInCents`/`deliveryFeeInCents` (≥ 0), `totalInCents` (= sum), `providerTransactionId`/`installments`/`cardBrand`/`cardLastFour`/`failureReason` (nullable), timestamps (FR-010).
- [X] T008 [P] Create the `Customer` entity `back-end/src/domain/entities/customer.entity.ts` (+ `back-end/src/domain/entities/customer.entity.spec.ts`): `fullName` non-empty ≤ 120, `email` valid, `phone` non-empty 7–20 chars of digits/`+`/spaces (FR-011).
- [X] T009 [P] Create the `Delivery` entity `back-end/src/domain/entities/delivery.entity.ts` (+ `back-end/src/domain/entities/delivery.entity.spec.ts`): `status` (`PENDING|ASSIGNED`, starts `PENDING`), `address`/`city`/`region` non-empty, `notes` nullable ≤ 500, `assignedAt` nullable (FR-011).
- [ ] T010 [P] Create the testability seams (value object + ports) with specs: `back-end/src/domain/value-objects/fees-config.ts` (`FeesConfig` value object `baseFeeInCents`, `deliveryFeeInCents`, `currency`), `back-end/src/domain/ports/clock.port.ts` (`Clock.now(): Date`) and `back-end/src/domain/ports/reference-generator.port.ts` (`ReferenceGenerator.newReference(): string`, crypto randomness) + sibling `*.spec.ts` (FR-002).
- [ ] T011 [P] Create the `PaymentGateway` port `back-end/src/domain/ports/payment-gateway.port.ts` (+ spec): `MerchantInfo`, `ProviderTransaction` (status enum), `CreateCardTransactionInput`, and `getMerchantInfo()`, `createCardTransaction(input)`, `getTransaction(id)`, `findByReference(reference)` (FR-005).
- [ ] T012 [P] Create the `TransactionRepository` port `back-end/src/domain/ports/transaction.repository.ts` (+ spec): `findById` and `findByIdempotencyKey` (each returning the **`TransactionDetails`** aggregate — transaction + customer + delivery + product `{ id, name }`), `releaseExpiredReservations(now)`, `createPendingWithReservedStock(input)` returning `created|out_of_stock|product_not_found|duplicate`, `claimPayment(transactionId, now, leaseSeconds)`, `attachProviderTransaction(...)`, `finalize(...)` returning `{ finalized, transaction }` (FR-004, FR-008, FR-014).
- [ ] T013 [P] Create the in-memory repository double `back-end/src/testing/in-memory-transaction.repository.ts` (+ spec): implements `TransactionRepository`, supports stock, idempotency lookup, lease CAS, finalize side effects and `releaseExpiredReservations`.
- [ ] T014 [P] Create the fake gateway double `back-end/src/testing/fake-payment-gateway.ts` (+ spec): implements `PaymentGateway`, enqueues statuses (approved/declined/error/unknown), records calls, simulates timeout/4xx/5xx and reconcile-by-reference.

**Checkpoint**: Domain, seams, ports and doubles ready; use cases can be built test-first.

---

## Phase 3: User Story 1 - Pay by card and get an approved result (Priority: P1) 🎯 MVP

**Goal**: The full vertical slice of the happy path, expressed as application use cases.

**Independent Test**: With in-memory fakes, `CreateTransaction` reserves stock and returns the server-computed breakdown; `PayTransaction` creates the provider transaction once; `GetTransaction` finalizes an approved purchase and assigns the delivery.

### Use cases (test-first, one behavior per task)

- [ ] T015 [US1] Implement `CreateTransaction` happy path `back-end/src/application/use-cases/create-transaction.use-case.ts` (+ spec): it also depends on the existing **`ProductRepository`** (products port) to read the product `priceInCents`, then builds a `PENDING` purchase through the `TransactionRepository`, computes `productAmountInCents = priceInCents * quantity` and `baseFeeInCents`/`deliveryFeeInCents` from the injected **`FeesConfig`**, `totalInCents = sum`, generates the `reference` via the injected **`ReferenceGenerator`** and uses the injected **`Clock`**, and returns the breakdown; **exhaustively `switch`es over every variant of `createPendingWithReservedStock` — `created`/`out_of_stock`/`product_not_found`/`duplicate` — so no result is silently unhandled (the `duplicate` variant is resolved fully in T052; here it replays the existing transaction)**, and the computed amounts are exactly what the repository stores (FR-002, FR-003, FR-004).
- [ ] T016 [US1] Add `CreateTransaction` validation `back-end/src/application/use-cases/create-transaction.use-case.ts` (+ spec): reject `quantity <= 0` (400) and unknown product → `PRODUCT_NOT_FOUND` (404); **add an amount-tampering test proving client-supplied amounts are never read (the use case returns the server-computed breakdown only)** (FR-002).
- [ ] T017 [US1] Add `CreateTransaction` out-of-stock handling `back-end/src/application/use-cases/create-transaction.use-case.ts` (+ spec): map the repository `out_of_stock` result to `INSUFFICIENT_STOCK` (409) (FR-004).
- [ ] T018 [US1] Implement `GetCheckoutConfig` `back-end/src/application/use-cases/get-checkout-config.use-case.ts` (+ spec): read `getMerchantInfo()` and return only public values `{ publicKey, baseUrl, currency, contracts: { terms, personalData }, installments: { default, max } }`; provider failure → `PAYMENT_PROVIDER_UNAVAILABLE` (503) (FR-001).
- [ ] T019 [US1] Implement `PayTransaction` happy path `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): validate input and contract acceptance, read merchant info before claiming, load the purchase via `findById` (the **`TransactionDetails`** aggregate), claim `payment_started_at` (lease) using the injected **`Clock`**, reconcile by `reference` before creating, then create the provider transaction once and return `PENDING` (or the final state) (FR-005).
- [ ] T020 [US1] Add `PayTransaction` contracts guard `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): `acceptedContracts !== true` → `CONTRACTS_NOT_ACCEPTED` (422), validated in the use case, not the DTO (FR-005).
- [ ] T021 [US1] Add `PayTransaction` definitive token rejection `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): a provider 4xx about the token clears the claim and returns `INVALID_PAYMENT_TOKEN` (422) (FR-005).
- [ ] T022 [US1] Add `PayTransaction` timeout/5xx handling `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): keep the claim and return `PAYMENT_PROVIDER_UNAVAILABLE` (503) (FR-012).
- [ ] T023 [US1] Add `PayTransaction` other provider 4xx handling `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): return `PAYMENT_PROVIDER_REJECTED` (502) with a generic message (FR-012).
- [ ] T024 [US1] Add `PayTransaction` lease reclaim `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): when `payment_started_at` is older than `PAYMENT_CLAIM_LEASE_SECONDS` the claim can be taken over, and every claimer reconciles by `reference` before creating so no duplicate provider transaction is created (FR-005).
- [ ] T025 [US1] Implement `GetTransaction` happy path `back-end/src/application/use-cases/get-transaction.use-case.ts` (+ spec): load the purchase via `findById` (the **`TransactionDetails`** aggregate — transaction, customer, delivery, product id and name) and build the view from it; while `PENDING`, consult the gateway and finalize once via the CAS; `APPROVED` assigns the delivery (`ASSIGNED`) and keeps stock decremented; return the transaction view (FR-007, FR-008).
- [ ] T026 [US1] Add `GetTransaction` unknown-status rule `back-end/src/application/use-cases/get-transaction.use-case.ts` (+ spec): a provider status that is not `APPROVED|DECLINED|VOIDED|ERROR` is treated as `PENDING` (warn without secrets) and never finalizes (FR-008).
- [ ] T027 [US1] Add `GetTransaction` not-found handling `back-end/src/application/use-cases/get-transaction.use-case.ts` (+ spec): unknown id → `TRANSACTION_NOT_FOUND` (404) (FR-007).

**Checkpoint**: The P1 use cases pass against in-memory fakes; the slice is logically complete but not yet wired to HTTP/Prisma.

---

## Phase 4: Infrastructure (Prisma repository and HTTP gateway adapter)

**Purpose**: Implement the two driven adapters behind the ports, unit-tested with a mocked `fetch` (no real network; the T001 guard stays active and is overridden per test).

- [ ] T028 Implement `PrismaTransactionRepository.createPendingWithReservedStock` `back-end/src/infrastructure/persistence/prisma-transaction.repository.ts` (+ spec): one Prisma `$transaction` doing `UPDATE products SET stock = stock - q WHERE id = :id AND stock >= :q`, then insert customer + transaction + delivery; return `created|out_of_stock|product_not_found`; map unique-key `P2002` to `duplicate` (FR-004).
- [ ] T029 Implement `PrismaTransactionRepository.claimPayment` `back-end/src/infrastructure/persistence/prisma-transaction.repository.ts` (+ spec): CAS on `payment_started_at` where it is `NULL` or older than `now - leaseSeconds`; returns boolean (FR-005).
- [ ] T030 Implement `PrismaTransactionRepository.finalize` `back-end/src/infrastructure/persistence/prisma-transaction.repository.ts` (+ spec): one `$transaction` with a CAS on `status = 'PENDING'`; on `APPROVED` set the delivery `ASSIGNED`; on `DECLINED|VOIDED|ERROR` release stock; persist only `card_brand`, `card_last_four`, `installments` (never the card number or CVC); exactly-once side effects (FR-006, FR-008).
- [ ] T031 Implement `PrismaTransactionRepository.findById`, `findByIdempotencyKey` and `attachProviderTransaction` `back-end/src/infrastructure/persistence/prisma-transaction.repository.ts` (+ spec) (FR-003).
- [ ] T032 Implement `PrismaTransactionRepository.releaseExpiredReservations(now)` `back-end/src/infrastructure/persistence/prisma-transaction.repository.ts` (+ spec): CAS `PENDING` with `payment_started_at IS NULL` and `created_at < now() - RESERVATION_TTL_SECONDS` → `VOIDED` with `failureReason = 'RESERVATION_EXPIRED'`, then release stock; idempotent (FR-014).
- [ ] T033 Implement `HttpPaymentGatewayAdapter.getMerchantInfo` `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): `GET {UAT_SANDBOX_URL}/merchants/{pub}` with no auth header; map `presigned_acceptance`, `presigned_personal_data_auth` and `installments_config`; mocked `fetch` (FR-001).
- [ ] T034 Implement the integrity signature builder `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): `SHA256hex(reference + amount_in_cents + currency + integritySecret)` via `node:crypto` (FR-005).
- [ ] T035 Implement `HttpPaymentGatewayAdapter.createCardTransaction` `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): `POST {base}/transactions` with `Authorization: Bearer {prv}` and the `payment_method` body, bounded by `AbortController` + `PAYMENT_TIMEOUT_MS`; map `data.id`/`data.status`; mocked `fetch` (FR-005).
- [ ] T036 Implement `HttpPaymentGatewayAdapter.getTransaction` and `findByReference` `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): `GET /transactions/{id}` and `GET /transactions?reference=...` with the private key; return the first match or `null`; mocked `fetch` (FR-007).
- [ ] T037 Add the provider status mapping `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): `APPROVED|DECLINED|VOIDED|ERROR` map directly; `PENDING` and any unknown value map to `PENDING` (warn without secrets) and never finalize (FR-008).
- [ ] T038 Add the adapter error mapping `back-end/src/infrastructure/payments/http-payment-gateway.adapter.ts` (+ spec): 4xx about the token → `InvalidPaymentTokenError`; other 4xx → `PaymentProviderRejectedError`; timeout/network/5xx → `PaymentProviderUnavailableError`; **add a Logger spy proving the adapter never logs request bodies, tokens or secrets** (FR-012).

**Checkpoint**: Both adapters satisfy their ports; the application can run against Prisma and the provider sandbox.

---

## Phase 5: User Story 1 - HTTP layer (DTOs, controllers, wiring, Swagger)

**Goal**: Expose the P1 endpoints with validated input, safe errors and Swagger docs. **Each task writes its tests first inside the same task so it ends green.**

- [ ] T039 [US1] Create the DTOs and response mapper `back-end/src/infrastructure/http/create-transaction.dto.ts`, `back-end/src/infrastructure/http/pay-transaction.dto.ts`, `back-end/src/infrastructure/http/transaction-response.dto.ts`, `back-end/src/infrastructure/http/checkout-config-response.dto.ts` (+ `transaction-response.mapper.ts`): write the DTO/mapper specs first; validate with `class-validator` (no `acceptedContracts` logic in the DTO); **the pay DTO rejects extra fields such as `number` or `cvc` with 400 and never echoes them**; **the create DTO rejects client-sent amounts with 400**; response shape per `contracts/rest-api.md`, no card number/CVC or secrets (FR-002, FR-005, FR-006).
- [ ] T040 [US1] Implement `TransactionsController` `back-end/src/infrastructure/http/transactions.controller.ts` (+ `transactions.controller.spec.ts` written first): `POST /transactions` (requires `Idempotency-Key`), `POST /transactions/:id/payment`, `GET /transactions/:id`; use `unwrapResult` and the shared error shape (FR-002, FR-003, FR-009, FR-012).
- [ ] T041 [US1] Implement `PaymentsController` `back-end/src/infrastructure/http/payments.controller.ts` (+ `payments.controller.spec.ts` written first): `GET /payments/checkout-config` (FR-001).
- [ ] T042 [US1] Wire the modules `back-end/src/infrastructure/modules/transactions.module.ts` and `back-end/src/infrastructure/modules/payments.module.ts` (Symbol tokens + `useFactory`, mirroring `products.module.ts`), bind `PrismaTransactionRepository` and `HttpPaymentGatewayAdapter` to the ports, supply `FeesConfig`, `Clock`, `ReferenceGenerator`, publicKey/baseUrl/currency/lease/TTL from config, and register both modules in `back-end/src/app.module.ts` (FR-002, FR-005).
- [ ] T043 [US1] Extend `back-end/src/infrastructure/http/error.mapper.ts` (+ spec) with: 400 `INVALID_EVENT_CHECKSUM`, 404 `PRODUCT_NOT_FOUND`, 404 `TRANSACTION_NOT_FOUND`, 409 `INSUFFICIENT_STOCK`, 409 `IDEMPOTENCY_KEY_REUSED`, 409 `TRANSACTION_NOT_PAYABLE`, 422 `CONTRACTS_NOT_ACCEPTED`, 422 `INVALID_PAYMENT_TOKEN`, 502 `PAYMENT_PROVIDER_REJECTED`, 503 `PAYMENT_PROVIDER_UNAVAILABLE`; keep the 5-key body and 5xx masking; **add a Logger spy across every failure path proving no card number, CVC, card token or secret appears in any error response or log** (FR-012).
- [ ] T044 [US1] Extend `back-end/src/infrastructure/http/configure-swagger.ts` (+ spec) with tags `transactions` and `payments` and `@Api*Response` for every error case (FR-007).

**Checkpoint**: The P1 API is reachable and documented; `/docs` and `/docs-json` still work.

---

## Phase 6: User Story 1 - End-to-end tests (fake gateway)

- [ ] T045 [US1] Write `back-end/test/checkout-config.e2e-spec.ts`: `GET /payments/checkout-config` with the `PaymentGateway` provider overridden by `FakePaymentGateway` and `global.fetch` guarded (FR-001).
- [ ] T046 [US1] Write `back-end/test/transaction-create.e2e-spec.ts`: `POST /transactions` success (201), missing/invalid `Idempotency-Key` (400), unknown product (404) and **client-sent amounts rejected (400)** (FR-002, FR-003).
- [ ] T047 [US1] Write `back-end/test/transaction-payment.e2e-spec.ts`: `POST /transactions/:id/payment` approved path (202 then 200) and `acceptedContracts:false` (422); **assert no response body contains a card number, CVC, card token or secret** (FR-005, FR-012).
- [ ] T048 [US1] Write `back-end/test/transaction-status.e2e-spec.ts`: `GET /transactions/:id` pending → approved with an assigned delivery; unknown id → 404 (FR-007).

**Checkpoint**: US1 is independently testable end-to-end through HTTP with no network.

---

## Phase 7: User Story 2 - A declined or failed payment releases the reserved stock (Priority: P2)

**Goal**: Declined/voided/error outcomes release stock; abandoned reservations expire.

**Independent Test**: With fakes and e2e, declined/error cards end with no delivery and the original stock restored; an unpaid expired purchase is released.

- [ ] T049 [US2] Extend `GetTransaction` `back-end/src/application/use-cases/get-transaction.use-case.ts` (+ spec) so `DECLINED`, `VOIDED` and `ERROR` finalize through the repository (release stock, no delivery) (FR-008).
- [ ] T050 [US2] Add lazy reservation expiry to `back-end/src/application/use-cases/create-transaction.use-case.ts` and `back-end/src/application/use-cases/get-transaction.use-case.ts` (+ their specs): call `releaseExpiredReservations(now)` (injected `Clock`) before reserving and on read; an expired purchase is reported as `VOIDED` with `failureReason = 'RESERVATION_EXPIRED'` and its stock returns (FR-014).
- [ ] T051 [US2] Write `back-end/test/payment-declined.e2e-spec.ts`: declined and error cards restore stock and assign no delivery; a payment that never started past `RESERVATION_TTL_SECONDS` is released on `GET /transactions/:id` (FR-008, FR-014).

---

## Phase 8: User Story 3 - Safe retries and no overselling (Priority: P3)

**Goal**: Exactly one purchase and one charge under retries and concurrency; no overselling.

**Independent Test**: Same key → exactly one purchase; reused key with different data → 409; pay a non-pending purchase → 409; two buyers race the last unit → exactly one success and stock never negative.

- [ ] T052 [US3] Add idempotent replay to `CreateTransaction` `back-end/src/application/use-cases/create-transaction.use-case.ts` (+ spec): the same key returns the existing purchase (same `id`/`reference`, 200), including the repository `duplicate`/`P2002` path (FR-003).
- [ ] T053 [US3] Add key-reuse detection to `back-end/src/application/use-cases/create-transaction.use-case.ts` (+ spec): the same key with a different product, quantity or customer email → `IDEMPOTENCY_KEY_REUSED` (409) (FR-003).
- [ ] T054 [US3] Add the not-payable guard `back-end/src/application/use-cases/pay-transaction.use-case.ts` (+ spec): a purchase that is not `PENDING` → `TRANSACTION_NOT_PAYABLE` (409), so it is never charged twice (FR-009).
- [ ] T055 [US3] Keep a fake-based unit test of the use case concurrency logic `back-end/src/application/use-cases/create-transaction.use-case.spec.ts`: with the in-memory repository, two interleaved creates for the last unit yield exactly one success and one `INSUFFICIENT_STOCK` (FR-004).
- [ ] T056 [US3] Add the **PostgreSQL integration suite** and specs: `back-end/test/jest-int.json`, the `test:int` script in `back-end/package.json`, and `back-end/test/integration/prisma-transaction.repository.int-spec.ts` covering two concurrent purchases of the last unit, concurrent finalization exactly once, the payment claim lease under contention, and the new CHECK constraints (`card_last_four`, `installments`, `stock >= 0`). The suite reads **`TEST_DATABASE_URL`** — a new variable, empty in `.env.example` (T004) — and **refuses to run when the database name does not end with `_test`**; it **never uses `DATABASE_URL`**. The setup is documented in `quickstart.md`: `createdb`, then run the migrations against that URL (`prisma migrate deploy` / `prisma:migrate:deploy` with `TEST_DATABASE_URL` set). It is **excluded from `test:cov`** (FR-004, FR-005, FR-006, FR-014).
- [ ] T057 [US3] Write `back-end/test/idempotency-overselling.e2e-spec.ts`: same key replays one purchase; reused key with different data → 409; non-pending pay → 409 (FR-003, FR-009).

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T058 [P] Update `back-end/README.md` with the new endpoints, environment variables (names only), provider flow and how to run the spike/sandbox.
- [ ] T059 [P] Update the root `README.md` checkout flow documentation (prices are already in cents).
- [ ] T060 Run the `quickstart.md` validation and the full gate: `npm run lint`, `npx tsc -p tsconfig.json --noEmit`, `npm run build`, `npm run test:cov`, `npm run test:e2e`, **`npm run test:int` (integration suite)** and the **sandbox spike** (`./scripts/sandbox-spike.sh`); confirm coverage ≥ 80 %, no secrets and no provider company name anywhere.

---

## Phase 10 (Optional): User Story 4 - Payment events reconcile the status idempotently (Priority: P4)

**Goal**: Optionally ingest provider events, verify the checksum, reconcile idempotently and ignore duplicates.

**Independent Test**: A valid event changes state once, a duplicate is ignored, and a tampered event is rejected.

- [ ] T061 [US4] Implement `POST /webhooks/payment-events` in `back-end/src/infrastructure/http/payment-events.controller.ts` (+ the use case `back-end/src/application/use-cases/payment-events.use-case.ts` + specs): verify the checksum with the events secret, reconcile through the same finalization CAS, ignore duplicates; 200 accepted, 400 `INVALID_EVENT_CHECKSUM` invalid checksum (FR-013).
- [ ] T062 [US4] Write `back-end/test/payment-events.e2e-spec.ts`: valid event reconciles once, duplicate is a no-op, tampered checksum is rejected (FR-013).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 must precede T003/T004 (hermetic env + config ignores `.env` in test). T002 independent.
- **Foundational (Phase 2)**: depends on Phase 1. Blocks the use cases.
- **US1 use cases (Phase 3)**: depends on Phase 2.
- **Infrastructure (Phase 4)**: depends on Phase 2 (ports); ordered after the use cases per the requested build order.
- **US1 HTTP (Phase 5)** and **US1 E2E (Phase 6)**: depend on Phases 3 and 4.
- **US2 (Phase 7)** and **US3 (Phase 8)**: depend on Phase 3 and reuse Phases 4–6. T056 depends on T028–T032 and T001.
- **Polish (Phase 9)**: depends on all desired stories. T060 depends on T056.
- **US4 (Phase 10)**: optional, last.

### Within each phase

- Tests first where marked (the HTTP tasks T039–T041 include their tests inside the task); all gates green at the end of the task.
- Errors → entities/seams → ports → fakes → use cases → adapters → HTTP → e2e → integration.

### Story-to-phase coverage

- **US1 (P1)**: T015–T027 (use cases) + T039–T048 (HTTP + e2e).
- **US2 (P2)**: T049–T051.
- **US3 (P3)**: T052–T057.
- **US4 (P4, optional)**: T061–T062.
- Shared, no label: T001–T014 (setup + domain/seams), T028–T038 (adapters), T058–T060 (docs/gate).

---

## Parallel Execution Examples

### Setup / Foundational

```bash
Task: "T001 test/setup-env.ts + config.module.ts + jest configs"
Task: "T002 prisma schema + migration"
Task: "T005 domain business errors (+ specs)"
Task: "T007 transaction.entity.ts (+ spec)"
Task: "T010 fees-config.ts + clock.port.ts + reference-generator.port.ts (+ specs)"
Task: "T013 in-memory-transaction.repository.ts (+ spec)"
```

### US1 use cases (after fakes exist)

```bash
Task: "T015 CreateTransaction happy path (+ spec)"
Task: "T018 GetCheckoutConfig (+ spec)"
Task: "T019 PayTransaction happy path (+ spec)"
Task: "T025 GetTransaction happy path (+ spec)"
```

### Infrastructure adapters

```bash
Task: "T028..T032 PrismaTransactionRepository (+ specs)"
Task: "T033..T038 HttpPaymentGatewayAdapter (+ specs, mocked fetch)"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 use cases → 4. Phase 4 adapters → 5. Phase 5 HTTP → 6. Phase 6 e2e → **STOP and validate US1 end-to-end**.

### Incremental delivery

Add US2 (T049–T051), then US3 (T052–T057), re-running the full gate after each; then Polish; then the optional US4.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- The global `fetch` guard from T001 stays active in every suite; adapter tests must override `global.fetch` with `jest.spyOn`/`mockResolvedValue` and never hit the network. In test, the config module ignores `.env` and uses the placeholders.
- The integration suite (T056) needs a real PostgreSQL database whose name ends with `_test`; it is excluded from `test:cov`.
- Tests are written first where the task says so (the HTTP tasks include their tests inside the task); keep the tree green at the end of every task.
- Never commit secrets and never write the provider company name anywhere.
- Commit after each task or small logical group.
