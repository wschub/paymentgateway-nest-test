# Phase 1 Data Model: Card & Delivery Payment with Resilient Recovery

**Feature**: `004-card-delivery-payment` | **Date**: 2026-10-13

This feature adds no database table; the back-end entities (Transaction, Delivery, Customer, Product) are
unchanged and defined in `specs/002-transacciones-pagos/data-model.md`. This document models the **front-end**
Redux state, the card-form local state, and the versioned persisted document. Card number and CVC have **no
field** anywhere below.

## API entity: Product (read-only, unchanged from 003)

Reused as-is (`GET /products`, `GET /products/:id`). The payment flow reads `id`, `name` and `priceInCents`.

## API entity: CheckoutConfig (`GET /payments/checkout-config`)

| Field | Type | Rules |
|-------|------|-------|
| `publicKey` | string | public by design; used by the browser to tokenize |
| `baseUrl` | string | provider sandbox base URL for tokenization |
| `currency` | string | `"COP"` |
| `contracts.terms` | string (url) | terms-and-conditions link |
| `contracts.personalData` | string (url) | personal-data authorization link |
| `installments.default` | integer | ≥ 1 (default 1) |
| `installments.max` | integer | upper bound offered to the shopper |

No secret is present. A failure to read it (503) maps to `providerUnavailable`.

## API entity: TransactionView (`POST /transactions`, `POST /transactions/:id/payment`, `GET /transactions/:id`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | purchase id; persisted as `transactionId` |
| `reference` | string | unique reference; shown to the shopper |
| `status` | `PENDING \| APPROVED \| DECLINED \| VOIDED \| ERROR` | drives the `finalStatus` step |
| `quantity` | integer | 1–10 |
| `amounts.productAmountInCents` | integer | `unitPrice × quantity`, server-computed |
| `amounts.baseFeeInCents` | integer | server config |
| `amounts.deliveryFeeInCents` | integer | server config |
| `amounts.totalInCents` | integer | sum, server-computed |
| `card.brand` | string \| null | display only |
| `card.lastFour` | string \| null | last four digits only |
| `card.installments` | integer \| null | chosen installments |
| `product.id` / `product.name` / `product.quantity` | — | summary for the UI |
| `delivery.status/address/city/region` | — | `ASSIGNED` only when approved |
| `failureReason` | string \| null | safe reason (e.g. `RESERVATION_EXPIRED`) |

The view never contains a card number, CVC, token or secret.

## State entity: CheckoutState (`features/checkout`) — extended

Extends the 003 state. New fields are non-sensitive.

| Field | Type | Rules |
|-------|------|-------|
| `currentStep` | `'product' \| 'cardAndDelivery' \| 'summary' \| 'finalStatus'` | flow step; persisted |
| `selectedProductId` | string \| null | persisted |
| `quantity` | integer | 1–10; persisted |
| `delivery` | `DeliveryData \| null` | whitelisted non-sensitive fields; persisted |
| `transactionId` | string \| null | set once the purchase is created; persisted |
| `idempotencyKey` | string \| null | 16–64 `[A-Za-z0-9_-]`; **new**; persisted (version 2) |
| `cardBrand` | string \| null | non-sensitive; in-memory only (not persisted) |
| `cardLastFour` | string \| null | non-sensitive; in-memory only |
| `installments` | integer | default 1; in-memory only |
| `contractsAccepted` | boolean | both contracts ticked; in-memory only |
| `paymentStatus` | `'idle' \| 'creating' \| 'paying' \| 'pending' \| 'approved' \| 'declined' \| 'voided' \| 'error'` | in-memory lifecycle |
| `paymentError` | `ApiError \| null` | safe object; drives the message and next action |

There is still **no** card number, CVC or expiry field. `DeliveryData` stays: `fullName`, `email`, `phone`,
`address`, `city`, `region`, `notes?`, validated to the **same rules as the back-end DTO**
(`back-end/src/infrastructure/http/create-transaction.dto.ts`, sourced from `customer.rules.ts` and
`delivery.rules.ts`): `fullName` required and ≤ 120, `email` matches `EMAIL_PATTERN`, `phone` matches
`PHONE_PATTERN` (`/^[0-9+ ]{7,20}$/` — 7–20 chars of digits, `+` and space only, **not** a plain length check),
`address`/`city`/`region` required, `notes` optional and ≤ 500; the front-end copies the constants
`FULL_NAME_MAX_LENGTH`, `EMAIL_PATTERN`, `PHONE_PATTERN` and `NOTES_MAX_LENGTH` into `shared/constants.ts` so both
sides cannot drift. **`cardToken` is not a `CheckoutState` field**: the single-use token lives in local
`CheckoutModal` component state (memory only, never dispatched to Redux, never persisted) and is passed as an
argument to the `payTransaction` thunk when Pagar is pressed; it is excluded from `StorableCheckout`/the
persisted document and from `toStorableCheckout`.

## Local (non-Redux, non-persisted) state: card form

Held in component state inside `CardAndDeliveryForm` and cleared on close/success. Never dispatched to Redux,
never serialized, never logged.

| Field | Type | Rules |
|-------|------|-------|
| `number` | string | Luhn valid, 13–19 digits |
| `expiry` | string `MM/YY` | valid month, not in the past |
| `cvc` | string | 3–4 digits |
| `cardholder` | string | ≥ 5 characters |
| `installments` | integer | ≥ 1 and ≤ `installments.max` |
| `termsAccepted` / `personalDataAccepted` | boolean | both required to pay |

## Local (non-Redux, non-persisted) state: single-use token

The `cardToken` produced at **Continuar** is held in local `CheckoutModal` component state (a `useState`/`useRef`),
never dispatched to Redux and never serialized. It is passed as an argument to the `payTransaction` thunk when
**Pagar** is pressed. Its lifecycle is unchanged: **kept** across a `network`/timeout/`503` at Pagar (the retry
re-sends the same token with the same key; the back-end reconciles the pending claim by reference) and
**discarded** on payment `202`/`200`, on `422 invalidToken`, on any `409`, on modal close and on any final state.

| Field | Type | Rules |
|-------|------|-------|
| `cardToken` | string \| null | single-use token; local to `CheckoutModal`; never in Redux, never persisted |

## State entity: CheckoutConfigState (`features/checkout`)

| Field | Type | Rules |
|-------|------|-------|
| `config` | `CheckoutConfig \| null` | loaded once via thunk |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | explicit lifecycle |
| `error` | `ApiError \| null` | `providerUnavailable` shows a retry |

## Persisted document (`localStorage`, version 2)

Single document under `checkout-progress`; the exact contract is
[`specs/003-front-end-store/contracts/persistence.md`](../003-front-end-store/contracts/persistence.md), which is
updated by this feature.

| Field | Type | Rules |
|-------|------|-------|
| `version` | integer | must equal **2**, else discard (discard-on-mismatch kept) |
| `savedAt` | ISO date string | discard when `now - savedAt > 24 h` |
| `currentStep` | enum | one of the four steps |
| `selectedProductId` | string \| null | discard progress if the product no longer exists |
| `quantity` | integer | 1–10 |
| `delivery` | `DeliveryData \| null` | personal; removed with the document |
| `transactionId` | string \| null | non-sensitive |
| `idempotencyKey` | string \| null | 16–64 `[A-Za-z0-9_-]`, or null |

Serialization invariant (tested): no key in the serialized document matches card-like patterns (`card`,
`cardNumber`, `cvc`, `cvv`, `pan`, `expiry`, `expiration`, `securityCode`).

## Error kinds (`shared/api`)

Plain serializable objects with a `kind` and a safe `message`, never shown with back-end/provider text.

| `kind` | Trigger | UI action |
|--------|---------|-----------|
| `network` | offline / DNS / timeout | friendly message + retry |
| `rateLimited` | HTTP 429 | "try again shortly" |
| `server` | HTTP 5xx other than the mapped ones | message + retry |
| `notFound` | HTTP 404 (product or transaction) | product-gone / not-found |
| `soldOut` | 409 `INSUFFICIENT_STOCK` | sold-out message; adjust or block |
| `idempotencyConflict` | 409 `IDEMPOTENCY_KEY_REUSED` | start a fresh purchase |
| `notPayable` | 409 `TRANSACTION_NOT_PAYABLE` | show current status; no second charge |
| `contractsNotAccepted` | 422 `CONTRACTS_NOT_ACCEPTED` | ask to tick both contracts |
| `invalidToken` | 422 `INVALID_PAYMENT_TOKEN` | re-enter the card |
| `providerRejected` | 502 `PAYMENT_PROVIDER_REJECTED` | generic retry message |
| `providerUnavailable` | 503 `PAYMENT_PROVIDER_UNAVAILABLE` / checkout-config 503 | message + retry |
| `badRequest` | malformed 400 | friendly message |

## Checkout state transitions (payment flow)

| From | Event | To |
|------|-------|----|
| `product` (choice recorded) | shopper opens the modal | `cardAndDelivery` (idempotency key generated, persisted) |
| `cardAndDelivery` | **Continuar**: valid delivery + card and both contracts; card tokenized | `summary` (create pending transaction; token held in memory) |
| `cardAndDelivery` | **Continuar** with an existing pending `transactionId` | `summary` (same key replays the pending purchase, same id/reference) |
| `summary` | **Pagar** accepted (`202`/`200`) | `finalStatus` (pending; token discarded as used) |
| `summary` | back-end answers a final status at payment creation (rare) | `finalStatus` (final; token discarded) |
| `summary` | refresh / reopen (token is memory-only) | `cardAndDelivery` (same key; re-enter the card) |
| `summary` | **Pagar** rejected `invalidToken` | `cardAndDelivery` (same `transactionId` + key; re-enter the card; token discarded) |
| `summary` | **Pagar** rejected `providerUnavailable`/`network` | `summary` (same `transactionId` + key + **same token kept**; retry Pagar) |
| `finalStatus` (pending) | read/poll returns a final status | `finalStatus` (approved/declined/voided/error) |
| `finalStatus` (approved) | shopper leaves | progress cleared |
| `finalStatus` (declined/voided/error, incl. `RESERVATION_EXPIRED`) | shopper retries with a new card | `cardAndDelivery` (`transactionId` cleared, **new** idempotency key) |
| any | shopper starts over | cleared (document removed) |
| any | persisted document older than 24 h / wrong version / stale product / missing key when required | discarded on load |

**Verified-on-load state**: with a restored `transactionId` the app opens the payment step in a "verifying"
state and shows neither success nor failure until `GET /transactions/:id` responds; responses that arrive out of
order are ignored so only the latest `requestId` result is applied.

**Status polling**: fixed interval `STATUS_POLL_INTERVAL_MS = 2000` ms with a ceiling `STATUS_POLL_CEILING_MS =
40000` ms; on reaching the ceiling the UI stays in the pending state and offers a manual "re-verify" (no backoff,
cancelled on unmount).

## Validation rules

- Quantity 1–10; the purchase is only startable when `selectedProductId` and a valid quantity exist.
- `idempotencyKey` is **required only when** `currentStep !== 'product'` **or** a `transactionId` is present;
  when required it must match `^[A-Za-z0-9_-]{16,64}$`, else `null` is allowed and the document is discarded if
  the rule fails.
- Idempotency-key lifecycle: generated once at modal open (persisted); reused only while the transaction is
  `PENDING` (network failure, 503, `invalidToken`, replay); on `DECLINED`/`VOIDED`/`ERROR` (incl.
  `RESERVATION_EXPIRED`) `transactionId` is cleared and a new key is generated.
- Delivery fields validated (flat form → nested payload `{ customer: { fullName, email, phone }, delivery:
  { address, city, region, notes? } }`) with the back-end rules above (`phone` must match `PHONE_PATTERN`, not a
  plain length check) before continuing.
- Card fields validated per the table above; installments within `1..installments.max`.
- Both contracts required; otherwise `contractsNotAccepted` blocks before any request (no tokenization, no
  transaction created).
- The persisted document is discarded when `version !== 2`, when older than 24 h, when the product is gone, or
  when any field fails its rule (keeps `persistence.ts` discard-on-mismatch).
- The persisted document never contains `cardToken`, the card number, CVC or expiry.
