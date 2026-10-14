# Tech Store — Front-end

A small storefront for browsing a technology-accessory catalog, opening a
product, choosing a quantity and completing a purchase. It is a single-page
React application that consumes the back-end API for the catalog
(`GET /products`, `GET /products/:id`) and for checkout
(`GET /payments/checkout-config`, `POST /transactions`,
`POST /transactions/:id/payment`, `GET /transactions/:id`). Payment runs
against a **payment provider**: the card is **tokenized in the browser** with
the provider's public key, and the card number and CVC are **never stored**.

## Features

- **Gallery** (`/`): lists every product from the API with image, es-CO peso
  price and available units. Out-of-stock products are marked and cannot be
  opened. Loading, empty and error-with-retry states are covered.
- **Product** (`/product/:id`): product details, a quantity selector bounded by
  `1 .. min(stock, 10)`, and an "Iniciar compra" button that records the choice
  and opens the checkout modal (see below). Removed or 0-stock products block
  the purchase.
- **Checkout & payment**: "Iniciar compra" opens the card-and-delivery modal
  with steps `cardAndDelivery → summary → finalStatus`. **Continuar** validates
  the delivery and card data and the two contracts, tokenizes the card in the
  browser and creates the `PENDING` purchase; the **summary** shows the
  server-computed amounts and **Pagar** starts the payment. The modal then
  polls the back-end status until it is final and survives a refresh
  mid-payment (it re-reads the real status instead of charging again). Every
  edge case — sold out, declined, invalid/expired token, provider unavailable,
  timeout/`PENDING`, a retried idempotency key and amount tampering — shows a
  clear, non-technical message and never double-charges.
- **Re-reads**: the gallery re-reads on mount and whenever the tab becomes
  visible again; the product page additionally re-reads right before the
  purchase choice is recorded. If stock shrank, the shopper is told through a
  live region and the quantity is clamped; if nothing remains, the purchase is
  blocked. Out-of-order responses are ignored by request id.
- **Accessibility**: semantic landmarks, a skip-to-content link, focus moved to
  each page's `<h1>` on navigation, labelled controls, image `alt` text and
  `status`/`alert` live regions for stock changes and errors.
- **Recovery**: an in-progress purchase is persisted and offered again after a
  reload (see the persistence contract below).

## Tech stack

- React 19 + TypeScript
- Redux Toolkit + React Redux for state
- React Router v7 for routing
- Tailwind CSS v4 for styling
- Vite for dev server and build
- Jest + Testing Library for tests

## Scripts

```bash
npm install     # install dependencies
npm run dev     # start the dev server at http://localhost:5173
npm run build   # type-check (tsc -b) and produce a production build in dist/
npm run lint    # run ESLint over the whole project
npm test        # run the Jest test suite
npm run test:cov# run the suite with coverage
```

## Configuration

The app reads a single build-time variable, `VITE_API_URL`, which is the base
URL of the back-end API (`GET /products`, `GET /products/:id`,
`GET /payments/checkout-config`, `POST /transactions`,
`POST /transactions/:id/payment`, `GET /transactions/:id`). Vite inlines
`VITE_`-prefixed variables at build time, so it is not a runtime secret.

- Copy `.env.example` to `.env.local` and set `VITE_API_URL`. Leave it empty to
  keep the app offline; API calls then resolve to a friendly error state.
- The provider base URL and public key are **not** build-time variables: they
  come from `GET /payments/checkout-config` at runtime (public values only, no
  secret in the front-end).
- `VITE_API_URL` is read **only** inside `src/config.ts`. That file is the
  configuration seam: nothing else in `src/` may read `import.meta`.
- Only `src/shared/api/http.ts` (our API) and
  `src/shared/api/payment-provider.ts` (browser card tokenization) may call
  `fetch`. Both rules are enforced by ESLint and verified by
  `src/__tests__/eslint-restrictions.spec.ts`.

## Imports

Source files are imported through the `@` alias, which maps to `src/`
(configured in `vite.config.ts` for the app and `jest.config.cjs` for tests):

```ts
import { httpRequest } from '@/shared/api/http'
```

## Persistence contract

An in-progress purchase survives a reload through a single `localStorage` key,
`checkout-progress`. The stored document is **versioned (version 2)** and
expires after 24 hours; a document whose version does not match is discarded on
load. Only the non-sensitive purchase *progress* is persisted: the current step,
the selected product id, the quantity, the delivery details (a fixed whitelist),
the transaction id/reference/status and the **idempotency key** (16–64 chars of
`[A-Za-z0-9_-]`). The single-use card token is **not** part of this document.

**Card data never enters application state or storage.** There is no card
number, CVC or expiry field anywhere in the codebase: the card is **tokenized
in the browser with the public key and never stored** (a provider-hosted widget
or hosted checkout page is not used), and only the single-use token — held in
memory — plus the card brand and last four are ever used.

The full contract (shape, versioning, expiry and validation rules) is documented
in [`../specs/003-front-end-store/contracts/persistence.md`](../specs/003-front-end-store/contracts/persistence.md).

## Tests and coverage

`npm run test:cov` enforces a global 80% threshold. The current run reports:

| Metric     | Coverage |
| ---------- | -------- |
| Statements | 97.92%   |
| Branches   | 95.69%   |
| Functions  | 96.18%   |
| Lines      | 98.37%   |

(39 suites / 464 tests at the time of writing.)

### Checking the 375×667 layout

The layout is mobile-first. To verify there is no horizontal overflow at the
smallest supported size, open the app at a 375×667 viewport (for example the
browser's responsive mode) and confirm the content fits without a horizontal
scrollbar, e.g. in the console:

```js
document.documentElement.scrollWidth <= 375
```
