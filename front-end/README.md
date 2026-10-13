# Tech Store — Front-end

A small storefront for browsing a technology-accessory catalog, opening a
product, choosing a quantity and starting a purchase. It is a single-page
React application that consumes a read-only product API; payment itself is
delegated to a **payment provider** and no card data is ever handled here.

## Features

- **Gallery** (`/`): lists every product from the API with image, es-CO peso
  price and available units. Out-of-stock products are marked and cannot be
  opened. Loading, empty and error-with-retry states are covered.
- **Product** (`/product/:id`): product details, a quantity selector bounded by
  `1 .. min(stock, 10)`, and an "Iniciar compra" button that records the choice
  and shows the next-step placeholder. Removed or 0-stock products block the
  purchase.
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
URL of the back-end API (`GET /products`, `GET /products/:id`). Vite inlines
`VITE_`-prefixed variables at build time, so it is not a runtime secret.

- Copy `.env.example` to `.env.local` and set `VITE_API_URL`. Leave it empty to
  keep the app offline; API calls then resolve to a friendly error state.
- `VITE_API_URL` is read **only** inside `src/config.ts`. That file is the
  configuration seam: nothing else in `src/` may read `import.meta`, and only
  `src/shared/api/http.ts` may call `fetch`. Both rules are enforced by ESLint
  and verified by `src/__tests__/eslint-restrictions.spec.ts`.

## Imports

Source files are imported through the `@` alias, which maps to `src/`
(configured in `vite.config.ts` for the app and `jest.config.cjs` for tests):

```ts
import { httpRequest } from '@/shared/api/http'
```

## Persistence contract

An in-progress purchase survives a reload through a single `localStorage` key,
`checkout-progress`. The stored document is versioned and expires after 24
hours. Only the purchase *progress* is persisted: the current step, the
selected product id, the quantity, the delivery details (a fixed whitelist) and
the transaction id.

**Card data never enters application state or storage.** There is no card
number, CVC or expiry field anywhere in the codebase; those values live only in
the payment provider's hosted flow.

The full contract (shape, versioning, expiry and validation rules) is documented
in [`../specs/003-front-end-store/contracts/persistence.md`](../specs/003-front-end-store/contracts/persistence.md).

## Tests and coverage

`npm run test:cov` enforces a global 80% threshold. The current run reports:

| Metric     | Coverage |
| ---------- | -------- |
| Statements | 99.65%   |
| Branches   | 97.84%   |
| Functions  | 100%     |
| Lines      | 99.64%   |

(28 suites / 236 tests at the time of writing.)

### Checking the 375×667 layout

The layout is mobile-first. To verify there is no horizontal overflow at the
smallest supported size, open the app at a 375×667 viewport (for example the
browser's responsive mode) and confirm the content fits without a horizontal
scrollbar, e.g. in the console:

```js
document.documentElement.scrollWidth <= 375
```
