# Implementation Plan: Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery

**Branch**: `005-finalize-checkout` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-finalize-checkout/spec.md`

## Summary

Close the purchase loop in the existing `front-end/` SPA (features 003/004 already erected the store, the
card-and-delivery modal and the payment thunks). From the checkout backdrop (the `<dialog>`-based
`CheckoutModal`), the shopper presses **Continuar**: the app calls `createTransaction` with an
`Idempotency-Key` header and renders the summary step with the product, quantity and the full server-computed
amount breakdown (product amount, base fee, delivery fee, total) **verbatim** — zero client-side
recomputation. **Pagar** is disabled while any request is in-flight, sends `payTransaction` with the
single-use card token, the chosen installments and `acceptedContracts`, accepts 200/202, then polls
`GET /transactions/:id` every 2 s for up to 40 s until a final status. Each failure mode (409, 422, 429,
503/unreachable, polling timeout) maps to its own explicit error state with a retry/back path and always
releases the in-flight lock. The final status screen gains the terminal **Finalizar** action, which clears
the persisted recovery document and all local checkout state, returns to the product page and refetches
stock from the server. Refresh recovery is hardened to the spec's rules: one whitelist-persisted,
**version 2** document (`transactionId` + `idempotencyKey` + journey step, cardinality and shape per
`specs/003-front-end-store/contracts/persistence.md`); on reload the app asks the server
`GET /transactions/:id` for the real status before resuming; `PENDING` resumes polling under a fresh 2 s/40 s window measured from the resume; `404` discards the document; a version ≠ 2 discards it; a reload at the summary step
lands the shopper back on card entry (the summary is never restored directly). Most plumbing exists from
feature 004 (idempotency seam, polling hook, transaction view, persistence v2); this feature adds the
Finalizar flow and the recovery termination rules, locks behavior against the spec with evidence-backed
Jest tests, and re-verifies the already-merged fixes (`fix/summary-blank-screen`, guarded transaction
enrichment). The back-end is reused unchanged.

## Technical Context

**Language/Version**: TypeScript 6.x, React 19, Vite 8 (existing `front-end/` app, `@vitejs/plugin-react`).
Back-end unchanged (NestJS + TypeScript from features 001/002).

**Primary Dependencies**: Existing `react`/`react-dom` 19, `@reduxjs/toolkit` 2 + `react-redux` 9 (Flux:
`product` and `checkout` slices + thunks), `react-router-dom` 7, `tailwindcss` 4. **No new runtime
dependency**: polling is a `setInterval` hook, the idempotency key is generated in
`features/checkout/idempotency.ts`, the backdrop is the native `<dialog>` element with
`backdrop:bg-black/40`. No `redux-persist` — persistence is a hand-written store subscriber
(`features/checkout/persistence.ts`).

**Storage**: Browser `localStorage`, a single versioned document under `checkout-progress` at
`PERSISTENCE_VERSION = 2` (whitelist per `specs/003-front-end-store/contracts/persistence.md`:
`version`, `savedAt`, `currentStep`, `selectedProductId`, `quantity`, `delivery`, `transactionId`,
`idempotencyKey`; discard on version mismatch, staleness > 24 h or invalid shape). The recovery document
for this feature reuses that exact contract — transaction id + idempotency key + journey step. Card
number/CVC have no field anywhere; the single-use token lives only in `CheckoutModal` component state.
No server-side storage change.

**Testing**: Jest 30 + `ts-jest` + `jest-environment-jsdom` + Testing Library (`jest.setup.ts`); global
coverage threshold 80 % for lines/branches/functions/statements (`src/main.tsx` and `src/config.ts`
excluded). New/extended suites: summary renders server amounts exactly, in-flight lock on Pagar,
polling cadence (2 s ±10 %) and 40 s ceiling with fake timers, per-code error states (409/422/429/503),
refresh recovery matrix (PENDING resume, 404 discard, version ≠ 2 discard, summary→card entry),
Finalizar clears state + persisted document and triggers a fresh product fetch, and the existing
eslint-restriction test keeps `fetch` boxed in `src/shared/api/`. All assertions map 1:1 to spec
acceptance scenarios and SC-001..SC-006.

**Target Platform**: Modern desktop and mobile browsers; mobile-first from iPhone SE (2020)
375×667 CSS px (750×1334 physical), no horizontal overflow — the modal is constrained to
`w-[calc(100vw-2rem)] max-w-lg overflow-x-hidden`. UI text in Spanish.

**Project Type**: React SPA (front-end only work) inside the monorepo (`back-end/`, `front-end/`,
`docs/`, `specs/`). This feature touches `front-end/` and `specs/005-finalize-checkout/`; back-end code
is untouched (contract in `specs/002-transacciones-pagos/contracts/rest-api.md` is the source of truth).

**Performance Goals**: Polling is exactly one request every 2 s (±10 %) capped at 40 s per payment
attempt and stops on the first final status (SC-003); exactly one in-flight request and one server-side
transaction per purchase attempt under rapid double-taps, backed by the idempotency key (SC-002); instant
in-memory step transitions; no layout shift at 375 px; no duplicate status requests outlive the last
read (`lastReadRequestId` guard).

**Constraints**:
- All HTTP goes through `src/shared/api/http.ts` (`httpRequest` wrapper) — only that file and the
  provider-tokenization seam `src/shared/api/payment-provider.ts` may call `fetch`, enforced by
  `eslint.config.js` and `src/__tests__/eslint-restrictions.spec.ts`. Components never call `fetch`,
  never read `import.meta` (only `src/config.ts`).
- The summary renders amounts exactly as the server returns them; the client never recomputes fees or
  totals and never sends amounts (the server recomputes and rejects tampering).
- The recovery document stays at version 2 with the 003 whitelist; `404` on the reload lookup or any
  version mismatch discards it; recovering at the summary step redirects to `cardAndDelivery`.
- The in-flight lock (disabled Pagar/Continuar) is released on every terminal outcome, including errors.
- Errors in the store are plain serializable `{ kind, message }` values (Railway-style), never `Error`
  instances; shopper-facing messages stay generic and Spanish.
- Never persist card data, the card token or secrets; no payment provider company names anywhere
  (generic `PaymentGateway` naming).
- No card number/CVC field or card token ever enters Redux state — only the memory-only display pair
  `cardBrand`/`cardLastFour`; a dedicated test asserts the invariant.
- Validation rules mirrored from the server contract (server stays authoritative): `reference` is
  `TXN-` + 16 characters; `Idempotency-Key` is 16–64 characters of `[A-Za-z0-9_-]`; maximum quantity
  per purchase is 10 (`MAX_QUANTITY_PER_PURCHASE`).
- Persistence flows only through the versioned whitelist in `features/checkout/persistence.ts`. This
  feature keeps the document at version 2; any future version change must update
  `specs/003-front-end-store/contracts/persistence.md` in the same change.

**Scale/Scope**: One modal backdrop with steps `cardAndDelivery → summary → finalStatus`; one new terminal
action (Finalizar) and its clear-state reducer/thunk wiring; recovery-rule variants in
`restoreProgress`/`readTransactionStatus` handling; no cart, no new routes, no back-end changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Source of truth | Aligned with docs/requirements.md §2 (business flow screens 3–5), §6 (provider flow: create → pay → read until final), §7 (SPA + Flux + persistence whitelist), §10 (Jest ≥ 80 %, restore-after-refresh tested), §12/§13 (workflow, evaluation), §14 (edge-case checklist) and spec FR-001..FR-017. | PASS |
| II. Hexagonal (non-negotiable) | Back-end unchanged; the SPA keeps its equivalent boundary discipline: feature slices + a single shared HTTP adapter, business rules out of components, no `fetch` outside the two allow-listed seams. | PASS (N/A to back-end layers) |
| III. Testing & coverage (non-negotiable) | Jest (not Vitest) with the 80 % global threshold already in `jest.config`; reducers, thunks, polling hook, persistence rules and key components tested, including the full reload-recovery matrix required by §10. Red-green-refactor for new logic. | PASS |
| IV. Railway Oriented Programming | Back-end concern; the SPA adapts the principle: all failures surface as typed `ApiError` values with a `kind` mapped to distinct UI states (409/422/429/503/timeout), never thrown raw, and the in-flight lock is always released. | PASS (adapted) |
| V. Security by design (non-negotiable) | No card field or token is ever persisted; only the v2 whitelist (`transactionId`, `idempotencyKey`, step) survives reload; the persistence spec's card-pattern serialization test still guards the invariant; secrets and provider internals stay server-side. | PASS |
| VI. Atomicity & data integrity | Back-end concern (atomic stock reservation, one transaction per idempotency key); the SPA treats the server as the sole source of truth and reconciles via `GET /transactions/:id` instead of trusting local state. | PASS (N/A) |
| VII. Simplicity & YAGNI | Reuses the 004 modal/seams/persistence; adds one action and a few recovery branches; no new dependency, no state library, generic naming. | PASS |

No violations; Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: PASS — evaluated against `research.md`, `data-model.md` and `contracts/checkout-finalization.md`. All seven constitution principles still PASS after the Phase 1 design: the source-of-truth contracts (REST from spec 002, persistence v2 whitelist from spec 003) govern unchanged; the hexagonal boundary is kept with no back-end change and no `fetch` outside the allow-listed seams; Jest coverage stays at the ≥ 80 % global threshold with the recovery matrix tested; Railway Oriented Programming remains adapted via typed `ApiError` values with the in-flight lock always released; security-by-design keeps the v2 persistence whitelist (no card data, no token, no secrets); atomicity stays a back-end concern with the server as sole source of truth; simplicity/YAGNI holds with zero new dependencies. The Phase 0 research (R1–R10) mapped the artifact structure below. No violations; Phase 1 completed.

## Project Structure

### Documentation (this feature)

```text
specs/005-finalize-checkout/
├── plan.md                    # This file (/speckit.plan command output)
├── research.md                # Phase 0 output (polling/recovery decisions)
├── data-model.md              # Phase 1 output (Recovery Document v2, TransactionView, PaymentStatus)
├── quickstart.md              # Phase 1 output (how to run/verify locally)
├── contracts/
│   └── checkout-finalization.md   # Phase 1 output: consumed endpoints + recovery contract rules
├── checklists/
│   └── requirements.md        # Spec quality checklist (already present, all items PASS)
└── spec.md                    # Feature spec (already present)
```

### Source Code (repository root)

```text
front-end/
├── jest.config.cjs                   # unchanged (global 80 % threshold, jsdom, ts-jest)
├── eslint.config.js                  # unchanged (fetch boxed in src/shared/api/*)
└── src/
    ├── app/
    │   ├── store.ts                  # EDIT (only if needed): finalize reducer wired to persistence clear
    │   └── AppLayout.tsx             # unchanged (restoreProgress on boot)
    ├── shared/
    │   ├── api/
    │   │   ├── http.ts               # unchanged (single fetch seam; 200/202 accepted; 404/409/422/429/503→kind)
    │   │   └── api.errors.ts         # unchanged (kinds reused by error states)
    │   └── constants.ts              # unchanged (STATUS_POLL_INTERVAL_MS=2000, STATUS_POLL_CEILING_MS=40000)
    └── features/
        ├── checkout/
        │   ├── checkout.slice.ts     # EDIT: finalize reducer (clear all checkout progress on Finalizar)
        │   ├── checkout.thunks.ts    # EDIT: finalizeCheckout thunk (clear + fresh product fetch);
        │   │                         #       restoreProgress: 404-on-transaction → discard doc, summary → card entry
        │   ├── checkout.selectors.ts # EDIT (if needed): selector for terminal step/has-progress
        │   ├── persistence.ts        # unchanged (v2 whitelist already matches recovery doc; clear on Finalizar)
        │   ├── CheckoutModal.tsx     # EDIT: Finalizar handler (close, finalize, return to product page);
        │   │                         #       keep the summary-never-restored guard
        │   ├── PaymentStatus.tsx     # EDIT: add Finalizar action on approved/declined/terminal error states
        │   ├── OrderSummary.tsx      # unchanged (renders server amounts verbatim; Pagar disabled in-flight)
        │   ├── usePaymentPolling.ts  # unchanged (2 s interval, 40 s ceiling, stops on final status)
        │   ├── payment-errors.ts     # EDIT (if needed): guidance copy for timeout/service-unavailable states
        │   └── *.spec.ts(x)          # EDIT/ADD: finalize flow, recovery matrix (404/PENDING/version/summary),
        │                             #            exact-amount assertions, lock release on errors, polling caps
        └── product/
            └── ProductPage.tsx       # EDIT: land here after Finalizar with stock refetched from the server
```

**Structure Decision**: Keep the existing feature-sliced SPA layout. Everything lives under
`front-end/src/features/checkout/` (slice, thunks, persistence, modal backdrop with the
`cardAndDelivery → summary → finalStatus` steps, polling hook, error mapping) plus a small touch in
`features/product/ProductPage.tsx` for the post-Finalizar return with fresh stock. All outbound HTTP
stays behind `shared/api/http.ts` (our API) and the 004 tokenization seam. The back-end is reused as-is;
the REST contract of `specs/002-transacciones-pagos/contracts/rest-api.md` and the persistence contract
of `specs/003-front-end-store/contracts/persistence.md` (document version 2) govern the boundaries.

## Complexity Tracking

> No constitution violations; this section is intentionally empty.
