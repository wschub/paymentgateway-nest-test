# Implementation Plan: Transactions and Card Payment Processing

**Branch**: `002-transacciones-pagos` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-transacciones-pagos/spec.md`

## Summary

Add the back-end transaction and card-payment capability to the existing hexagonal NestJS service,
following the constitution and docs/requirements.md. The change introduces a `PaymentGateway` port and a
`TransactionRepository` port, a provider HTTP adapter built on the platform `fetch` with a hard timeout (no
new dependency), and four use cases with a typed `Result` (CreateTransaction, PayTransaction, GetTransaction,
GetCheckoutConfig). Stock is reserved with a conditional atomic update, payment initiation is an atomic,
re-claimable lease that reconciles by reference before creating, abandoned reservations expire lazily, and
finalization is a compare-and-set that performs its side effects (assign delivery, release stock) exactly
once. A new Prisma migration adds the non-sensitive card fields to `Transaction`. Provider variables, fee
values and the reservation/lease timers are validated at startup. Swagger and the Jest suites (in-memory
fakes, mocked `fetch`, and a fake gateway in e2e) are updated; no automated test talks to the real sandbox.

## Technical Context

**Language/Version**: TypeScript 6.x, Node.js 24 (global `fetch`, `node:crypto`)

**Primary Dependencies**: NestJS 12, Prisma 6.14 (`@prisma/adapter-pg`), class-validator/class-transformer,
`@nestjs/swagger` 12, `@nestjs/throttler`, `helmet`, Jest 30 + ts-jest. No new dependency.

**Storage**: PostgreSQL 14 or newer via Prisma. New migration extends `transactions`.

**Testing**: Jest (unit `*.spec.ts`, e2e `*.e2e-spec.ts` + supertest). Use cases tested with in-memory fakes
of every port; the adapter with a mocked `fetch`; e2e with the fake gateway. Coverage threshold ≥ 80 %.

**Target Platform**: Linux server (Node.js); local macOS development.

**Project Type**: Web service (NestJS back-end inside a monorepo).

**Performance Goals**: Non-provider endpoints stay well under 200 ms locally; provider calls are bounded by a
configurable timeout (default 10 s) and never block a request open.

**Constraints**: No new dependencies; secrets only in env vars; no provider company name anywhere; strict
hexagonal boundaries (use cases never import `PrismaClient`, the SDK or `fetch`); money as integer COP cents;
atomic conditional stock changes.

**Scale/Scope**: One product with a quantity per purchase; five endpoints (four functional + one optional
webhook); four use cases; one migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Source of truth | Feature derives from docs/requirements.md (FR-1..FR-8, §6, D1/D4/D6/D7). | PASS |
| II. Hexagonal (non-negotiable) | `PaymentGateway` and `TransactionRepository` ports in `domain/ports`; HTTP adapter in `infrastructure/payments`; Prisma adapters in `infrastructure/persistence`; controllers hold no logic; use cases import only ports and the `Result` type. | PASS |
| III. Testing & coverage | Use cases tested with in-memory fakes; adapter with mocked `fetch`; e2e with the fake gateway; no test hits the sandbox; coverage ≥ 80 %. | PASS |
| IV. Railway Oriented Programming | Every use case returns `Result<T, E>`; business failures (out of stock, not payable, contracts not accepted) are values, not throws. | PASS |
| V. Security by design | Card number/CVC never reach the service; private/integrity/events secrets stay in env and only in infrastructure; no secret in logs or responses. | PASS |
| VI. Atomicity & data integrity | Conditional `UPDATE ... WHERE stock >= q` inside a Prisma transaction; CHECK constraints already present; CAS finalization with exactly-once side effects. | PASS |
| VII. Simplicity & YAGNI | Built-in `fetch` + `AbortController`; generic `PaymentGateway` naming; no new dependency. | PASS |

No violations; Complexity Tracking is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-transacciones-pagos/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rest-api.md          # Our HTTP contract
│   └── payment-provider.md  # External provider contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (already present)
├── spec.md              # Feature spec (already present)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
back-end/
├── prisma/
│   ├── schema.prisma                        # extend Transaction
│   └── migrations/<new>_payment_fields/     # new migration
├── scripts/
│   └── sandbox-spike.sh                     # already added (manual only)
└── src/
    ├── domain/
    │   ├── entities/
    │   │   ├── transaction.entity.ts        # new
    │   │   ├── customer.entity.ts           # new
    │   │   └── delivery.entity.ts           # new
    │   ├── errors/
    │   │   ├── insufficient-stock.error.ts           # new
    │   │   ├── transaction-not-found.error.ts        # new
    │   │   ├── transaction-not-payable.error.ts      # new
    │   │   ├── contracts-not-accepted.error.ts       # new
    │   │   ├── idempotency-key-reused.error.ts       # new
    │   │   ├── invalid-payment-token.error.ts        # new
    │   │   ├── payment-provider-unavailable.error.ts # new
    │   │   └── payment-provider-rejected.error.ts    # new
    │   └── ports/
    │       ├── payment-gateway.port.ts      # new
    │       └── transaction.repository.ts    # new (checkout persistence port)
    ├── application/
    │   └── use-cases/
    │       ├── create-transaction.use-case.ts   # new
    │       ├── pay-transaction.use-case.ts       # new
    │       ├── get-transaction.use-case.ts       # new
    │       └── get-checkout-config.use-case.ts   # new
    └── infrastructure/
        ├── config/
        │   └── env.validation.ts            # extend (provider vars + fees + TTL/lease)
        ├── http/
        │   ├── transactions.controller.ts   # new
        │   ├── payments.controller.ts        # new
        │   ├── create-transaction.dto.ts     # new
        │   ├── pay-transaction.dto.ts         # new
        │   ├── transaction-response.dto.ts    # new
        │   ├── transaction-response.mapper.ts # new
        │   ├── checkout-config-response.dto.ts # new
        │   ├── configure-swagger.ts           # extend tags
        │   └── error.mapper.ts                # extend mappings
        ├── modules/
        │   ├── transactions.module.ts         # new
        │   └── payments.module.ts             # new
        ├── payments/
        │   └── http-payment-gateway.adapter.ts # new
        └── persistence/
            └── prisma-transaction.repository.ts # new
    └── testing/
        ├── in-memory-transaction.repository.ts  # new
        └── fake-payment-gateway.ts              # new

back-end/test/
├── checkout-config.e2e-spec.ts
├── transaction-create.e2e-spec.ts
├── transaction-payment.e2e-spec.ts
├── transaction-status.e2e-spec.ts
└── setup-env.ts                               # new (hermetic test env)
```

**Structure Decision**: Keep the existing hexagonal layout for the back-end app. New domain/application/
infrastructure folders mirror the 001 conventions (Product entity → Transaction/Customer/Delivery; the
ProductsModule wiring → TransactionsModule/PaymentsModule; `in-memory-*.repository` and the fake gateway live
in `src/testing` and are excluded from coverage).

## Complexity Tracking

> No constitution violations; this section is intentionally empty.
