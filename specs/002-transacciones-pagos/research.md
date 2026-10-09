# Phase 0 Research: Transactions and Card Payment Processing

**Feature**: `002-transacciones-pagos` | **Date**: 2026-10-09

All decisions below were verified against the sandbox spike (`back-end/scripts/sandbox-spike.sh`) and
docs/requirements.md. No open NEEDS CLARIFICATION remains.

## R1. Provider HTTP contract (verified against the sandbox)

- **Decision**: The adapter uses `UAT_SANDBOX_URL` as the base URL and calls:
  - `GET /merchants/{publicKey}` (no auth header; the public key is in the path) → returns
    `data.presigned_acceptance.acceptance_token`, `data.presigned_acceptance.permalink`,
    `data.presigned_personal_data_auth.acceptance_token`, `data.presigned_personal_data_auth.permalink` and
    `data.installments_config`.
  - `POST /transactions` with `Authorization: Bearer <privateKey>` → body `{ acceptance_token,
    accept_personal_auth, amount_in_cents, currency, signature, customer_email, reference, payment_method:
    { type: "CARD", token, installments } }`; response `data.id`, `data.status`.
  - `GET /transactions/{providerId}` with `Authorization: Bearer <privateKey>` → `data.status`,
    `data.status_message`, `data.payment_method.extra.brand`, `data.payment_method.extra.last_four`,
    `data.payment_method.installments`.
  - `GET /transactions?reference={reference}` with `Authorization: Bearer <privateKey>` → `{ data: [...],
    meta }` (verified: 200 with the private key, 401 without). Used to reconcile a timed-out creation.
- **Rationale**: These are the exact endpoints/fields exercised by the spike for both approved and declined
  cards. Reads require the private key (401 without it), so the adapter always authorizes the status and
  reference queries.
- **Alternatives considered**: hosted widget/checkout (rejected by requirements D5); provider SDK (rejected:
  new dependency, not needed).

## R2. Integrity signature

- **Decision**: `signature = SHA256hex(reference + amount_in_cents + currency + integritySecret)`, computed in
  the adapter with `node:crypto` using the injected `stagtest_integrity` secret.
- **Rationale**: Verified in the spike (line 52); keeps the secret inside infrastructure only and never in the
  application/domain layers.
- **Alternatives considered**: computing the signature in a use case (would leak a secret into the application
  layer); a dependency (rejected).

## R3. Timeout and reconciliation on provider creation

- **Decision**: `fetch` is wrapped with `AbortController` and a configurable timeout
  (`PAYMENT_TIMEOUT_MS`, default 10 000). If the creation call times out, the adapter does not retry blindly:
  the use case calls `findByReference(reference)` (R1) and adopts the provider transaction if it exists.
- **Rationale**: Requirement "on a timeout while creating the provider transaction, reconcile by reference
  before any retry"; the provider enforces a unique `reference`, so reconciliation is safe and avoids
  double charges.
- **Alternatives considered**: immediate retry (would risk a duplicate charge); returning 5xx and asking the
  client to retry (still dangerous without reconciliation).

## R4. CreateTransaction idempotency

- **Decision**: `POST /transactions` requires an `Idempotency-Key` header whose value is **16 to 64 characters
  of letters, digits, dash or underscore**. The key is persisted in the unique `idempotency_key` column. The
  repository first looks up the key; if found, it returns the existing purchase (HTTP 200 replay). Reusing a key
  with a **different product, quantity or customer email** is rejected with 409 `IDEMPOTENCY_KEY_REUSED`. A
  concurrent duplicate that trips the unique constraint (`P2002`) is caught inside the repository and resolves
  to the same replay result. A missing/blank header or a malformed key (length/charset) is a 400.
- **Rationale**: Honors `Idempotency-Key` (constitution + FR-003) and uses the existing unique index as the
  concurrency guard instead of application locks; the fingerprint check prevents a client from silently
  reusing a key for a different purchase.
- **Alternatives considered**: an in-process map (does not survive restarts or multiple instances); an advisory
  lock (more complexity for no benefit here); no fingerprint check (a reused key would return the wrong
  purchase silently).

## R5. Atomic stock reservation

- **Decision**: Reservation is a conditional decrement
  `UPDATE products SET stock = stock - q WHERE id = :id AND stock >= :q` executed with `updateMany` inside the
  same `$transaction` that creates the customer, transaction and delivery. Zero affected rows means either the
  product does not exist (→ 404) or there is not enough stock (→ 409); the adapter distinguishes them with a
  follow-up existence check.
- **Rationale**: Matches principle VI and the `products_stock_non_negative` CHECK; prevents overselling under
  concurrency.
- **Alternatives considered**: read-then-write (racy); `SELECT ... FOR UPDATE` raw SQL (unnecessary, and raw
  access leaks into the port).

## R6. Exactly-once payment initiation (lease) and retry

- **Decision**: `PayTransaction` validates the input and the contract acceptance **first** (422
  `CONTRACTS_NOT_ACCEPTED`), reads the merchant info (fresh acceptance tokens), and only then claims a lease on
  the nullable `payment_started_at` column:
  `UPDATE transactions SET payment_started_at = now() WHERE id = :id AND status = 'PENDING' AND
  (payment_started_at IS NULL OR payment_started_at < now() - :lease)`. The lease length is
  `PAYMENT_CLAIM_LEASE_SECONDS` (default 120, R9), so a claim that got stuck (crash mid-request) can be taken
  over later instead of blocking the purchase forever. **Every claimer** — the one that just won the lease and
  any that re-enters after a stalled lease — first reconciles by reference (`findByReference`, R3) before
  creating: if the provider already has the transaction it is adopted; otherwise the winner creates it.
- **Provider rejection (definitive)**: if the creation is definitively rejected with a 4xx (invalid/used
  token), the claim is cleared (`payment_started_at = null`) so the shopper can retry with a new token, and the
  caller answers 422 `INVALID_PAYMENT_TOKEN`.
- **Timeout / 5xx**: the claim is **kept** and the caller answers 503; the next reader/payer reconciles by
  reference instead of creating a duplicate.
- **Rationale**: Guarantees "creates the provider transaction once, never twice for the same transaction",
  survives a crash mid-claim (lease) and a lost response (reconcile by reference), without holding a DB
  transaction open across the external call.
- **Alternatives considered**: a claim with no lease (a crash would block payment forever); relying only on the
  provider's unique reference (still issues duplicate requests); a DB transaction/lock held during the HTTP
  call (bad; D6 keeps requests short).

## R7. Exactly-once finalization and side effects

- **Decision**: Finalization is a compare-and-set:
  `UPDATE transactions SET status = :final, provider_transaction_id = ..., card_brand = ..., card_last_four
  = ..., installments = ..., failure_reason = ... WHERE id = :id AND status = 'PENDING'`. Only when exactly
  one row is updated are the side effects applied in the same `$transaction`: APPROVED → delivery becomes
  `ASSIGNED` (+`assigned_at`); DECLINED/VOIDED/ERROR → stock is released
  (`UPDATE products SET stock = stock + q`). A zero-row CAS means another process already finalized, so no
  side effect runs again.
- **Rationale**: Prevents double stock release / double delivery, satisfies FR-008 and the edge cases.
- **Alternatives considered**: read-status-then-update (racy); separate flags per action (more state).

## R8. Status polling in GET /transactions/:id

- **Decision**: While the transaction is `PENDING`, the use case resolves the provider status through the
  gateway (`getTransaction(providerId)`, or reconciliation by reference when the id is missing) and calls the
  finalization CAS (R7) **only for known final statuses** (`APPROVED`, `DECLINED`, `VOIDED`, `ERROR`).
  **Unknown provider statuses are treated as `PENDING`** (a warning is logged without secrets) and never
  finalize the purchase. The endpoint is the source of truth for the front-end (D6) and always returns the
  current status, amounts, card brand/last four and product/delivery summary.
- **Rationale**: The provider never answers synchronously; the front-end only polls our API (D6).
- **Alternatives considered**: background jobs / queues (out of scope, more infrastructure).

## R9. Environment validation

- **Decision**: `validateEnv` gains required strings `pub_stagtest`, `prv_stagtest`, `stagtest_events`,
  `stagtest_integrity`, and `UAT_SANDBOX_URL` (validated as an http/https URL); and integer options with
  defaults: `BASE_FEE_IN_CENTS` = 300000 and `DELIVERY_FEE_IN_CENTS` = 900000 (positive integers), plus
  `PAYMENT_TIMEOUT_MS` = 10000 (optional). It also gains two validated positive-integer options with defaults:
  `RESERVATION_TTL_SECONDS` = 900 (R13) and `PAYMENT_CLAIM_LEASE_SECONDS` = 120 (R6). Any missing/invalid value
  fails startup.
- **Rationale**: Matches the feature input; keeps secrets and tuning out of code.
- **Alternatives considered**: reading `process.env` directly in the adapter (bypasses validation).

## R10. Hermetic tests with the new required env

- **Decision**: Add `back-end/test/setup-env.ts` that sets non-secret placeholder values for every required
  variable and register it via `setupFiles` in both `jest.config.ts` and `test/jest-e2e.json`. The same file
  **replaces `global.fetch` with a function that throws `network calls are forbidden in tests`**, so no test can
  reach the network by accident. Every e2e test **overrides the `PaymentGateway` provider with the fake
  gateway**. `validateEnv` unit tests keep exercising the real validation with explicit objects. No test uses
  real secrets or the sandbox.
- **Rationale**: Keeps unit/e2e green on a fresh clone (where `.env` may hold empty values from
  `.env.example`) without weakening startup validation.
- **Alternatives considered**: overriding `ConfigService` in every spec (duplication); requiring a populated
  `.env` to run tests (fragile, leaks local state into tests).

## R11. Where secrets and signature live

- **Decision**: The `PaymentGateway` port exposes business-level operations only
  (`getMerchantInfo`, `createCardTransaction`, `getTransaction`, `findByReference`); the HTTP adapter owns the
  public key, private key, integrity secret, base URL and timeout, and computes the signature.
- **Rationale**: Secrets never leave infrastructure; the port stays framework- and provider-agnostic.
- **Alternatives considered**: passing secrets into use cases (leaks secrets upward).

## R12. HTTP semantics and error mapping

- **Decision**:
  - `POST /transactions` → 201 (created), 200 (idempotent replay), 400 (missing/invalid body, missing or
    malformed `Idempotency-Key`), 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK` or
    `IDEMPOTENCY_KEY_REUSED`.
  - `POST /transactions/:id/payment` → 202 while `PENDING` (whether already in progress or started now, with the
    current view and no second charge), 200 only when the provider answered with an already final status at
    creation time, 400 bad body,
    404 `TRANSACTION_NOT_FOUND`, 409 `TRANSACTION_NOT_PAYABLE` (the purchase is not `PENDING`), 422
    `CONTRACTS_NOT_ACCEPTED` (validated in the use case, **not** by the DTO) or `INVALID_PAYMENT_TOKEN` (the provider
    definitively rejected the creation with a 4xx about the token, R6), 502 `PAYMENT_PROVIDER_REJECTED` (any other
    provider 4xx, with a generic message), 503 `PAYMENT_PROVIDER_UNAVAILABLE` (timeout, network error or provider
    5xx).
  - `GET /transactions/:id` → 200, 404.
  - `GET /payments/checkout-config` → 200, 503 if the provider is unavailable.
  - `POST /webhooks/payment-events` (optional) → 200, 400 invalid checksum.
  A provider 4xx that is **not** about the token maps to 502 `PAYMENT_PROVIDER_REJECTED` with a generic message;
  timeouts, network errors and provider 5xx map to 503. Every error keeps the existing 5-key body
  (`statusCode`, `code`, `message`, `path`, `timestamp`), with map entries added to `error.mapper.ts` and the
  existing 5xx masking.
- **Rationale**: Aligns with the constitution's API design section and the status codes listed in
  requirements §5.
- **Alternatives considered**: always 200 on payment (loses the 202 signal the requirements anticipate).

## R13. Lazy reservation expiry

- **Decision**: A `PENDING` purchase whose payment was **never started** (`payment_started_at IS NULL`) and
  whose `created_at` is older than `RESERVATION_TTL_SECONDS` (default 900, R9) is released lazily: a CAS
  `UPDATE transactions SET status = 'VOIDED', failure_reason = 'RESERVATION_EXPIRED' WHERE id = :id AND status
  = 'PENDING' AND payment_started_at IS NULL AND created_at < now() - :ttl`; when exactly one row changes, the
  reserved stock is returned (`UPDATE products SET stock = stock + q`) in the same `$transaction`. It runs
  **before reserving stock** in `CreateTransaction` and when `GET /transactions/:id` reads an expired purchase.
- **Rationale**: Frees stock abandoned by a shopper who never paid, without a background scheduler (out of
  scope); the CAS plus the guarded stock bump make it idempotent and safe with concurrent readers.
- **Alternatives considered**: a cron/queue sweeper (new infrastructure, out of scope); expiring only on read
  (the reserve path would still need it to avoid false `INSUFFICIENT_STOCK`).

## R14. Testability seams and integration suite

- **Decision**: Inject a `Clock` (`now()`) and a `ReferenceGenerator` (`newReference()` from `crypto`
  randomness) into the use cases, and a `FeesConfig` value object (`baseFeeInCents`, `deliveryFeeInCents`,
  `currency`) into `CreateTransaction`. Time-dependent behavior (reservation expiry, claim lease) becomes
  deterministic in unit tests. Add a real-PostgreSQL integration suite (`npm run test:int`, config
  `back-end/test/jest-int.json`, `back-end/test/integration`, database name ending in `_test`) for concurrency,
  the lease and the CHECK constraints; it is excluded from `test:cov`.
- **Rationale**: Keeps unit tests hermetic and fast while still proving the transactional guarantees that a
  fake cannot; avoids a time dependency leaking into the domain.
- **Alternatives considered**: real `new Date()`/`crypto.randomUUID()` inline (untestable time), testing
  concurrency only with the in-memory fake (cannot prove the SQL-level guarantees).

## Best practices confirmed for the stack

- Prisma: use `updateMany` for conditional updates; `$transaction(async (tx) => ...)` for multi-step atomic
  work; catch `Prisma.PrismaClientKnownRequestError` with code `P2002` for unique conflicts. No raw SQL needed.
- NestJS: bind ports to providers with `Symbol` tokens and `useFactory` (as `ProductsModule` already does);
  keep DTO validation via `class-validator` with `whitelist`/`forbidNonWhitelisted` (already global).
- Swagger: add `@ApiTags('transactions')`/`@ApiTags('payments')` and `@Api*Response` for the new error cases.
