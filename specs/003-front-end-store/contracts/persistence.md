# Contract: Persisted checkout progress (`localStorage`)

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

One versioned document under a single key (for example `checkout-progress`). Written by a custom store
subscriber; never by `redux-persist`. The document contains only the non-sensitive whitelist. Card number
and CVC have no field in the Redux state, and the in-memory-only card display fields (`cardBrand`,
`cardLastFour`) are deliberately excluded from the whitelist, so no card field can appear here.

## Document shape

```json
{
  "version": 2,
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
  "transactionId": null,
  "idempotencyKey": "Abcdefghijklmnop1234"
}
```

## Field rules

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `version` | integer | yes | must equal the current schema version (2); otherwise discard |
| `savedAt` | ISO 8601 string | yes | parsed date; discard if `now - savedAt > 24 h` |
| `currentStep` | `product \| cardAndDelivery \| summary \| finalStatus` | yes | unknown value → discard |
| `selectedProductId` | string \| null | yes | validated against the API at startup; a `notFound` discards all progress (FR-014) |
| `quantity` | integer | yes | ≥ 1; otherwise discard |
| `delivery` | object \| null | yes | only the whitelisted keys above |
| `transactionId` | string \| null | yes | non-sensitive reference only |
| `idempotencyKey` | string \| null | yes | `null` or 16–64 chars of `[A-Za-z0-9_-]`; any other value → discard |

Any other key in the stored object is ignored on read (whitelist) and never written.

## Write rules

- Written only when the whitelisted part changed, compared by shallow comparison against the last written
  value; an unchanged whitelist never triggers a write.
- `savedAt` is refreshed on each write.
- The writer serializes the whitelist object explicitly; it never serializes the Redux state tree.
- Every `localStorage` access (read and write) is wrapped in `try/catch`; a failure (quota exceeded, storage
  disabled) is swallowed so the app never breaks.

## Read rules (on app start)

1. Read synchronously on store creation to preload the checkout state (using the validated shape). If invalid, the preloaded state is empty.
2. Not valid JSON, or wrong `version`, or missing/invalid fields → discard (preload empty).
3. `now - savedAt > 24 h` → discard (preload empty).
4. A started purchase requires `selectedProductId` present and `quantity` an integer between 1 and 10; otherwise discard.
5. `idempotencyKey` must be `null` or 16–64 chars of `[A-Za-z0-9_-]`; otherwise discard.
6. The subscriber is initialized with that validated document as its "last written value", so it never overwrites stored progress with an empty state.
7. Product validation of `selectedProductId` is asynchronous via `restoreProgress` (`src/features/checkout/checkout.thunks.ts`). 
   - `notFound` → discard all progress
   - `429`, `network`, or `server` → keep the restored progress and retry validation when the product page opens (or on retry)
   - while validation is pending, no write occurs from that validation path; the UI shows the appropriate page (gallery while validating, product page if restored)
8. Otherwise restore the progress and continue from `currentStep`.

Discarding means removing the stored document. The synchronous preload never leaves the app in a broken state; async validation may keep progress through transient errors.

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
