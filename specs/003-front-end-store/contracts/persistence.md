# Contract: Persisted checkout progress (`localStorage`)

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

One versioned document under a single key (for example `checkout-progress`). Written by a custom store
subscriber; never by `redux-persist`. The document contains only the non-sensitive whitelist. Card number
and CVC have no field in the Redux state, so they cannot appear here.

## Document shape

```json
{
  "version": 1,
  "savedAt": "2026-10-11T12:00:00.000Z",
  "currentStep": "product",
  "selectedProductId": "11111111-1111-4111-8111-111111111111",
  "quantity": 2,
  "delivery": {
    "fullName": "Test Buyer",
    "email": "buyer@example.com",
    "phone": "+57 300 000 0000",
    "address": "Calle 1 #2-3",
    "city": "Bogota",
    "region": "Cundinamarca",
    "notes": null
  },
  "transactionId": null
}
```

## Field rules

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `version` | integer | yes | must equal the current schema version (1); otherwise discard |
| `savedAt` | ISO 8601 string | yes | parsed date; discard if `now - savedAt > 24 h` |
| `currentStep` | `product \| cardAndDelivery \| summary \| finalStatus` | yes | unknown value → discard |
| `selectedProductId` | string \| null | yes | validated against the API at startup; a `notFound` discards all progress (FR-014) |
| `quantity` | integer | yes | ≥ 1; otherwise discard |
| `delivery` | object \| null | yes | only the whitelisted keys above |
| `transactionId` | string \| null | yes | non-sensitive reference only |

Any other key in the stored object is ignored on read (whitelist) and never written.

## Write rules

- Written only when the whitelisted part changed, compared by shallow comparison against the last written
  value; an unchanged whitelist never triggers a write.
- `savedAt` is refreshed on each write.
- The writer serializes the whitelist object explicitly; it never serializes the Redux state tree.
- Every `localStorage` access (read and write) is wrapped in `try/catch`; a failure (quota exceeded, storage
  disabled) is swallowed so the app never breaks.

## Read rules (on app start)

1. No document → start from the gallery.
2. Not valid JSON, or wrong `version`, or missing/invalid fields → discard the document.
3. `now - savedAt > 24 h` → discard the document (FR-021).
4. `selectedProductId` is validated against the API: `GET /products/:id` is fetched while the gallery is
   shown. A `notFound` (product removed) discards all progress (FR-014).
5. Otherwise restore the progress and continue from `currentStep`.

Discarding means removing the stored document and starting from the gallery. Validation never leaves the app
in a broken state: while the API check is in flight the shopper sees the gallery, not a blank screen.

## Clear rules

| Trigger | Effect |
|---------|--------|
| Purchase reaches the final step and the shopper leaves it | remove the document |
| Shopper chooses to start over | remove the document |
| Document older than 24 h (detected on load) | remove the document |

Delivery data is personal and is deleted together with the document at the end of the purchase; it is never
kept beyond the purchase.

## Non-sensitive invariant (tested)

A unit test serializes the written document and asserts that no key matches card-like patterns:
`card`, `cardNumber`, `cvc`, `cvv`, `pan`, `expiry`, `expiration`, `securityCode`.
