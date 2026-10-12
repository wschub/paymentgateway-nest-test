# Phase 1 Data Model: Front-end Store Pages

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

This feature has no database. The entities below are the front-end Redux state and the shape of the single
`localStorage` document. Card number and CVC have no field anywhere in this model.

## API entity: Product (read-only, from the back-end)

The gallery and detail pages consume the back-end `ProductResponseDto` unchanged (see
`contracts/rest-api-consumed.md`).

| Field | Type | Rules |
|-------|------|-------|
| `id` | string (uuid) | non-empty; used as the product route param |
| `name` | string | non-empty |
| `description` | string | may be empty |
| `priceInCents` | integer | ≥ 0; displayed as `priceInCents / 100` COP |
| `stock` | integer | ≥ 0; `0` means out of stock and unselectable |
| `imageUrl` | string | path to a WebP under `public/images/products/` |

Derived, not stored: `isOutOfStock = stock === 0`, `maxSelectableQuantity = min(stock, 10)`.

## State entity: CatalogState (`features/catalog`)

| Field | Type | Rules |
|-------|------|-------|
| `items` | Product[] | from `GET /products` |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | explicit lifecycle |
| `error` | `ApiError \| null` | safe message only; drives the retry state |
| `requestId` | string \| null | id of the latest in-flight request; older responses are ignored |
| `lastReadAt` | ISO date \| null | set on every re-read |

Selection state (out-of-stock unselectable) is derived from `items`, not stored.

Re-read triggers (FR-005): gallery mount and `visibilitychange` → visible.

## State entity: ProductDetailState (`features/product`)

| Field | Type | Rules |
|-------|------|-------|
| `product` | Product \| null | from `GET /products/:id` |
| `status` | `'idle' \| 'loading' \| 'success' \| 'error'` | explicit lifecycle |
| `error` | `ApiError \| null` | `notFound` kind renders the not-found/inform state |
| `quantity` | integer | bounded by `1..min(product.stock, 10)` |
| `requestId` | string \| null | id of the latest in-flight request; older responses are ignored |
| `lastReadAt` | ISO date \| null | set on every re-read (mount, tab visible, pre-commit) |

Validation rules from the spec:

- Re-read triggers: page open, `visibilitychange` → visible, and immediately before recording the choice.
- On re-read, if `stock < quantity`: inform the shopper and clamp `quantity` to `stock`.
- On re-read, if `stock === 0` (or product gone): mark unavailable and block the purchase.
- Stale-response guard: when the shopper moves quickly between products, a response whose `requestId` is not
  the latest is ignored (never applied to the current page).

## State entity: CheckoutState (`features/checkout`)

| Field | Type | Rules |
|-------|------|-------|
| `currentStep` | `'product' \| 'cardAndDelivery' \| 'summary' \| 'finalStatus'` | single source of the flow step |
| `selectedProductId` | string \| null | references a Product id |
| `quantity` | integer | ≥ 1 when a product is selected |
| `delivery` | `DeliveryData \| null` | non-sensitive; personal, cleared at the end |
| `transactionId` | string \| null | set once the purchase is recorded |

`DeliveryData` (whitelisted, non-sensitive): `fullName`, `email`, `phone`, `address`, `city`, `region`,
`notes?`. There is **no** card field.

### Checkout state transitions

| From | Event | To |
|------|-------|----|
| (empty) | shopper opens a product and records the choice | `product` step with product + quantity |
| `product` | later features advance the flow | `cardAndDelivery` → `summary` → `finalStatus` |
| `finalStatus` | shopper leaves the final step | cleared (persisted progress removed) |
| any | shopper chooses "start over" | cleared |
| any | stored progress older than 24 h on load | cleared |

### Persistence lifecycle

| Trigger | Effect |
|---------|--------|
| whitelisted part changed (shallow comparison) | write `{ version, savedAt, whitelist }` to `localStorage` |
| whitelisted part unchanged | no write |
| any `localStorage` access fails | ignored via `try/catch`; the app never breaks |
| app load | read, validate shape + version + age (24 h); then validate `selectedProductId` against the API while the gallery is shown; a `notFound` discards all progress |
| purchase reaches final step and shopper leaves | remove the stored document |
| shopper starts over | remove the stored document |
| `savedAt` older than 24 h | discard on load |

## Persisted document (`localStorage`)

Single versioned document; the exact contract is in `contracts/persistence.md`.

| Field | Type | Rules |
|-------|------|-------|
| `version` | integer | must equal the current schema version, else discard |
| `savedAt` | ISO date string | discard when `now - savedAt > 24 h` |
| `currentStep` | enum | one of the four steps |
| `selectedProductId` | string \| null | discarded progress if the product no longer exists |
| `quantity` | integer | ≥ 1 |
| `delivery` | DeliveryData \| null | personal; removed with the document |
| `transactionId` | string \| null | non-sensitive reference |

Serialization invariant (tested): no key in the serialized document matches card-like patterns
(`card`, `cardNumber`, `cvc`, `cvv`, `pan`, `expiry`, …).

## Error entities (`shared/api`)

Plain, serializable objects (not `Error` instances) with a `kind` field, returned by the fetch wrapper and
safe to keep in Redux. Each carries only a safe, user-facing `message`.

| `kind` | Trigger | UI |
|--------|---------|----|
| `network` | offline, DNS, or timeout (AbortController) | error state + retry |
| `rateLimited` | HTTP 429 | friendly "try again shortly" message |
| `server` | HTTP 5xx or unexpected status | error state + retry |
| `notFound` | HTTP 404; and a `400` for a malformed product id on the product route | not-found / product-gone state |
