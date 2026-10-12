# Quickstart: Front-end Store Pages

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

Manual, end-to-end validation guide. The front-end only reads the catalog API; it never mutates stock.

## Prerequisites

- The back-end catalog API running (default `http://localhost:3000`) with seeded products, OR the deployed
  API URL. See `specs/002-transacciones-pagos/quickstart.md` for seeding and running the back-end.
- Node.js 20+ and `front-end/` dependencies installed (`npm ci`).
- `front-end/.env.local` (gitignored) with the API base URL:

```dotenv
VITE_API_URL=http://localhost:3000
```

`front-end/.env.example` keeps `VITE_API_URL=` empty (constitution V). `VITE_API_URL` is read only in
`src/config.ts`.

## Setup

```bash
cd front-end
npm ci
npm run dev            # http://localhost:5173
```

## Validate with the browser

1. **Gallery (`/`)**: open `http://localhost:5173/`. Every product renders with image, es-CO peso price and
   units available. Out-of-stock products are marked and cannot be selected.
2. **States**: stop the back-end and reload → loading then error state with a retry; restart the back-end and
   press retry → the catalog loads. Point `VITE_API_URL` at a stub returning `[]` → empty state.
3. **Product (`/product/:id`)**: click a product. The address changes to its id. Image, name, description,
   price and stock are shown. Move the quantity selector with mouse and keyboard; it stays within
   `1..min(stock, 10)`.
4. **Reload a product**: reload `/product/<id>` → the same product page renders (SC-008).
5. **Unknown address**: open `http://localhost:5173/does-not-exist` → not-found page with a link back to the
   gallery.
6. **Refresh recovery**: choose a quantity, press the purchase button, then reload → the selected product and
   quantity are restored from persisted progress; no card data exists anywhere.
7. **Stock re-read**: with the product page open, change the product's stock in the back-end (make a purchase
   elsewhere or edit the seed), switch tabs and return → the page re-reads and, if stock dropped below the
   chosen quantity, the shopper is told (via the live region) and the quantity is clamped; if stock is 0 the
   purchase is blocked. The gallery also re-reads on tab return.
8. **Stale-response guard**: open a product, then tap through several product links quickly → the shown page
   always matches the last link tapped, never an earlier, slower response.
9. **Responsive**: at 375×667 (device toolbar) there is no horizontal overflow; layout scales up to desktop.
   With viewport at 375×667, open the gallery, a product page and the not-found page and verify in the console:
   `document.documentElement.scrollWidth <= window.innerWidth` is `true` for each.
10. **Accessibility**: tab through the page; focus is always visible, the quantity selector and purchase
    button are operable with the keyboard, and product images have `alt` text. After any route change, focus
    lands on the page heading. Stock changes and errors are announced through live regions (polite for stock,
    assertive for errors). Force a product image to fail (block `/images/products/*.webp`) → the local
    `public/images/fallback.svg` is shown.

## Inspect persisted progress

In the browser devtools console:

```js
JSON.parse(localStorage.getItem('checkout-progress'))
```

Confirm the document matches `contracts/persistence.md` and contains no card-like keys. Set `savedAt` to more
than 24 hours ago and reload → the progress is discarded (FR-021). Point `selectedProductId` at a product the
API no longer returns and reload → the gallery is shown while the product is validated, then the progress is
discarded (FR-014).

## Automated tests

```bash
cd front-end
npm run lint           # ESLint
npm run build          # tsc -b && vite build (type-check + production build)
npm test               # Jest: reducers, thunks (mocked fetch), API client, persistence, pages
npm run test:cov       # same with coverage; threshold 80% (excludes main.tsx and config.ts)
```

Coverage is global (not per-file) and fails under 80 %. `import.meta.env` is never evaluated in tests because
`jest.config.cjs` maps `^@/config$` to the test double `src/__mocks__/config.ts` (`^@/(.*)$` maps to `src/$1`).

## Static hosting check

```bash
npm run build
npx serve -s dist      # -s serves index.html for unknown paths (SPA fallback)
```

Open a deep link such as `http://localhost:3000/product/<id>` (with `serve` as the host) and confirm it
renders the product page, not a 404 from the static server.

Definition of done: lint clean, type-check/build clean, coverage ≥ 80 %, no card data persisted (test
proves it), no provider company name, `.env.example` empty.
