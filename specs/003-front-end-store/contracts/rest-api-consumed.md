# Contract: Back-end REST API consumed by the SPA

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

The front-end consumes the existing back-end catalog endpoints. It reads only; it never mutates stock. The
base URL comes from `VITE_API_URL` (resolved in `src/config.ts`).

## GET /products

- **Method/Path**: `GET {VITE_API_URL}/products`
- **Auth**: none
- **Success `200`**: `Product[]`

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Wireless Mouse",
    "description": "Ergonomic wireless mouse",
    "priceInCents": 3500000,
    "stock": 15,
    "imageUrl": "/images/products/mouse.webp"
  }
]
```

- **Empty catalog**: `200` with `[]` → the gallery shows the empty state.
- **Errors**: `429` → `rateLimited`; `5xx` → `server`; network/timeout → `network`.

## GET /products/:id

- **Method/Path**: `GET {VITE_API_URL}/products/:id`
- **Auth**: none
- **Success `200`**: a single `Product` (same shape as above).
- **Errors**:
  - `404` → `notFound` (renders the product-gone / not-found state).
  - `400` (malformed id) → mapped to `notFound` on the product route.
  - `429` → `rateLimited`; `5xx` → `server`; network/timeout → `network`.

## Error objects (never surfaced verbatim)

The wrapper returns plain, serializable objects with a `kind` field, not `Error` instances, so they are safe
to keep in Redux. The back-end returns a consistent error body; the UI uses the status code only and shows
its own safe message. No `message`, `code`, `path` or stack from the response is displayed to the shopper.

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Not Found",
  "path": "/products/00000000-0000-0000-0000-000000000000",
  "timestamp": "2026-10-11T12:00:00.000Z"
}
```

## Mapping table

| HTTP outcome | Front-end `kind` | Gallery UI | Product UI |
|--------------|------------------|------------|-------------|
| `2xx` | — | render products / empty state | render product |
| `404` | `notFound`; `400` on the product route also maps to `notFound` | n/a | product-gone / not-found state |
| `429` | `rateLimited` | friendly message + retry | friendly message + retry |
| `5xx`, other | `server` | error state + retry | error state + retry |
| timeout/offline | `network` | error state + retry | error state + retry |

## Re-read policy

`GET /products` is called when the gallery mounts, whenever the tab becomes visible, and on retry. `GET
/products/:id` is called when the product page opens, whenever the tab becomes visible, and immediately
before the purchase choice is recorded (see `data-model.md`, "Validation rules"). Each request carries an id,
and a response whose id is no longer the latest is ignored, so fast navigation between products never shows a
stale product.
