# Phase 0 Research: Front-end Store Pages

**Feature**: `003-front-end-store` | **Date**: 2026-10-11

All decisions below are constrained by docs/requirements.md §7, the constitution and the user-provided
technology stack. No open NEEDS CLARIFICATION remains.

## R1. Test tooling for a Vite + ESM app with ts-jest

- **Decision**: Jest is configured in `front-end/jest.config.cjs` with `preset: 'ts-jest'`, the
  `jsdom` environment and a dedicated test tsconfig (`front-end/tsconfig.spec.json`) that compiles the
  `*.ts(x)` test graph to CommonJS (`module: "commonjs"`, `moduleResolution: "node"`, and disables
  `verbatimModuleSyntax`/`allowImportingTsExtensions` for the transform). A JS config file with the `.cjs`
  extension is used because `package.json` sets `"type": "module"`. Peer compatibility of the test toolchain
  with the other packages is checked at install time (see R14).
- **Rationale**: Keeps Jest as the mandated runner (constitution III) with the user-requested `ts-jest`,
  while the app itself stays on Vite/ESM. Transforming to CommonJS avoids the `--experimental-vm-modules`
  fragility of ts-jest ESM mode and the `import.meta` limitation, which is neutralized by R7.
- **Alternatives considered**: `babel-jest`/`@swc/jest` (rejected: user asked for ts-jest); ts-jest ESM
  preset with `--experimental-vm-modules` (rejected: brittle with jsdom and `import.meta`); Vitest
  (rejected: constitution mandates Jest).

## R2. Tailwind CSS through its Vite plugin

- **Decision**: Use Tailwind CSS v4 via `@tailwindcss/vite`, added to `front-end/vite.config.ts` alongside
  `@vitejs/plugin-react`, with a single `@import "tailwindcss";` in the app stylesheet. Utility classes only;
  no component library.
- **Rationale**: Matches the user stack and the constitution (Tailwind CSS on the front-end). The Vite plugin
  removes the PostCSS/`tailwind.config.js` setup and is the current supported path for the starter.
- **Alternatives considered**: Tailwind v3 with PostCSS config (rejected: extra config, superseded); inline
  styles or a CSS-in-JS library (rejected: user forbids a component library and wants Tailwind).

## R3. State and persistence without redux-persist

- **Decision**: A single Redux Toolkit store (catalog, product, checkout slices) with a hand-written store
  subscriber in `front-end/src/features/checkout/persistence.ts`. On each store change it compares the
  whitelisted part with the last written value (shallow comparison) and writes only when it changed, storing a
  versioned, non-sensitive whitelist — `{ version, savedAt, currentStep, selectedProductId, quantity,
  delivery, transactionId }` — under one `localStorage` key. Every `localStorage` access is wrapped in
  `try/catch` so a storage failure (quota exceeded, storage disabled) never breaks the app. On startup the
  loader validates the shape against the schema and discards anything invalid or older than 24 hours; a
  persisted `selectedProductId` is validated against the API by fetching it while the gallery is shown, and a
  `notFound` discards all progress (see R11).
- **Rationale**: The user explicitly excludes `redux-persist` and asks for a "custom store subscriber writing
  a versioned whitelist with a timestamp". A whitelist object (not the whole state) guarantees no card field
  can leak even if the state later grows; the shallow comparison avoids needless writes on every action.
- **Alternatives considered**: `redux-persist` (rejected by the user and heavier); a middleware (equivalent
  but the subscriber is simpler and is what the user described); persisting the whole slice (rejected: risks
  leaking fields); writing on every action (rejected: pointless churn and a risk of persisting transient
  states).

## R4. Typed fetch wrapper

- **Decision**: `front-end/src/shared/api/http.ts` wraps `fetch` with an `AbortController` timeout and
  returns either the parsed JSON or a plain, serializable error object with a `kind` field: `network`
  (offline/timeout), `rateLimited` (HTTP 429), `server` (5xx/other) and `notFound` (404). These are plain
  objects, not `Error` instances, so they stay serializable in Redux (Redux Toolkit rejects non-serializable
  values). Each carries only a safe, user-facing `message`; the raw status/body is never surfaced. A `400`
  returned for a malformed product id on the product route is mapped to `notFound`. `createAsyncThunk` thunks
  reject with these values so slices can render explicit states and a retry action.
- **Rationale**: FR-004/FR-016 require loading/empty/error with retry and a friendly "too many requests"
  message without internal details. A narrow `kind` union keeps the UI honest, keeps the store serializable
  and is easy to test.
- **Alternatives considered**: Axios (rejected: new dependency, YAGNI); `Error` instances kept in the store
  (rejected: not serializable, trips Redux Toolkit's serializability check and devtools); a single generic
  error (rejected: cannot distinguish 429/404/network in the UI or tests).

## R5. When product data is re-read

- **Decision**: The gallery dispatches the catalog thunk (a) on mount and (b) on the `visibilitychange`
  event when the tab becomes visible, so the displayed stock reflects the latest value. The product-detail
  thunk is dispatched (a) when the product page mounts, (b) on the `visibilitychange` event when the tab
  becomes visible, and (c) right before the purchase choice is recorded. On each product re-read the fetched
  stock is reconciled: the quantity is clamped to `1..min(stock, 10)`; if stock becomes 0 the product is
  marked unavailable and the purchase is blocked. Every fetch carries a request id, and a response whose
  request id is no longer the latest is ignored, so moving quickly between products never renders a stale
  product.
- **Rationale**: Directly satisfies FR-005, FR-008 and FR-010 and the updated spec scenarios; the third
  trigger is the last chance to catch a stale stock before the choice is committed, and the request-id guard
  prevents out-of-order responses from overwriting the current page. Tests cover both the gallery re-read
  (mount and tab visible) and the stale-response guard.
- **Alternatives considered**: Polling on an interval (rejected: wasteful, not requested); relying only on
  mount (rejected: misses stock drop while the tab is hidden); a websocket (rejected: out of scope); dropping
  the request-id guard (rejected: fast navigation can render the wrong product).

## R6. Routing and static-hosting fallback

- **Decision**: React Router with browser history; routes are `/` (gallery), `/product/:id` (detail,
  validated against the product id) and `*` (not-found with a link back to `/`). The static host must serve
  `index.html` for unknown paths.
- **Rationale**: FR-017 requires per-page addresses, correct direct-open/reload and a not-found page. The
  fallback is the deployment note (serve `-s`, or an equivalent rewrite).
- **Alternatives considered**: Hash routing (rejected: would not exercise the addressable URLs the spec
  wants and looks less clean); MemoryRouter (rejected: no real URLs).

## R7. Environment seam and the `@` path alias (`import.meta.env` in one place)

- **Decision**: Exactly one file, `front-end/src/config.ts`, reads `import.meta.env.VITE_API_URL` and exports
  the resolved API base URL. A path alias `@` → `src` is declared in `front-end/tsconfig.app.json`
  (`paths: { "@/*": ["src/*"] }`), in `front-end/tsconfig.spec.json` (same paths) and in
  `front-end/vite.config.ts` (`resolve.alias`). Every module imports the configuration as `@/config`. In
  Jest, `moduleNameMapper` maps `^@/config$` to the test double `front-end/src/__mocks__/config.ts` and
  `^@/(.*)$` to `front-end/src/$1`. `VITE_API_URL` is a build-time variable; `front-end/.env.example`
  documents it with an empty value.
- **Rationale**: Keeps feature code free of `import.meta` (which does not exist under Jest's CommonJS
  transform) and makes the API base URL trivially injectable in tests. A regex anchored on `src/config$` does
  not work: with the alias in place the import specifier is `@/config`, and inside `src/` every import is
  relative (no module writes `.../src/config`), so the mapping must match the alias specifier (`^@/config$`),
  not the file path.
- **Alternatives considered**: Reading `import.meta.env` in each feature (rejected: leaks env coupling and
  breaks tests); a global `process.env` shim (rejected: hides the real Vite behavior); matching `src/config$`
  in `moduleNameMapper` (rejected: never matches the alias-resolved import specifier).

## R8. Images

- **Decision**: A shared `Image` component renders fixed `width`/`height`, `loading="lazy"` and
  `decoding="async"`, and swaps to the local asset `public/images/fallback.svg` (`onError`) when the source
  fails. Product images are the existing WebP files under `public/images/products/`.
- **Rationale**: FR-019 and constitution §UI/UX (WebP, explicit dimensions, lazy below the fold, fallback).
  A committed local fallback also works offline and in tests.
- **Alternatives considered**: A third-party image library (rejected: no dependency needed); CSS background
  images (rejected: no lazy/async/onError semantics); a remote placeholder URL (rejected: extra network
  dependency and not deterministic).

## R9. Money formatting

- **Decision**: `front-end/src/shared/format/money.ts` exposes a formatter built on
  `new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` that
  receives cents and formats `cents / 100`.
- **Rationale**: FR-002 and SC-001 (peso price equal to stored amount ÷ 100) with locale-correct grouping.
- **Alternatives considered**: Manual string concatenation (rejected: no locale correctness); `toLocaleString`
  inline (rejected: duplicated options and harder to test).

## R10. Quantity bound and the ten-unit limit

- **Decision**: The quantity is an integer bounded by 1 and `min(availableStock, 10)`. The limit constant is
  `MAX_QUANTITY_PER_PURCHASE = 10` and is documented as mirroring the back-end rule (assumption in the spec).
- **Rationale**: FR-007/FR-008 and the spec assumption that the cap must be kept in sync with the back-end.
- **Alternatives considered**: Reading the cap from the API (rejected: no such field today); hard-coding 10
  in components (rejected: should be one named constant to keep in sync).

## R11. Persistence lifecycle

- **Decision**: Persisted progress is written on relevant changes only (shallow comparison of the whitelisted
  part; see R3) and cleared when the purchase reaches its final step and the shopper leaves it, when the
  shopper chooses to start over (an explicit reset action) and when the stored `savedAt` is older than 24
  hours. Every `localStorage` access is wrapped in `try/catch` so a failure never breaks the app. Loading
  validates the schema, the version and the age, then validates a persisted `selectedProductId` against the
  API: the gallery is shown while the product is fetched, and a `notFound` discards all progress. Anything
  invalid discards the document and starts from the gallery. Delivery data is personal and is removed with the
  rest of the progress at the end of the purchase.
- **Rationale**: FR-012/FR-014/FR-021 and the updated spec scenarios on lifecycle and personal data.
- **Alternatives considered**: Never expiring (rejected: leaves personal delivery data indefinitely); a TTL
  per field (rejected: over-complex; one document TTL is enough); trusting a persisted product id without an
  API check (rejected: FR-014 requires discarding progress that references a missing product).

## R12. Accessibility

- **Decision**: Semantic landmarks (`header`/`main`/`nav`/`footer`), a labeled quantity selector operable by
  keyboard (buttons plus a labeled numeric input), a visible focus ring, and `alt` text on every product
  image. Stock-change and error messages are announced through a live region — a polite `status` for stock
  adjustments and an assertive `alert` for errors. After each route change, focus moves to the page heading so
  keyboard and screen-reader users land on the new page content. Interactive controls are real buttons/links.
- **Rationale**: FR-020 and SC-007 (keyboard-only operation with visible focus); live regions make the dynamic
  stock and error states perceivable, and focus management keeps route changes announced.
- **Alternatives considered**: Div-based custom controls (rejected: not keyboard/focus friendly); skipping
  labels or live regions (rejected: fails the requirement); leaving focus on `<body>` after navigation
  (rejected: disorients keyboard and screen-reader users).

## R13. Deployment note (no infrastructure changes)

- **Decision**: The built SPA is served statically with an `index.html` fallback (for example
  `serve -s dist`); `VITE_API_URL` is injected at build time. No Docker/IaC changes are made in this feature
  (deployment is a later feature per the roadmap).
- **Rationale**: The user asks for a deployment note only; FR-017 needs the history fallback to work.
- **Alternatives considered**: Adding a Dockerfile (rejected: out of scope for this feature).

## R14. Dependency peer compatibility at install time

- **Decision**: Before installing, verify that `ts-jest`, `jest`, `jest-environment-jsdom`,
  `@tailwindcss/vite`, `@testing-library/react` and the starter TypeScript version are peer-compatible. If a
  pairing is incompatible, pin the offending package to a supported version (exact version) rather than
  widening the range. `--force` and `--legacy-peer-deps` are never used.
- **Rationale**: The starter sits on a very recent TypeScript/Vite line, so an install-time check keeps the
  lockfile honest and reproducible instead of masking conflicts.
- **Alternatives considered**: `--force` / `--legacy-peer-deps` (rejected: hide real incompatibilities and can
  produce a non-reproducible install); ignoring peer warnings (rejected: risks a broken build or test run).
