# Implementation Plan: Front-end Store Pages

**Branch**: `003-front-end-store` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-front-end-store/spec.md`

## Summary

Build the front-end store pages from scratch inside the existing `front-end/` Vite starter template
(replacing its demo files), following the constitution and docs/requirements.md. The app is a React +
TypeScript single-page app using Redux Toolkit (with `react-redux`), React Router and Tailwind CSS through
its Vite plugin. It ships a product gallery and a product detail page, each with its own address and a
not-found route, plus a checkout-progress slice that persists only a versioned, non-sensitive whitelist to
`localStorage` and restores it after a refresh. Data is read through a small typed `fetch` wrapper (timeout
and network/rate-limited/server/not-found failure kinds, never leaking internal details) wrapped by
`createAsyncThunk` slices with explicit loading/success/error and retry. The gallery re-reads the catalog on
mount and when the tab becomes visible; the product page re-reads on open, on tab visibility and right before
the purchase choice is recorded, ignoring stale responses by request id. Card number and CVC have no field in
the state at all. Prices are formatted with `Intl.NumberFormat` (es-CO / COP, no decimals) from cents ÷ 100,
and images are fixed-size WebP files served from `public/images/products` with lazy loading, async decoding
and a local `public/images/fallback.svg` fallback. Errors kept in the store are plain serializable objects
with a `kind`, stock changes and errors are announced through live regions, and focus moves to the page
heading after each route change. Everything is covered by Jest tests (reducers, thunks with a mocked `fetch`,
the API client, persistence load/discard rules and the pages) with a global 80 % coverage threshold.
Deployment is a static SPA with an `index.html` fallback and a build-time `VITE_API_URL`.

## Technical Context

**Language/Version**: TypeScript 6.x, React 19 (Vite 8 starter already present in `front-end/`)

**Primary Dependencies**: `react`, `react-dom`, `@reduxjs/toolkit`, `react-redux`, `react-router-dom`,
`tailwindcss` + `@tailwindcss/vite` (Vite plugin), `@vitejs/plugin-react`. No UI component library and no
`redux-persist`.

**Testing**: Jest + `ts-jest`, `jest-environment-jsdom`, `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event`. Global coverage threshold 80 %, excluding
`src/main.tsx` and `src/config.ts`. Peer compatibility of `ts-jest`, `jest`, `jest-environment-jsdom`,
`@tailwindcss/vite`, `@testing-library/react` and the starter TypeScript version is verified at install time;
an incompatible package is pinned to a supported version (never `--force` or `--legacy-peer-deps`).

**Storage**: Browser `localStorage` only, for the versioned non-sensitive checkout whitelist. No server
persistence; no card data.

**Target Platform**: Modern desktop and mobile browsers (mobile-first from 375×667 CSS px up to desktop).
Local development on macOS.

**Project Type**: React single-page application (front-end app inside the monorepo).

**Performance Goals**: Instant navigation between in-memory routes; no horizontal overflow at 375 px; light
WebP images with explicit dimensions and lazy loading below the fold.

**Constraints**: `import.meta.env` is read only in `src/config.ts` (`VITE_API_URL`); every module imports it
as `@/config` through the `@` → `src` path alias, and Jest substitutes it via `moduleNameMapper`. Errors kept
in the store are plain serializable objects (kind), never `Error` instances. Card number and CVC have no
field in the Redux state. No provider company name. No secrets committed; `front-end/.env.example` keeps
values empty.

**Scale/Scope**: Two routed pages plus a not-found page; three feature slices (catalog, product, checkout);
one shared API layer; one custom persistence subscriber. No multi-product cart.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Source of truth | Derives from docs/requirements.md §7 (React SPA, Redux Toolkit, Tailwind, mobile-first, WebP, persist whitelist) and docs/requirements.md FR-8 (refresh recovery), plus spec FR-001..FR-022. | PASS |
| II. Hexagonal (non-negotiable) | Back-end concern; the front-end still keeps clear boundaries (features + a shared API adapter instead of calling `fetch` from components). | PASS (N/A to back-end layers) |
| III. Testing & coverage (non-negotiable) | Jest with reducers, thunks (mocked `fetch`), the API client, persistence rules and pages tested; global threshold 80 %. | PASS |
| IV. Railway Oriented Programming | Back-end concern; the front-end expresses failures as typed error values from the API wrapper and explicit error states, never thrown raw to the UI. | PASS (adapted) |
| V. Security by design (non-negotiable) | Card number/CVC have no state field and never reach `localStorage`; a test asserts the serialized persisted state has no card-like keys; secrets only in env; `.env.example` empty. | PASS |
| VI. Atomicity & data integrity | Back-end concern; the front-end only reads stock and never mutates it. | PASS (N/A) |
| VII. Simplicity & YAGNI | Small hand-written `fetch` wrapper instead of an HTTP client; no UI library; no `redux-persist`; generic naming; one product per purchase. | PASS |

No violations; Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: re-evaluated against the generated `data-model.md` and
`contracts/`. The design keeps card data absent from the state and the persisted document (Principle V), adds
no dependency beyond the mandated stack (Principle VII), tests reducers/thunks/API/persistence/pages with a
80 % threshold (Principle III), and introduces no back-end layer changes (Principle II). Gates still PASS; no
new violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-front-end-store/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rest-api-consumed.md   # Back-end endpoints the SPA consumes + error mapping
│   ├── persistence.md         # Versioned localStorage whitelist contract
│   └── routes.md              # URL/route contract (gallery, product, not-found)
├── checklists/
│   └── requirements.md  # Spec quality checklist (already present)
└── spec.md              # Feature spec (already present)
```

### Source Code (repository root)

```text
front-end/
├── .env.example                         # VITE_API_URL= (empty; build-time variable)
├── index.html                           # SPA entry; fallback target for static serving
├── vite.config.ts                       # @tailwindcss/vite plugin + resolve.alias '@' -> src
├── tsconfig.app.json                    # app tsconfig + paths { "@/*": ["src/*"] }
├── tsconfig.spec.json                   # test tsconfig (CommonJS transform for ts-jest) + paths alias
├── jest.config.cjs                      # ts-jest + jsdom + moduleNameMapper (^@/config$ double, ^@/(.*)$ -> src/$1, asset/CSS mocks)
├── jest.setup.ts                        # @testing-library/jest-dom matchers + cleanup
├── package.json                         # scripts: dev, build, lint, test, test:cov
├── public/
│   └── images/
│       ├── fallback.svg                 # local fallback shown when a product image fails
│       └── products/                    # 9 product WebP images (already present)
└── src/
    ├── main.tsx                         # bootstrap (excluded from coverage)
    ├── config.ts                        # ONLY place reading import.meta.env (VITE_API_URL)
    ├── __mocks__/
    │   └── config.ts                    # Jest test double mapped to ^@/config$
    ├── app/
    │   ├── store.ts                     # configureStore + typed hooks + persistence subscriber
    │   ├── hooks.ts                     # typed useAppDispatch / useAppSelector
    │   ├── providers.tsx                # React Redux Provider
    │   └── router.tsx                   # routes (gallery, product/:id, not-found); focus to heading on route change
    ├── features/
    │   ├── catalog/
    │   │   ├── catalog.slice.ts         # createAsyncThunk + loading/success/error + re-read on mount/visibility
    │   │   ├── CatalogPage.tsx          # gallery page
    │   │   ├── ProductCard.tsx          # image, name, price, stock, out-of-stock
    │   │   └── catalog.selectors.ts
    │   ├── product/
    │   │   ├── product.slice.ts         # detail thunk + re-read triggers + request-id stale guard
    │   │   ├── ProductPage.tsx          # detail page + quantity selector + purchase button
    │   │   ├── QuantitySelector.tsx     # keyboard-operable, bounded 1..min(stock,10)
    │   │   └── product.selectors.ts
    │   └── checkout/
    │       ├── checkout.slice.ts        # step, selectedProductId, quantity, delivery, transactionId
    │       ├── checkout.selectors.ts
    │       └── persistence.ts           # versioned whitelist read/write, shallow change check, try/catch, 24h age, discard rules
    └── shared/
        ├── api/
        │   ├── http.ts                  # fetch wrapper: timeout + typed error kinds
        │   └── api.errors.ts            # plain objects: { kind: 'network' | 'rateLimited' | 'server' | 'notFound' }
        ├── ui/
        │   ├── Image.tsx                # fixed w/h, lazy, decoding=async, onError -> fallback.svg
        │   ├── LiveRegion.tsx           # polite status / assertive alert for stock changes and errors
        │   ├── Spinner.tsx
        │   ├── ErrorState.tsx           # friendly message + retry
        │   └── EmptyState.tsx
        └── format/
            └── money.ts                 # Intl.NumberFormat es-CO / COP, cents ÷ 100
```

**Structure Decision**: The existing `front-end/` Vite starter is kept as the app shell (Vite, `index.html`,
`public/`); its demo files (`src/App.tsx`, `src/App.css`, `src/assets/*`) are replaced. Source is organized
by feature (`features/catalog`, `features/product`, `features/checkout`) with cross-cutting concerns under
`shared/` and wiring under `app/`. `src/config.ts` is the single seam for `import.meta.env` and is imported
everywhere as `@/config` through the `@` → `src` path alias (declared in `tsconfig.app.json`,
`tsconfig.spec.json` and `vite.config.ts` `resolve.alias`). In Jest, `moduleNameMapper` maps `^@/config$` to
`src/__mocks__/config.ts` and `^@/(.*)$` to `src/$1`; a regex anchored on `src/config$` would not work,
because with the alias in place the import specifier is `@/config` and inside `src/` every import is relative
(e.g. `src/shared/api/http.ts` imports `@/config`, never `../config`), so the mapping must match the alias
itself. This keeps `VITE_API_URL` out of feature code and trivially injectable in tests.

## Complexity Tracking

> No constitution violations; this section is intentionally empty.
