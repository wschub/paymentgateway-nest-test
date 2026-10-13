# Contract: Back-end REST API consumed by the payment flow

**Feature**: `004-card-delivery-payment` | **Date**: 2026-10-13

The SPA consumes the **existing** back-end endpoints from feature 002. It sends no amounts and no card data
(other than the single-use token). The base URL comes from `VITE_API_URL`; the provider base URL comes from
`/payments/checkout-config`. All errors use the shared body
`{ statusCode, code, message, path, timestamp }`; the UI uses `statusCode` + `code` only and never shows
`message`, `path` or provider text.

## GET /payments/checkout-config

- **Success `200`**: `{ publicKey, baseUrl, currency, contracts: { terms, personalData }, installments: { default, max } }`.
- **Errors**: `503 PAYMENT_PROVIDER_UNAVAILABLE` → `providerUnavailable`.

## POST /transactions

- **Headers**: `Idempotency-Key: <16–64 chars of [A-Za-z0-9_-]>` (required).
- **Request**: `{ productId, quantity, customer: { fullName, email, phone }, delivery: { address, city, region, notes? } }`.
  No amount field is ever sent; unknown fields are rejected by the back-end.
- **`201 Created`** (first time) / **`200 OK`** (idempotent replay): `TransactionView` with server-computed
  `amounts`.
- **Errors**: `400 BAD_REQUEST` (malformed / client-sent amounts) → `badRequest`; `404 PRODUCT_NOT_FOUND` →
  `notFound`; `409 INSUFFICIENT_STOCK` → `soldOut`; `409 IDEMPOTENCY_KEY_REUSED` → `idempotencyConflict`.

## POST /transactions/:id/payment

- **Request**: `{ cardToken, installments, acceptedContracts: true }`.
- **`202 Accepted`**: payment in progress (or already started), `TransactionView` (usually `PENDING`); a second
  call does **not** charge again.
- **`200 OK`**: only when the provider already answered a final status at creation time.
- **Errors**: `400` → `badRequest`; `404 TRANSACTION_NOT_FOUND` → `notFound`; `409 TRANSACTION_NOT_PAYABLE` →
  `notPayable`; `422 CONTRACTS_NOT_ACCEPTED` → `contractsNotAccepted`; `422 INVALID_PAYMENT_TOKEN` → `invalidToken`
  (claim cleared; shopper can retry with a new token); `502 PAYMENT_PROVIDER_REJECTED` → `providerRejected`;
  `503 PAYMENT_PROVIDER_UNAVAILABLE` → `providerUnavailable` (claim kept; reconcile by reference on retry).

## GET /transactions/:id

- **Success `200`**: `TransactionView`; while `PENDING`, the back-end reads the provider and finalizes
  idempotently, releasing stock on non-approved finals. `RESERVATION_EXPIRED` appears as `VOIDED` with
  `failureReason`.
- **Errors**: `404 TRANSACTION_NOT_FOUND` → `notFound`.

## Error → kind mapping (implemented in `shared/api/http.ts`)

| HTTP outcome | `code` | `kind` |
|--------------|--------|--------|
| 404 | `PRODUCT_NOT_FOUND` / `TRANSACTION_NOT_FOUND` | `notFound` |
| 409 | `INSUFFICIENT_STOCK` | `soldOut` |
| 409 | `IDEMPOTENCY_KEY_REUSED` | `idempotencyConflict` |
| 409 | `TRANSACTION_NOT_PAYABLE` | `notPayable` |
| 422 | `CONTRACTS_NOT_ACCEPTED` | `contractsNotAccepted` |
| 422 | `INVALID_PAYMENT_TOKEN` | `invalidToken` |
| 502 | `PAYMENT_PROVIDER_REJECTED` | `providerRejected` |
| 503 | `PAYMENT_PROVIDER_UNAVAILABLE` | `providerUnavailable` |
| 429 | any | `rateLimited` |
| 400 | any | `badRequest` |
| other 5xx | any | `server` |
| timeout / offline | — | `network` |

## Flow order

- `POST /transactions` is called by **Continuar** (creates the `PENDING` purchase); `POST /transactions/:id/payment`
  is called later by **Pagar** with the single-use token held in memory. A refresh between the two re-enters the
  card and replays `POST /transactions` with the same key (same `id`/`reference`).

## Idempotency and amount rules

- One `Idempotency-Key` per purchase, generated once when the modal opens and persisted (version 2). It is
  reused **only while the purchase is `PENDING`** (network failure, 503, `invalidToken` or an idempotent replay);
  a replay returns the existing purchase (same `id`/`reference`). The key is required only once the flow has
  moved past the product step or a `transactionId` exists.
- Once the purchase is final `DECLINED`/`VOIDED`/`ERROR` (incl. `RESERVATION_EXPIRED`), the client clears
  `transactionId` and generates a **new** key before retrying; a payment attempt on a final transaction returns
  `409 TRANSACTION_NOT_PAYABLE`.
- Amounts are **only** ever read from the `TransactionView.amounts` returned by the server; the client computes
  and sends none, so tampering is impossible and a mismatch cannot change what is charged.
