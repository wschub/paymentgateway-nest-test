# Implementation Plan: Card & Delivery Payment with Resilient Recovery

**Branch**: `004-card-delivery-payment` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-card-delivery-payment/spec.md`

## Summary

Add the checkout payment step to the existing `front-end/` SPA: a card-and-delivery modal launched from the
product page that collects and validates delivery data and card data, tokenizes the card **in the browser**
with the provider public key (never a hosted widget, D5), accepts the two contracts, and creates the pending
purchase when the shopper presses **Continuar**. The modal then shows a **summary** with the server-computed
amount breakdown and a **Pagar** action that starts the payment through the existing back-end endpoints. The
single-use token lives only in non-persisted memory between the two steps; the card number and CVC never enter
Redux state, the persisted document or any request to our API. Payment is asynchronous: the back-end returns a
`PENDING` transaction and the SPA reads the real status from `GET /transactions/:id` until it is final, showing
a `finalStatus` step (a refresh with a restored transaction id shows a "verifying" state until the read
answers). Resilience is first-class: a per-purchase idempotency key (generated at modal open, persisted, reused
only while the purchase is pending, then regenerated after a final declined/voided/error), a double-click guard,
and explicit handling of sold out, declined, invalid/expired token, provider unavailable, `PENDING`/timeout, and
amount tampering (the server recomputes all amounts; the client sends none). The work is almost entirely
front-end: it extends the shared `fetch` wrapper for POST bodies and headers, adds a dedicated
provider-tokenization seam, adds delivery validators plus a payload mapper, grows the checkout slice/thunks
(create, then pay) and persistence document (version 1 → 2, adding the idempotency key to the whitelist while
keeping discard-on-mismatch), and adds Jest tests. The back-end payment flow already exists (feature 002) and is
reused unchanged; only verification tests are added. The feature also corrects the `front-end/README.md` payment
description and updates the persistence contract.

## Technical Context

**Language/Version**: TypeScript 6.x, React 19, Vite 8 (existing `front-end/` app). Back-end unchanged
(NestJS + TypeScript).

**Primary Dependencies**: Existing `react`, `react-dom`, `@reduxjs/toolkit`, `react-redux`, `react-router-dom`,
`tailwindcss`. No new runtime dependency: validation (Luhn, brand, expiry, CVC) is hand-written; the provider
call is plain `fetch` from one allow-listed seam. No UI component library, no `redux-persist`.

**Storage**: Browser `localStorage`, single versioned document under `checkout-progress`, now **version 2**
(adds `idempotencyKey`). The single-use card token lives only in local `CheckoutModal` component state (memory
only, never dispatched to Redux) between Continuar and Pagar and is passed as an argument to `payTransaction`;
the card form state (number/expiry/CVC/cardholder) is component-local React state only and is never written to
Redux or `localStorage`. No server-side storage change.

**Testing**: Jest + `ts-jest` + `jest-environment-jsdom` + Testing Library, global 80 % coverage threshold
(excludes `src/main.tsx`, `src/config.ts`). New suites: http wrapper POST/headers/error mapping, card
validators, delivery validators + payload mapper, card-form component, checkout slice, checkout thunks (mocked
`fetch`), tokenization seam, modal flow, status polling, persistence v2 load/discard rules. Back-end: run
existing Jest suites; add tests for every enumerated edge case (T032).

**Target Platform**: Modern desktop and mobile browsers, mobile-first from 375×667 CSS px; the modal must fit
small viewports with no horizontal overflow. Provider sandbox is called from the browser (tokenization only).

**Project Type**: React single-page application plus its existing NestJS back-end (monorepo). This feature
touches `front-end/` and the `specs/` docs; back-end code is expected to be untouched.

**Performance Goals**: Instant in-memory step transitions; tokenization round-trip is a single request; status
polling uses a fixed 2 s interval with a 40 s ceiling and stops as soon as the transaction is final. No layout
shift at 375 px.

**Constraints**:
- Only `src/shared/api/http.ts` (our API) and the new `src/shared/api/payment-provider.ts` (provider
  tokenization) may call `fetch`; both must be reflected in `eslint.config.js` and
  `src/__tests__/eslint-restrictions.spec.ts`. `import.meta.env` stays only in `src/config.ts`.
- Card number and CVC MUST have no field in Redux state, the persisted document, logs or any request to our
  back-end; only a single-use token, brand, last four and installments ever leave the browser.
- The client never sends amounts; the server recomputes them and rejects unknown fields.
- Errors kept in the store are plain serializable objects with a `kind`, never `Error` instances; no internal
  detail from the provider or back-end is shown to the shopper.
- No provider company name anywhere; no secrets in the front-end (only the public key and base URL from
  `/payments/checkout-config`).
- Idempotency key: 16–64 chars of `[A-Za-z0-9_-]`, generated once when the modal opens, persisted, and reused
  only while the purchase is pending; cleared with the transaction id and regenerated after a final
  declined/voided/error. Required only when the step is past `product` or a transaction id exists.
- The single-use card token is held only in local `CheckoutModal` component state (memory only, never in Redux)
  and is never writable to the persisted document.

**Scale/Scope**: One modal flow with steps `cardAndDelivery → summary → finalStatus`; one new API seam; four
new thunks (checkout config, create transaction, pay transaction, read status) and one polling helper; two new
validation modules (card, delivery + mapper); one extended slice; one persistence version bump. No multi-product
cart.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Source of truth | Derives from docs/requirements.md FR-3..FR-8, §6 (API-based card form, never hosted, D5), §14 edge-case checklist, and spec FR-001..FR-024. | PASS |
| II. Hexagonal (non-negotiable) | Back-end concern and unchanged; the SPA keeps clear boundaries (feature slices + a shared HTTP adapter, never `fetch` from components) and calls only the existing ports' HTTP surface. | PASS (N/A to back-end layers) |
| III. Testing & coverage (non-negotiable) | Jest covers the HTTP wrapper, validators, slice, thunks, persistence v2, tokenization seam and modal flow; global threshold 80 %. Back-end suites re-run. | PASS |
| IV. Railway Oriented Programming | Back-end concern; the SPA surfaces failures as typed error values (`kind`) and explicit states, never thrown raw to the UI. | PASS (adapted) |
| V. Security by design (non-negotiable) | Card number/CVC have no Redux field and never reach `localStorage` or our API; the single-use token is memory-only and never persisted; tokenization uses the public key only; serialization tests assert no card-like key and no token in store/storage/fetch bodies; secrets stay server-side. | PASS |
| VI. Atomicity & data integrity | Back-end concern (atomic conditional stock decrement, one purchase per idempotency key); the SPA relies on the server as source of truth and never mutates stock. | PASS (N/A) |
| VII. Simplicity & YAGNI | Hand-written validators, one tokenization seam, no new dependency, no state library, one purchase per flow; generic naming (PaymentGateway). | PASS |

No violations; Complexity Tracking is intentionally empty.

**Post-design re-check (after Phase 1)**: re-evaluated against the generated `data-model.md` and `contracts/`.
The design keeps card data out of state/storage/our API (Principle V), adds no dependency and no provider name
(Principle VII), tests each edge case with the 80 % threshold (Principle III), reuses the existing back-end
endpoints without new layers (Principles II, VI), and expresses failures as values (Principle IV). Gates still
PASS; no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-card-delivery-payment/
├── plan.md                        # This file
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   ├── checkout-rest-api-consumed.md   # Endpoints consumed + error→kind mapping
│   └── card-tokenization.md            # Browser tokenization contract + lint seam
├── checklists/
│   └── requirements.md            # Spec quality checklist (already present)
└── spec.md                        # Feature spec (already present)
```

### Source Code (repository root)

```text
front-end/
├── eslint.config.js                    # + allow fetch in src/shared/api/payment-provider.ts
├── README.md                           # EDIT: card data "tokenized in the browser ... never stored" (D5)
└── src/
    ├── config.ts                       # unchanged (only import.meta seam)
    ├── features/checkout/
    │   ├── checkout.slice.ts           # EDIT: add idempotencyKey, transaction view, payment status/error;
    │   │                               #       card brand/lastFour/installments (non-sensitive), step reducers
    │   ├── checkout.thunks.ts          # EDIT/ADD: loadCheckoutConfig, createTransaction, payTransaction,
    │   │                               #       readTransactionStatus (poll), restoreProgress after refresh
    │   ├── checkout.selectors.ts       # EDIT: selectors for config, transaction, status, amount breakdown
    │   ├── persistence.ts              # EDIT: PERSISTENCE_VERSION 2, add idempotencyKey to whitelist,
    │   │                               #       keep discard-on-mismatch (version !== 2 → discard)
    │   ├── CheckoutModal.tsx           # ADD: accessible <dialog> host for the flow steps
    │   ├── CardAndDeliveryForm.tsx     # ADD: delivery + card form + contracts + pay button
    │   ├── card.validation.ts          # ADD: Luhn, brand detection, expiry, CVC, cardholder, installments
    │   ├── card.validation.spec.ts
    │   ├── delivery.validation.ts      # ADD: delivery field validators + toTransactionPayload mapper
    │   ├── delivery.validation.spec.ts
    │   ├── OrderSummary.tsx            # ADD: product, quantity, delivery, server amount breakdown
    │   ├── PaymentStatus.tsx           # ADD: pending spinner / approved / declined / voided / error + re-check
    │   ├── usePaymentPolling.ts        # ADD: bounded status polling while PENDING
    │   └── *.spec.ts(x)                # ADD: slice, thunks, form, modal, polling, persistence v2
    ├── features/product/ProductPage.tsx# EDIT: "Iniciar compra" opens the modal (step cardAndDelivery)
    ├── shared/api/
    │   ├── http.ts                     # EDIT: method/body/headers + error-code→kind mapping; contract
    │   ├── api.errors.ts               # EDIT: new kinds (see data-model.md)
    │   └── payment-provider.ts         # ADD: browser tokenization (POST /tokens/cards, public key)
    ├── shared/constants.ts             # EDIT: contract key pattern, poll interval/timeout, installments default
    └── shared/format/money.ts          # unchanged (reused for the breakdown)
```

**Structure Decision**: Keep the existing feature-sliced layout. The payment flow lives entirely under
`features/checkout/` (slice, thunks, persistence, modal components with the two steps
`cardAndDelivery → summary → finalStatus`, validation, polling). All outbound HTTP goes through `shared/api/`:
our API via the extended `http.ts`, and the provider's tokenization via a single new seam
`payment-provider.ts` that is explicitly allow-listed in ESLint (mirroring how `http.ts` is the only allowed
caller of `fetch` today). Components never call `fetch` and never read `import.meta`. The single-use token stays
in non-persisted memory, never in the persisted document. The back-end is reused as-is; no back-end runtime
changes are planned, only verification tests for the enumerated edge cases.

## Complexity Tracking

> No constitution violations; this section is intentionally empty.
