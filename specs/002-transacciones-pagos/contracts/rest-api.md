# Contract: Public HTTP API

**Feature**: `002-transacciones-pagos` | Base path: none (routes are absolute, as in 001)

All errors use the shared 5-key body:
`{ "statusCode": number, "code": string, "message": string, "path": string, "timestamp": string }`.
No response or error ever contains a provider secret, the card number or the CVC.

Money is an integer in COP cents.

---

## GET /payments/checkout-config

Public, non-secret configuration for the browser to render the two contracts and tokenize the card.

**200 OK**

```json
{
  "publicKey": "pub_****",
  "baseUrl": "https://<sandbox-host>/v1",
  "currency": "COP",
  "contracts": {
    "terms": "https://<host>/.../end-user-policy",
    "personalData": "https://<host>/.../personal-data"
  },
  "installments": { "default": 1, "max": 36 }
}
```

**503** `PAYMENT_PROVIDER_UNAVAILABLE` when the merchant info cannot be read.

Notes: `publicKey` is public by design (used by the browser). `contracts.*` come from the merchant
endpoint's `presigned_acceptance.permalink` and `presigned_personal_data_auth.permalink`.

---

## POST /transactions

Creates a `PENDING` purchase, reserves stock, and returns the server-computed amount breakdown.

**Headers**: `Idempotency-Key: <16–64 chars of letters, digits, dash or underscore>` (required).

**Request**

```json
{
  "productId": "11111111-1111-4111-8111-111111111111",
  "quantity": 1,
  "customer": { "fullName": "Test Buyer", "email": "buyer@example.com", "phone": "+57 300 000 0000" },
  "delivery": { "address": "Calle 1 #2-3", "city": "Bogotá", "region": "Cundinamarca", "notes": "Ring twice" }
}
```

**201 Created** (first time)

```json
{
  "id": "f0e1...",
  "reference": "TXN-1759999999-1234",
  "status": "PENDING",
  "quantity": 1,
  "amounts": {
    "productAmountInCents": 1500000,
    "baseFeeInCents": 300000,
    "deliveryFeeInCents": 900000,
    "totalInCents": 2700000
  }
}
```

**200 OK** — replay: the same `Idempotency-Key` (and same product, quantity and customer email) returns the
previously created purchase (same `id` and `reference`), never a new one.

**Errors**

| Status | code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Malformed body, or missing/malformed `Idempotency-Key`. |
| 404 | `PRODUCT_NOT_FOUND` | The product does not exist. |
| 409 | `INSUFFICIENT_STOCK` | Requested quantity exceeds available stock. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | The key was reused with a different product, quantity or customer email. |

Amounts are always recomputed by the server: `productAmount = product.priceInCents * quantity`,
`baseFee`/`deliveryFee` from configuration, `total = sum`. Client amounts, if sent, are ignored.

---

## POST /transactions/:id/payment

Starts the card payment for a pending purchase.

**Request**

```json
{ "cardToken": "tok_test_...", "installments": 1, "acceptedContracts": true }
```

`cardToken` is a single-use token produced by the browser; `installments` defaults to 1;
`acceptedContracts` must be `true` (validated in the use case, not by the DTO).

**202 Accepted** — the provider transaction was created and is still `PENDING`:

```json
{ "id": "f0e1...", "status": "PENDING", "...": "same shape as the transaction view" }
```

**200 OK** — the purchase was already final (idempotent replay) or finalized immediately.

**Errors**

| Status | code | When |
|--------|------|------|
| 400 | `BAD_REQUEST` | Malformed body / missing `cardToken`. |
| 404 | `TRANSACTION_NOT_FOUND` | Unknown purchase id. |
| 409 | `TRANSACTION_NOT_PAYABLE` | The purchase is not `PENDING` (already paid/final). |
| 422 | `CONTRACTS_NOT_ACCEPTED` | `acceptedContracts` is not `true` (checked in the use case). |
| 422 | `INVALID_PAYMENT_TOKEN` | The provider definitively rejected the creation with a 4xx about the token; the claim is cleared so the shopper can retry with a new token. |
| 502 | `PAYMENT_PROVIDER_REJECTED` | Any other provider 4xx; generic message. |
| 503 | `PAYMENT_PROVIDER_UNAVAILABLE` | Provider timed out, network error or 5xx; the claim is kept (reconcile by reference on retry). |

The provider transaction is created at most once per purchase. `payment_started_at` is a **lease** (re-claimable
after `PAYMENT_CLAIM_LEASE_SECONDS`) and **every claimer reconciles by `reference` before creating**. Timeouts
and 5xx keep the claim (→ 503); a definitive token rejection with 4xx clears it (→ 422 `INVALID_PAYMENT_TOKEN`).

---

## GET /transactions/:id

Source of truth for the front-end. While `PENDING`, the service reads the provider and finalizes
idempotently; the response always reflects the current state. A purchase whose payment was never started and
that is older than `RESERVATION_TTL_SECONDS` is released lazily on read and reported as `VOIDED` with
`failureReason = "RESERVATION_EXPIRED"`.

**200 OK — transaction view**

```json
{
  "id": "f0e1...",
  "reference": "TXN-1759999999-1234",
  "status": "APPROVED",
  "quantity": 1,
  "amounts": { "productAmountInCents": 1500000, "baseFeeInCents": 300000, "deliveryFeeInCents": 900000, "totalInCents": 2700000 },
  "card": { "brand": "VISA", "lastFour": "4242", "installments": 1 },
  "product": { "id": "11111111-1111-4111-8111-111111111111", "name": "Cable Organizer", "quantity": 1 },
  "delivery": { "status": "ASSIGNED", "address": "Calle 1 #2-3", "city": "Bogotá", "region": "Cundinamarca" },
  "failureReason": null
}
```

On approval the delivery becomes `ASSIGNED`; on decline/void/error the reserved stock is released.

**404** `TRANSACTION_NOT_FOUND`.

---

## POST /webhooks/payment-events *(optional, lower priority)*

Accepts provider events. Verifies the checksum with the events secret (`stagtest_events`), reconciles the
purchase through the same finalization CAS, and ignores duplicates.

**200 OK** — event accepted or already processed.

**400** — invalid checksum / payload. No state changes on a rejected event.

---

## Swagger

The new operations are documented under tags `transactions` and `payments`, with request/response DTOs and
`@Api*Response` for every error case above. `/docs` and `/docs-json` keep working; the relaxed CSP only
applies to `/docs*`.
