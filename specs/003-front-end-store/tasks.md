# Tasks: Front-end Store Pages

**Input**: Design documents from `/specs/003-front-end-store/` (plan.md, spec.md, research.md, data-model.md, contracts/*, quickstart.md)

**Branch**: `003-front-end-store`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: [US1] catalog/gallery · [US2] product detail/purchase · [US3] refresh recovery · absent = shared/wiring
- Include exact file paths in descriptions
- **Path convention**: all paths below are relative to `front-end/` (the feature is the front-end app; there is a `back-end/` sibling in the monorepo that is NOT touched)

## Execution contract

Every task must end with **lint, type-check/build and tests green and the app runnable**:

```bash
cd front-end
npm run lint && npm run build && npm test && npm run dev   # dev boots at http://localhost:5173
```

Test-first tasks follow **red → green**: write the failing test first, watch it fail, implement, then leave it green. Each task is one behavior plus its test. Never use `--force` or `--legacy-peer-deps` when installing (research R14). No deployment/Docker/IaC changes are part of this feature.

---

## Phase 1: Tooling & Project Setup

**Purpose**: Dependencies, Tailwind, the `@` alias, the config seam (`src/config.ts` + Jest test double), Jest/ts-jest/jsdom with the 80 % coverage gate, a trivial green test, and the removal of the Vite starter demo files — keeping the app runnable at every step.

- [X] T001 Add the feature dependencies to `front-end/package.json`: runtime `@reduxjs/toolkit`, `react-redux`, `react-router-dom`; dev `tailwindcss`, `@tailwindcss/vite`, `jest`, `ts-jest`, `@types/jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`. Verify peer compatibility of `ts-jest`, `jest`, `jest-environment-jsdom`, `@tailwindcss/vite`, `@testing-library/react` and the starter TypeScript version at install time (research R14); pin any offending package to a supported version; never `--force`/`--legacy-peer-deps`. Files: `front-end/package.json`, `front-end/package-lock.json`. Create `front-end/tsconfig.spec.json` (CommonJS `module`, `moduleResolution: "node"`, `react-jsx`, `esModuleInterop`, `types: ["jest","node","@testing-library/jest-dom"]`, `verbatimModuleSyntax` off, paths alias). Exclude `src/**/*.spec.ts`, `src/**/*.spec.tsx`, `src/__mocks__`, `src/__tests__` from `front-end/tsconfig.app.json` so `npm run build` never type-checks tests. Configure ESLint for spec files to include Jest globals. Adjust `jest.config.cjs` `collectCoverageFrom` to exclude `src/**/*.spec.ts`, `src/**/*.spec.tsx`, `src/__mocks__`, `src/__tests__`, `src/**/*.d.ts`, `src/main.tsx`, `src/config.ts`; remove `passWithNoTests`.
- [X] T002 [P] Configure Tailwind CSS v4 through its Vite plugin: add `@tailwindcss/vite` to `front-end/vite.config.ts` plugins and replace `front-end/src/index.css` with a single `@import "tailwindcss";`. Files: `front-end/vite.config.ts`, `front-end/src/index.css`
- [X] T003 [P] Add the `@` → `src` path alias: `resolve.alias { '@': resolve(__dirname, 'src') }` in `front-end/vite.config.ts`; `paths: { "@/*": ["src/*"] }` in `front-end/tsconfig.app.json` and `front-end/tsconfig.spec.json`. The alias must make `@/config` resolve to `front-end/src/config.ts`. Files: `front-end/vite.config.ts`, `front-end/tsconfig.app.json`, `front-end/tsconfig.spec.json`
- [X] T004 Create `front-end/src/config.ts` as the ONLY module reading `import.meta.env`. Exports the `VITE_API_URL` base URL: in development (`import.meta.env.DEV`) fall back to `http://localhost:3000` if missing; in production build, if missing, the app should surface an in-app error state (not a blank page) — implement the logic in config/module used by the app. Create the Jest test double `front-end/src/__mocks__/config.ts` exporting a fixed test base URL (e.g. `https://api.test`). Files: `front-end/src/config.ts`, `front-end/src/__mocks__/config.ts`
- [X] T005 Create `front-end/jest.config.cjs` (preset `ts-jest`, `jest-environment-jsdom`, `testEnvironmentOptions: { url: 'http://localhost/' }`) and `front-end/jest.setup.ts` (`@testing-library/jest-dom`). `moduleNameMapper` must map `^@/config$` → `<rootDir>/src/__mocks__/config.ts`, `^@/(.*)$` → `<rootDir>/src/$1`, plus asset/CSS mocks. Set `collectCoverageFrom` to include `src/**/*.{ts,tsx}` excluding `src/main.tsx` and `src/config.ts`; `coverageThreshold.global.lines/branches/functions/statements = 80`; `testEnvironment: 'jsdom'`; `passWithNoTests: true`. Add `"test": "jest"`, `"test:cov": "jest --coverage"` scripts to `front-end/package.json`. Files: `front-end/jest.config.cjs`, `front-end/jest.setup.ts`, `front-end/package.json`
- [X] T006 Add a trivial passing spec that proves the alias and the config double are wired: `front-end/src/__tests__/alias.spec.ts` imports `@/config` and expects the fixed test base URL, and imports a tiny local module created in this task (not `@/shared/format/money`). The assertion about `@/shared/format/money` is moved to T008. Files: `front-end/src/__tests__/alias.spec.ts`
- [X] T007 Remove the Vite starter demo files (`front-end/src/App.tsx`, `front-end/src/App.css`, `front-end/src/assets/*`) and rewrite `front-end/src/main.tsx` plus `front-end/index.html` (`<title>`) into a minimal, runnable entry that renders a Tailwind placeholder (no routes yet). The app must still `npm run build` and boot. Files: `front-end/src/main.tsx`, `front-end/index.html`, delete `front-end/src/App.tsx`, `front-end/src/App.css`, `front-end/src/assets/`

**Checkpoint**: lint + build + tests green; `npm run dev` renders the placeholder.

---

## Phase 2: Shared Pieces (test-first)

**Purpose**: Language, money, typed errors, the fetch wrapper, and the reusable UI atoms. Everything here is standalone and parallelizable after Phase 1.

- [X] T008 [P] Money formatter: write failing spec `front-end/src/shared/format/money.spec.ts`, then implement `front-end/src/shared/format/money.ts`: a formatter built on `new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` that formats `cents / 100` (FR-002; e.g. `priceInCents: 1500000` → `$1.500.000`, no decimals). Files: `front-end/src/shared/format/money.ts`, `front-end/src/shared/format/money.spec.ts`
- [X] T009 [P] Typed errors: write failing spec `front-end/src/shared/api/api.errors.spec.ts`, then implement `front-end/src/shared/api/api.errors.ts` as plain serializable objects (never `Error` instances) with a `kind` field restricted to `network | rateLimited | server | notFound`, each exposing only a safe user-facing `message`. The spec asserts `kind` values, plain-object identity (`Object.getPrototypeOf === Object.prototype`), and that picking a bad `kind` is rejected at compile time. Files: `front-end/src/shared/api/api.errors.ts`, `front-end/src/shared/api/api.errors.spec.ts`
- [X] T010 Implement the fetch wrapper test-first: `front-end/src/shared/api/http.spec.ts` (mock `fetch`) then `front-end/src/shared/api/http.ts` — an `AbortController` timeout; returns parsed JSON on `2xx`; maps HTTP `404` → `notFound`, `429` → `rateLimited`, `5xx`/other → `server`, offline/timeout → `network`; maps a `400` answer for a malformed product id to `notFound` on the product route; never surfaces the raw status/body/message (contracts/rest-api-consumed.md). Files: `front-end/src/shared/api/http.ts`, `front-end/src/shared/api/http.spec.ts` (depends on T009)
- [X] T011 [P] Image with fallback: write failing spec `front-end/src/shared/ui/Image.spec.tsx`, then implement `front-end/src/shared/ui/Image.tsx` — fixed `width`/`height` attributes plus responsive classes (`className="w-full h-auto"`) to keep responsive while preventing horizontal overflow at 375px, `loading="lazy"`, `decoding="async"`, `alt` passthrough, and `onError` swapping the source to the local asset `public/images/fallback.svg` (research R8). Also create `front-end/public/images/fallback.svg` (a small neutral SVG). Files: `front-end/src/shared/ui/Image.tsx`, `front-end/src/shared/ui/Image.spec.tsx`, `front-end/public/images/fallback.svg`
- [X] T012 [P] Spinner: implement `front-end/src/shared/ui/Spinner.tsx` (grayscale wait indicator with an accessible `role="status"`/label) with spec `front-end/src/shared/ui/Spinner.spec.tsx`. Files: `front-end/src/shared/ui/Spinner.tsx`, `front-end/src/shared/ui/Spinner.spec.tsx`
- [X] T013 [P] Empty state: implement `front-end/src/shared/ui/EmptyState.tsx` (friendly empty-catalog message) with spec `front-end/src/shared/ui/EmptyState.spec.tsx`. Files: `front-end/src/shared/ui/EmptyState.tsx`, `front-end/src/shared/ui/EmptyState.spec.tsx`
- [X] T014 [P] Error state with retry: implement `front-end/src/shared/ui/ErrorState.tsx` (safe message + a retry button/link invoking an injected `onRetry`) with spec `front-end/src/shared/ui/ErrorState.spec.tsx`. Files: `front-end/src/shared/ui/ErrorState.tsx`, `front-end/src/shared/ui/ErrorState.spec.tsx`

**Checkpoint**: each atom is unit-tested; lint/build/test green.

---

## Phase 3: Store & Slices (test-first)

**Purpose**: The Redux Toolkit store and the catalog, product and checkout slices, including the persistence subscriber slot (wired in Phase 4). Errors persisted in the store are the plain `kind` objects from T009.

- [X] T015 [P] [US1] Catalog slice test-first: spec `front-end/src/features/catalog/catalog.slice.spec.ts` with mocked `fetch` (via the T010 wrapper) asserting `status: 'idle' | 'loading' | 'success' | 'error'` transitions, `items` from `GET /products`, an empty list producing `success` with `[]`, and `error` carrying a `{ kind, message }` object; then implement `front-end/src/features/catalog/catalog.slice.ts` (state per data-model: `items`, `status`, `error | null`, `requestId | null`, `lastReadAt | null`). Files: `front-end/src/features/catalog/catalog.slice.ts`, `front-end/src/features/catalog/catalog.slice.spec.ts`
- [X] T016 [P] [US2] Product slice test-first: spec `front-end/src/features/product/product.slice.spec.ts` asserting the `fetchProduct` thunk lifecycle and that the `quantity` reducer keeps the quantity "between 1 and the smaller of the available stock and ten units" (data-model validation; clamp when `min(stock, 10)` shrinks); then implement `front-end/src/features/product/product.slice.ts` (state: `product`, `status`, `error`, `quantity`, `requestId`, `lastReadAt`). Files: `front-end/src/features/product/product.slice.ts`, `front-end/src/features/product/product.slice.spec.ts`
- [X] T017 [P] [US3] Checkout slice test-first: spec `front-end/src/features/checkout/checkout.slice.spec.ts` then implement `front-end/src/features/checkout/checkout.slice.ts` with exactly `currentStep` (`product | cardAndDelivery | summary | finalStatus`), `selectedProductId`, `quantity`, `delivery`, `transactionId` (data-model) — there is deliberately **no card field**; actions: record the purchase choice (step, selected product id, quantity) and start over (clear). The spec asserts the state has no card-like keys. Files: `front-end/src/features/checkout/checkout.slice.ts`, `front-end/src/features/checkout/checkout.slice.spec.ts`
- [X] T018 Wire the store: implement `front-end/src/app/store.ts` (`configureStore` with the three slices and `getDefaultMiddleware` — the slices hold only plain serializable values) and typed hooks `front-end/src/app/hooks.ts` (`useAppDispatch`, `useAppSelector`); add `front-end/src/app/store.spec.ts` asserting the combined reducer shape and that `getState()` is JSON-serializable. Files: `front-end/src/app/store.ts`, `front-end/src/app/hooks.ts`, `front-end/src/app/store.spec.ts` (depends on T015–T017)

**Checkpoint**: slices and store unit-tested; lint/build/test green.

---

## Phase 4: Persistence (test-first) — refresh recovery (US3)

**Purpose**: The custom store subscriber writing the versioned non-sensitive whitelist to `localStorage`, the loader with schema/version/24-hour validation, the no-card-keys invariant, and startup validation of the selected product against the API. Never `redux-persist`.

- [X] T019 [US3] Persistence write path test-first: spec `front-end/src/features/checkout/persistence.spec.ts` (jsdom `localStorage`) then implement `front-end/src/features/checkout/persistence.ts` as pure storage. The loader reads synchronously to produce preloaded checkout state (schema, version, 24h age). The subscriber is initialized with that validated document as its last written value so it never overwrites stored progress with an empty state. The subscriber shallow-compares the whitelisted part and writes `{ version, savedAt, currentStep, selectedProductId, quantity, delivery, transactionId }` under `checkout-progress` only when it changed; every `localStorage` access wrapped in `try/catch`. Write tests: no write on startup, no overwrite while validation is pending (conceptually), and no write for unchanged whitelist. Files: `front-end/src/features/checkout/persistence.ts`, `front-end/src/features/checkout/persistence.spec.ts` (depends on T017)
- [X] T020 [US3] Add the **no-card-like-keys invariant test** to `front-end/src/features/checkout/persistence.spec.ts`: after a write, the serialized document must contain no key matching `card`, `cardNumber`, `cvc`, `cvv`, `pan`, `expiry`, `expiration`, `securityCode` (case-insensitive). This test must fail if any card field is ever introduced. Files: `front-end/src/features/checkout/persistence.spec.ts`
- [X] T021 [US3] Loader validation test-first: extend `front-end/src/features/checkout/persistence.ts` with a `loadPersistedProgress` (sync) that discards when not valid JSON, wrong `version`, missing/invalid fields, older than 24 hours, or when a started purchase lacks both `selectedProductId` present and `quantity` an integer between 1 and 10. A document violating that is invalid. The loader returns the validated preloaded state and the subscriber must be initialized with it so no write overwrites stored progress with empty on startup. Add tests to `front-end/src/features/checkout/persistence.spec.ts`. Files: `front-end/src/features/checkout/persistence.ts`, `front-end/src/features/checkout/persistence.spec.ts` (depends on T019)
- [X] T022 [US3] Create `front-end/src/features/checkout/checkout.thunks.ts` with `restoreProgress` thunk: validates a persisted `selectedProductId` against the API via `GET /products/:id` (T010). On `notFound` it discards all progress. On `429`, `network`, or `server` errors it keeps the restored progress and validation is retried when the product page opens. Add tests: happy path, notFound (discards), transient errors keep progress and do not trigger premature writes. Files: `front-end/src/features/checkout/checkout.thunks.ts`, `front-end/src/features/checkout/checkout.thunks.spec.ts` (depends on T010, T021)
- [X] T023 [US3] Wire persistence into the store: register the subscriber in `front-end/src/app/store.ts` initialized from the synchronously loaded preloaded state; wire `restoreProgress` thunk into startup validation. Dispatch clears when the shopper chooses to start over (FR-021), and dispatch `purchaseCompleted` to clear progress (unit tested, wired when final status screen exists). The next-step placeholder includes a visible "Start over" control. Add `front-end/src/app/store.spec.ts` cases: no write on startup, no overwrite while validation is pending, no write for unchanged whitelist, load restores progress, corrupt/expired/stale product discards on load, transient errors keep progress. Files: `front-end/src/app/store.ts`, `front-end/src/app/store.spec.ts`, `front-end/src/features/checkout/checkout.thunks.ts` (integration)

**Checkpoint**: refresh recovery logic fully unit-tested; lint/build/test green.

---

## Phase 5: Pages & Routes (Testing Library)

**Purpose**: Gallery (home) and product detail pages + routing with the not-found page, wired into the store, with reactive re-reads and accessibility as separate later phases.

- [ ] T024 [P] [US1] ProductCard test-first: spec `front-end/src/features/catalog/ProductCard.spec.tsx` then implement `front-end/src/features/catalog/ProductCard.tsx` — image (`Image` from T011) with fixed width/height and responsive classes, name, price via `money` (T008), units available. In-stock cards are real links (anchor elements) so keyboard and screen readers work; out-of-stock cards are not links, use `aria-disabled`, and show a visible "Out of stock" label. Clicking in-stock navigates to `/product/:id`. Files: `front-end/src/features/catalog/ProductCard.tsx`, `front-end/src/features/catalog/ProductCard.spec.tsx`
- [ ] T025 [US1] CatalogPage + selectors test-first: spec `front-end/src/features/catalog/CatalogPage.spec.tsx` rendering with Testing Library — lists every product, loading state, empty state (T013), error state with retry (T014); then implement `front-end/src/features/catalog/CatalogPage.tsx` (dispatch the catalog thunk on mount) and `front-end/src/features/catalog/catalog.selectors.ts`. Files: `front-end/src/features/catalog/CatalogPage.tsx`, `front-end/src/features/catalog/catalog.selectors.ts`, `front-end/src/features/catalog/CatalogPage.spec.tsx` (depends on T015, T024)
- [ ] T026 [P] [US2] QuantitySelector test-first: spec `front-end/src/features/product/QuantitySelector.spec.tsx` (keyboard-operable step buttons plus a labeled numeric input) then implement `front-end/src/features/product/QuantitySelector.tsx` keeping the value "between 1 and the smaller of the available stock and ten units" (FR-007). Files: `front-end/src/features/product/QuantitySelector.tsx`, `front-end/src/features/product/QuantitySelector.spec.tsx`
- [ ] T027 [US2] ProductPage test-first: spec `front-end/src/features/product/ProductPage.spec.tsx` then implement `front-end/src/features/product/ProductPage.tsx` + `product.selectors.ts` — renders image, name, description, price, stock (FR-006), the selector, and a "start purchase" button that records product + quantity in the checkout slice and shows a clear "next step" placeholder (FR-009); when stock is 0 the purchase is blocked (FR-010). Files: `front-end/src/features/product/ProductPage.tsx`, `front-end/src/features/product/product.selectors.ts`, `front-end/src/features/product/ProductPage.spec.tsx` (depends on T016, T017, T026)
- [ ] T028 [US2] Router + bootstrap: implement `front-end/src/app/providers.tsx` (Provider + router) and `front-end/src/app/router.tsx` exporting routes as a plain route array (for tests to use MemoryRouter) plus a BrowserRouter-wrapped component for the app; routes `/` → CatalogPage, `/product/:id` → ProductPage, `*` → not-found page with a link back to the gallery (FR-017); update `front-end/src/main.tsx` to use the BrowserRouter component. Add `front-end/src/app/router.spec.tsx` (Testing Library + MemoryRouter) proving each address renders its page, an unknown address renders the not-found page, and reloading/directly opening `/product/:id` shows the product page (SC-008). Files: `front-end/src/app/router.tsx`, `front-end/src/app/providers.tsx`, `front-end/src/app/router.spec.tsx`, `front-end/src/main.tsx` (depends on T025, T027, T018)

**Checkpoint**: gallery and product pages fully navigable and unit-tested; app runnable and green.

---

## Phase 6: Re-read Triggers & Stale Response Handling

**Purpose**: Data is re-read on mount and tab visibility (gallery and product), and right before the purchase choice is recorded (product); out-of-order responses are ignored via request id.

- [ ] T029 [P] [US2] Product re-read triggers test-first: implement `front-end/src/features/product/useProductReRead.ts` — dispatches the product thunk on page mount, on the `visibilitychange` event when the tab becomes visible, and immediately before the purchase choice is recorded; on each re-read, if stock dropped below the quantity the shopper is informed and the quantity is clamped, and if stock is 0 the purchase is blocked (FR-008, FR-010). Add spec `front-end/src/features/product/useProductReRead.spec.tsx` simulating tab visibility. Files: `front-end/src/features/product/useProductReRead.ts`, `front-end/src/features/product/useProductReRead.spec.tsx` (depends on T016, T027)
- [ ] T030 [US2] Stale-response guard test-first: extend `front-end/src/features/product/product.slice.ts` so each fetch carries a `requestId` and a response whose `requestId` is no longer the latest is ignored (data-model stale-response guard); add failing tests in `front-end/src/features/product/product.slice.spec.ts` simulating two overlapping fetches returning out of order. Files: `front-end/src/features/product/product.slice.ts`, `front-end/src/features/product/product.slice.spec.ts` (depends on T016, T029)
- [ ] T031 [US1] Gallery re-read test-first: extend the catalog flow so `GET /products` is re-read on gallery mount and on `visibilitychange` → visible (FR-005), ignoring stale responses by request id; add tests to `front-end/src/features/catalog/catalog.slice.spec.ts` and `front-end/src/features/catalog/CatalogPage.spec.tsx`. Files: `front-end/src/features/catalog/catalog.slice.ts`, `front-end/src/features/catalog/catalog.slice.spec.ts`, `front-end/src/features/catalog/CatalogPage.tsx`, `front-end/src/features/catalog/CatalogPage.spec.tsx`

**Checkpoint**: re-read and stale-guard covered by tests; lint/build/test green.

---

## Phase 7: Accessibility (cross-cutting)

**Purpose**: Live regions for stock changes and errors, focus management on route changes, and a final a11y verification pass.

- [ ] T032 [P] LiveRegion component: implement `front-end/src/shared/ui/LiveRegion.tsx` (a live region with `aria-live` — polite `status` for stock adjustments, assertive `alert` for errors) with spec `front-end/src/shared/ui/LiveRegion.spec.tsx`; then wire stock-change and error messages through it in `front-end/src/features/catalog/CatalogPage.tsx` and `front-end/src/features/product/ProductPage.tsx` (research R12). Files: `front-end/src/shared/ui/LiveRegion.tsx`, `front-end/src/shared/ui/LiveRegion.spec.tsx`, `front-end/src/features/catalog/CatalogPage.tsx`, `front-end/src/features/product/ProductPage.tsx`
- [ ] T033 Focus-to-heading on route change test-first: implement a focus manager (e.g. in `front-end/src/app/router.tsx` or a small `front-end/src/app/ScrollAndFocusManager.tsx`) that moves focus to each page's `<h1>` after a route change, with `tabIndex={-1}`; add a Testing Library spec proving focus lands on the heading after navigation (contracts/routes.md). Files: `front-end/src/app/router.tsx`, `front-end/src/app/ScrollAndFocusManager.tsx`, `front-end/src/app/router.spec.tsx`
- [ ] T034 Accessibility verification pass: audit `front-end/src/features/**` for semantic landmarks (`header`/`main`/`nav`/`footer`), visible focus, labels on the quantity selector, and `alt` text on every product image (FR-020, SC-007); fix and add missing assertions to the page specs in `front-end/src/features/catalog/*.spec.tsx` and `front-end/src/features/product/*.spec.tsx`. Files: `front-end/src/features/catalog/**`, `front-end/src/features/product/**`

**Checkpoint**: a11y behaviors tested; lint/build/test green.

---

## Phase 8: Polish & Cross-Cutting Verification

**Purpose**: The "no direct `fetch`/`import.meta`" guard, `.env.example`, the front-end README, and the final coverage gate.

- [ ] T035 Enforce the dependency/layering rule: extend `front-end/eslint.config.js` so `import.meta` is only allowed in `front-end/src/config.ts` and `fetch` is only allowed in `front-end/src/shared/api/http.ts`; exempt spec files (`src/**/*.spec.ts`, `src/**/*.spec.tsx`, `src/__mocks__/**`, `src/__tests__/**`) from the `fetch` restriction (restrictions via `no-restricted-syntax`/overrides). Add a spec that verifies the restriction (e.g. run ESLint over a fixture or assert the config targets the intended files); confirm `npm run lint` is green and that no non-spec component imports `fetch` or `import.meta` directly. Files: `front-end/eslint.config.js`, `front-end/src/**`
- [ ] T036 Create `front-end/.env.example` documenting `VITE_API_URL=` empty (build-time variable, read only in `src/config.ts`) with an explanatory comment; values stay empty (constitution V). Files: `front-end/.env.example`
- [ ] T037 [P] Update `front-end/README.md`: feature overview, tech stack, scripts (`dev`, `build`, `lint`, `test`, `test:cov`), the `@` alias and the `src/config.ts` seam, the persistence contract (link `../specs/003-front-end-store/contracts/persistence.md`), and the requirement that card data never enters state or storage; do not add deployment details. Files: `front-end/README.md`
- [X] T039 Create `front-end/src/shared/constants.ts` exporting `MAX_QUANTITY_PER_PURCHASE = 10`. Files: `front-end/src/shared/constants.ts`
- [X] T040 Create `front-end/src/features/checkout/checkout.selectors.ts` with selectors derived from checkout slice. Files: `front-end/src/features/checkout/checkout.selectors.ts` (depends on T017)
- [X] T041 Add `purchaseCompleted` action to `front-end/src/features/checkout/checkout.slice.ts` that clears progress (unit tested). Add a visible "Start over" control on the next-step placeholder in `front-end/src/features/product/ProductPage.tsx` that dispatches start over; also wire clearing behavior in store tests. Files: `front-end/src/features/checkout/checkout.slice.ts`, `front-end/src/features/product/ProductPage.tsx` (depends on T017, T027)
- [ ] T042 [US3] URL precedence test: when persisted selection is product A, opening `/product/B` must not prefill A's quantity or show next-step notice; starting a purchase on B replaces stored selection. Add tests to `front-end/src/features/product/ProductPage.spec.tsx` and `front-end/src/app/router.spec.tsx`. Files: `front-end/src/features/product/ProductPage.spec.tsx`, `front-end/src/app/router.spec.tsx` (depends on T027, T028)

- [ ] T038 Final gate: run `cd front-end && npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run test:cov` — coverage must meet the global 80 % threshold (SC-006, constitution III); re-run the manual checks in `specs/003-front-end-store/quickstart.md` (gallery, product, reload, not-found, refresh recovery, re-read, stale guard, responsive, accessibility); confirm no provider company name and no secrets are present. Files: whole feature

**Checkpoint**: coverage ≥ 80 %, quickstart checks pass, everything green.

---

## User Story Mapping & Independent Tests

| Story | Tasks | Independent test |
|-------|-------|------------------|
| US1 – Browse catalog (P1, MVP) | T015, T024, T025, T031 | Open the app; every product from `GET /products` renders with image, es-CO peso price and units; out-of-stock products are marked and unselectable; loading/empty/error-with-retry are reachable. |
| US2 – Open product, quantity, start purchase (P2) | T016, T026, T027, T028, T029, T030 | Open `/product/:id`; details render from the API; quantity stays within 1..min(stock,10) with the keyboard; the purchase button records the choice and shows the "next step" placeholder; a 0-stock or removed product blocks the purchase. |
| US3 – Resume progress after refresh (P3) | T017, T019, T020, T021, T022, T023 | Select + purchase, refresh; step/product/quantity restore; a persisted product the API no longer returns is discarded on load; the serialized document never contains card-like keys; expired (>24 h) or corrupt data is discarded. |

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Tooling)**: no dependencies; tasks T002/T003/T004 run in parallel after T001
- **Phase 2 (Shared)**: depends on T005+T006+T007 (Jest + green baseline)
- **Phase 3 (Store)**: depends on Phase 2 (T010 for thunks, T008 for money use in selectors)
- **Phase 4 (Persistence)**: depends on T017 (checkout slice) and T018 (store)
- **Phase 5 (Pages)**: depends on Phase 2 (atoms), T015/T016/T017 (slices), T024/T026
- **Phase 6 (Re-reads)**: depends on T016/T027 (product) and T015/T025 (catalog)
- **Phase 7 (A11y)**: depends on Phase 5, local to pages
- **Phase 8 (Polish)**: depends on all functional phases

### User Story Dependencies

- **US1**: Phase 1 → Phase 2 → T015, T024, T025 → T031. Independent of US2/US3.
- **US2**: Phase 1 → Phase 2 → T016, T026, T027, T028, then T029/T030. Needs US1 only for the gallery link (T024), not technically.
- **US3**: Phase 1 → Phase 2 → T017, T018, then T019–T023. Uses US2's product route for restore, but the logic is independently testable.

### Within Each Phase

- Test-first tasks: write the failing test first (red), implement, then leave green.
- Slices before store; store before persistence wiring; atoms before pages; pages before re-reads/a11y.

## Parallel Opportunities

- **Phase 1**: T002, T003, T004 in parallel after T001
- **Phase 2**: T008, T009, T011, T012, T013, T014 in parallel (T010 needs T009)
- **Phase 3**: T015, T016, T017 in parallel (T018 needs all three)
- **Phase 5**: T024 and T026 in parallel (T025 needs T024; T027 needs T026)
- **Across stories**: US1 page work (T025) and US2 page work (T027) are independent teams' work once Phase 1–3 are done

## Parallel Example: Shared pieces (Phase 2)

```bash
# Launch together after Phase 1:
Task: "Money formatter test-first in front-end/src/shared/format/money.ts"
Task: "Typed errors test-first in front-end/src/shared/api/api.errors.ts"
Task: "Image with fallback test-first in front-end/src/shared/ui/Image.tsx"
Task: "Spinner/EmptyState/ErrorState in front-end/src/shared/ui"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (tooling) → Phase 2 (shared) → T015, T018 (catalog slice + store)
2. T024, T025 (ProductCard + CatalogPage) with the shared atoms
3. **STOP and VALIDATE**: browse the gallery against `GET /products`, all four states reachable, tests/cov green — this is the MVP.
4. Continue with US2 (product detail) then US3 (persistence).

### Incremental Delivery

1. Tooling (runnable placeholder)
2. Shared atoms (each tested)
3. Slices + store (tested)
4. Persistence + refresh recovery (tested, incl. no-card-keys invariant)
5. Gallery (MVP) → Product detail → Routes/not-found
6. Re-reads + stale guard → Accessibility → README + `.env.example`
7. Every added increment leaves `npm run lint && npm run build && npm test` green and the app runnable.

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks within the same phase.
- [Story] label maps the task to a user story for traceability; absent label = shared/wiring.
- Commit after each task or logical group (Conventional Commits, small and frequent).
- Stop at any checkpoint to validate independently; the quickstart (Phase 8, T038) is the final manual gate.