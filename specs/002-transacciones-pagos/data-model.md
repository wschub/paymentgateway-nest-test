# Phase 1 Data Model: Transactions and Card Payment Processing

**Feature**: `002-transacciones-pagos` | **Date**: 2026-10-09

This feature extends the existing Prisma schema (created in 001). Money is always an integer in COP cents.

## Prisma migration (new)

Extend `Transaction` with the non-sensitive card data and the payment-initiation guard. No new table is
required; `Customer`, `Delivery` and the enums already exist from 001.

| Column (DB) | Prisma field | Type | Null | Purpose |
|-------------|--------------|------|------|---------|
| `installments` | `installments` | `Int?` | yes | Chosen at payment time; default 1 at the API level. |
| `card_brand` | `cardBrand` | `String?` | yes | Visa/MasterCard, read from the provider. Never the number. |
| `card_last_four` | `cardLastFour` | `String?` | yes | Last four digits only. |
| `payment_started_at` | `paymentStartedAt` | `DateTime?` | yes | Lease/cas guard ensuring the provider transaction is created once; re-claimable after `PAYMENT_CLAIM_LEASE_SECONDS` (R6). |

Constraints and index kept/carried:

- `card_last_four`, when present, must be exactly 4 digits
  (`CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$')`).
- `installments`, when present, must be at least 1 (`CHECK (installments IS NULL OR installments >= 1)`).
- New index `(status, created_at)` supports the lazy reservation expiry scan (R13).

Existing CHECKs (`quantity > 0`, amounts ≥ 0, `total = product + base + delivery`, `stock >= 0`) remain.

## Domain entities

### Transaction

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (uuid) | non-empty |
| `reference` | string | unique, non-empty; generated with `crypto` randomness (not only a timestamp) |
| `idempotencyKey` | string | unique; 16–64 chars of letters, digits, dash or underscore (R4) |
| `status` | `PENDING` \| `APPROVED` \| `DECLINED` \| `VOIDED` \| `ERROR` | starts `PENDING` |
| `quantity` | integer | > 0 |
| `productAmountInCents` | integer | `= product.priceInCents * quantity`, > 0 |
| `baseFeeInCents` | integer | from config, ≥ 0 |
| `deliveryFeeInCents` | integer | from config, ≥ 0 |
| `totalInCents` | integer | `= product + baseFee + deliveryFee` |
| `providerTransactionId` | string \| null | set when the provider transaction exists |
| `paymentStartedAt` | Date \| null | lease claim; re-claimable after the lease expires (R6) |
| `installments` | integer \| null | ≥ 1 when present |
| `cardBrand` | string \| null | non-sensitive |
| `cardLastFour` | string \| null | exactly 4 digits when present |
| `failureReason` | string \| null | provider message, no secrets |
| `productId`, `customerId` | string (uuid) | FK |
| `createdAt`, `updatedAt` | Date | managed |

**State transitions** (only from `PENDING`; terminal states are immutable):

```text
PENDING ──approved──▶ APPROVED   (delivery ASSIGNED, stock stays decremented)
PENDING ──declined──▶ DECLINED   (no delivery, stock released)
PENDING ──voided───▶ VOIDED      (no delivery, stock released)
PENDING ──error────▶ ERROR       (no delivery, stock released)
PENDING ──expired──▶ VOIDED      (payment never started, past RESERVATION_TTL_SECONDS, stock released)
```

### Customer

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (uuid) | generated |
| `fullName` | string | non-empty, ≤ 120 chars |
| `email` | string | valid email |
| `phone` | string | non-empty, 7–20 digits/`+`/spaces |

### Delivery

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (uuid) | generated |
| `transactionId` | string (uuid) | unique, FK |
| `status` | `PENDING` \| `ASSIGNED` | starts `PENDING`, becomes `ASSIGNED` only on approval |
| `address` | string | non-empty |
| `city` | string | non-empty |
| `region` | string | non-empty |
| `notes` | string \| null | optional, ≤ 500 chars |
| `assignedAt` | Date \| null | set together with `ASSIGNED` |

### Product (unchanged; used for reservation)

`id`, `name`, `description`, `priceInCents` (> 0), `stock` (≥ 0), `imageUrl`, timestamps.

## Value objects / domain concepts

- **Money (cents)**: integer; the server is the only source of amounts.
- **Payment status**: the enum above; the provider status is mapped to it (unknown → `PENDING`, never finalized).
- **Idempotency key**: 16–64 chars of letters, digits, dash or underscore from the `Idempotency-Key` header; a
  reuse with a different product, quantity or customer email is rejected (R4).
- **Integrity signature**: `SHA256hex(reference + amountInCents + currency + integritySecret)` (R2).

## Request/response shapes (high level)

- **CreateTransaction input**: `{ productId, quantity, customer: { fullName, email, phone }, delivery:
  { address, city, region, notes? } }` + `Idempotency-Key` header.
- **CreateTransaction output**: `{ id, reference, status, quantity, amounts: { productAmountInCents,
  baseFeeInCents, deliveryFeeInCents, totalInCents } }`.
- **PayTransaction input**: `{ cardToken, installments?, acceptedContracts: true }`.
- **Transaction view (GET/payment output)**: `{ id, reference, status, quantity, amounts, card: { brand,
  lastFour, installments } | null, product: { id, name, quantity }, delivery: { status, address, city,
  region } | null, failureReason }` — never card number/CVC or secrets.
- **CheckoutConfig output**: `{ publicKey, baseUrl, currency, contracts: { terms, personalData },
  installments: { default, max } }` — public values only.

## Persistence port (encapsulates atomicity)

`TransactionRepository` (domain port) exposes business operations, not raw queries:

- `findById(id)`, `findByIdempotencyKey(key)`.
- `releaseExpiredReservations(now)` → number of purchases released. One Prisma `$transaction`: CAS
  `PENDING` with `payment_started_at IS NULL` and `created_at < now() - RESERVATION_TTL_SECONDS` → `VOIDED`
  with `failureReason = 'RESERVATION_EXPIRED'`, then release stock; idempotent and safe under concurrency
  (R13).
- `createPendingWithReservedStock(input)` → discriminated result: `created(transaction)` |
  `out_of_stock` | `product_not_found` | `duplicate(transaction)`. Runs one Prisma `$transaction`:
  conditional stock decrement, then insert customer + transaction + delivery.
- `claimPayment(transactionId, now, leaseSeconds)` → boolean. Atomic lease claim: CAS on `payment_started_at`
  where it is `NULL` or older than the lease (R6).
- `attachProviderTransaction(transactionId, { providerTransactionId, ... })`.
- `finalize({ transactionId, status, providerTransactionId?, cardBrand?, cardLastFour?, installments?,
  failureReason? })` → `{ finalized: boolean, transaction }`. One Prisma `$transaction`: CAS status update,
  then assign delivery (APPROVED) or release stock (DECLINED/VOIDED/ERROR) (R7).
