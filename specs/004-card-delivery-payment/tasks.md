---

description: "Task list for Card & Delivery Payment with Resilient Recovery"
---

# Tasks: Card & Delivery Payment with Resilient Recovery

**Input**: Design documents from `/specs/004-card-delivery-payment/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the spec makes tests mandatory (FR-024, SC-008) and the constitution requires coverage
≥ 80 % in each app.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task.

## Path Conventions

Monorepo with two apps: `front-end/src/` (React SPA) and `back-end/src/` (NestJS). This feature is almost
entirely front-end; the back-end is reused.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Constants and the lint seam the rest of the feature depends on.

- [ ] T001 [P] Add payment constants to `front-end/src/shared/constants.ts`: `IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/`, `STATUS_POLL_INTERVAL_MS = 2000`, `STATUS_POLL_CEILING_MS = 40000`, `INSTALLMENTS_DEFAULT = 1`, `TOKENIZATION_TIMEOUT_MS = 10000`, plus the delivery rules `FULL_NAME_MAX_LENGTH = 120`, `NOTES_MAX_LENGTH = 500`, `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` and `PHONE_PATTERN = /^[0-9+ ]{7,20}$/` copied **exactly** from `back-end/src/infrastructure/http/create-transaction.dto.ts` (sourced from `back-end/src/domain/rules/customer.rules.ts` and `delivery.rules.ts`) with a source comment; the validators must reuse these names so the front-end cannot drift from the back-end.
- [ ] T002 [P] Allow `fetch` in the tokenization seam: add `'src/shared/api/payment-provider.ts'` to the `no-restricted-globals` override in `front-end/eslint.config.js` (mirroring the `src/shared/api/http.ts` override).
- [ ] T003 [P] Extend `front-end/src/__tests__/eslint-restrictions.spec.ts`: assert `fetch` is allowed in `src/shared/api/payment-provider.ts` and still flagged in `src/features/checkout/leaky.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared wrapper, error model, checkout state and persistence v2 that every story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Extend `ApiErrorKind` and the safe-message map in `front-end/src/shared/api/api.errors.ts` with the new kinds from `data-model.md`: `soldOut`, `idempotencyConflict`, `notPayable`, `contractsNotAccepted`, `invalidToken`, `providerRejected`, `providerUnavailable`, `badRequest` (keep existing `network`, `rateLimited`, `server`, `notFound`); every message is fixed and non-technical.
- [ ] T005 Extend `httpRequest<T>` in `front-end/src/shared/api/http.ts` to accept optional `method`, `body` (JSON) and `headers` (default GET, current behavior preserved), and to map failures by HTTP status **plus** the back-end `code` to a `kind` per `contracts/checkout-rest-api-consumed.md` (table).
- [ ] T006 Add wrapper tests in `front-end/src/shared/api/http.spec.ts` for POST with a JSON body and an `Idempotency-Key` header, and for the status+code mapping table (404, 409×3, 422×2, 502, 503, 429, 400, other 5xx, timeout).
- [ ] T007 Extend `CheckoutState` and reducers in `front-end/src/features/checkout/checkout.slice.ts` with `idempotencyKey`, `cardBrand`, `cardLastFour`, `installments`, `contractsAccepted`, `paymentStatus` (`'idle' | 'creating' | 'paying' | 'pending' | 'approved' | 'declined' | 'voided' | 'error'`) and `paymentError` (`ApiError | null`) plus the actions to set them; keep `initialState` and `startOver`/`purchaseCompleted` resetting them. No card number/CVC field exists (constraint from `data-model.md`). The single-use `cardToken` is intentionally **not** a Redux field — it lives in local `CheckoutModal` state (T021) and is passed as an argument to `payTransaction` (T019).
- [ ] T008 [P] Extend `front-end/src/features/checkout/checkout.selectors.ts` with selectors for the idempotency key, card display fields, installments, contracts flag, `paymentStatus` and `paymentError`.
- [ ] T009 [P] Add `front-end/src/features/checkout/checkout.slice.spec.ts` coverage for the new reducers (set key, set card display fields, set status/error, reset on `startOver`).
- [ ] T010 Bump persistence to version 2 in `front-end/src/features/checkout/persistence.ts`: `PERSISTENCE_VERSION = 2`, add `idempotencyKey: string | null` to `StorableCheckout`/`PersistedProgress`, include it in `toStorableCheckout`, `toCheckoutState`, `shallowStorableEqual` and `subscribeCheckoutProgress`, validate it on load (`null` or `IDEMPOTENCY_KEY_PATTERN`), and keep **discard-on-mismatch** (`record.version !== PERSISTENCE_VERSION` → discard).
- [ ] T011 Update `front-end/src/features/checkout/persistence.spec.ts`: a version-1 document is discarded; a version-2 document with a valid `idempotencyKey` loads it; an invalid key discards; the serialized document still contains no card-like keys.
- [ ] T012 Update the 003 persistence contract **and** data model: in `specs/003-front-end-store/contracts/persistence.md` change `version` to 2 in the shape and field table, add the `idempotencyKey` field rule (16–64 `[A-Za-z0-9_-]`, or null) and state that a mismatched version is still discarded; in `specs/003-front-end-store/data-model.md` update the version/shape description and the example persisted-JSON snippet to version 2 with `idempotencyKey`.

**Checkpoint**: Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Enter the card and delivery details and pay (Priority: P1) 🎯 MVP

**Goal**: An accessible two-step modal — **Continuar** on the delivery+card form validates, tokenizes in the
browser and creates the pending purchase; the **summary** shows the server-computed amount breakdown and
**Pagar** starts the payment.

**Independent Test**: For a chosen product, enter valid delivery and approved-card data, accept both contracts
and press Continuar; the summary shows the server amounts and a pending purchase exists; press Pagar and a
payment starts, with no card number/CVC and no token in state or `localStorage`.

### Tests for User Story 1 ⚠️ (write first; ensure they FAIL)

- [ ] T013 [P] [US1] Card-validator tests in `front-end/src/features/checkout/card.validation.spec.ts`: Luhn (valid/invalid), length 13–19, brand by IIN (VISA `4`, MasterCard `51–55`/`2221–2720`), expiry `MM/YY` (past rejected, end-of-month accepted), CVC 3–4 digits, cardholder ≥ 5 chars, installments ≥ 1 and ≤ max.
- [ ] T014 [P] [US1] Tokenization-seam tests in `front-end/src/shared/api/payment-provider.spec.ts`: success returns `{ token, brand, lastFour }`; 4xx → `invalidToken`; 5xx → `providerUnavailable`; timeout → `network`; the request carries `Authorization: Bearer {publicKey}` and never logs the card fields.
- [ ] T015 [US1] Checkout-thunk tests in `front-end/src/features/checkout/checkout.thunks.spec.ts` for `loadCheckoutConfig` (200 → config; 503 → `providerUnavailable`), `createTransaction` (`POST /transactions`, sends `Idempotency-Key`, request body has no amount fields; `201` created / `200` idempotent replay; `409 soldOut` / `404 notFound`) and `payTransaction` (called with the `cardToken` **argument**; `POST /transactions/:id/payment`, `202`/`PENDING` handled; `409 notPayable` / `422 contractsNotAccepted` / `422 invalidToken` clears the token, `502`, and `503`/`network` **keeps** the token and the key so a retry is called with the **same** token argument and sends no new `POST /transactions`/`POST /transactions/:id/payment`) using a mocked `fetch`.
- [ ] T016 [US1] Component tests in `front-end/src/features/checkout/CardAndDeliveryForm.spec.tsx` and `front-end/src/features/checkout/CheckoutModal.spec.tsx`: inline validation errors, contracts gating, pay disabled while in flight, dialog opens/traps/returns focus.

### Implementation for User Story 1

- [ ] T017 [P] [US1] Implement `front-end/src/features/checkout/card.validation.ts` with the pure validators and brand detection used by T013.
- [ ] T018 [US1] Implement the tokenization seam in `front-end/src/shared/api/payment-provider.ts`: `tokenizeCard({ baseUrl, publicKey, card }, timeoutMs)` → `POST {baseUrl}/tokens/cards` with `Authorization: Bearer {publicKey}` and body `{ number, cvc, exp_month, exp_year, card_holder }`; return `{ token, brand, lastFour }` or an `ApiError` per `contracts/card-tokenization.md`. This is the only new file allowed to call `fetch` (T002).
- [ ] T019 [US1] Implement `loadCheckoutConfig`, `createTransaction` and `payTransaction` thunks in `front-end/src/features/checkout/checkout.thunks.ts`: GET `/payments/checkout-config`; `createTransaction` = POST `/transactions` (with `Idempotency-Key`, `productId`, `quantity`, `customer`, `delivery`) dispatched by **Continuar**; `payTransaction(cardToken)` = POST `/transactions/:id/payment` (`cardToken`, `installments`, `acceptedContracts: true`) dispatched by **Pagar** with the single-use token received as a **thunk argument** (not read from state); the client sends **no** amounts. The caller owns the token lifecycle: on `network`/timeout/`503` the modal keeps the token and the key and calls `payTransaction` again with the same token (the back-end reconciles the pending claim by reference); the token is discarded by the caller on `202`/`200`, on `invalidToken` (re-enter the card with the same key), on any `409` and on any final state.
- [ ] T020 [P] [US1] Implement `OrderSummary` in `front-end/src/features/checkout/OrderSummary.tsx` as the **summary** step: show the server `amounts` breakdown (product amount, base fee, delivery fee, total) via `formatPriceCOP` and a **Pagar** button that calls the `onPay` callback provided by `CheckoutModal` (which owns the token and dispatches `payTransaction(cardToken)`), disabled while `paying`.
- [ ] T021 [US1] Implement `CardAndDeliveryForm` in `front-end/src/features/checkout/CardAndDeliveryForm.tsx`: local (non-Redux, non-persisted) card state, delivery fields, inline errors, both contract checkboxes with the config links, installments selector and a double-click guard; the **Continuar** button validates the delivery and card data and the contracts, tokenizes in the browser (T018) and dispatches `createTransaction` (T019), handing the single-use token **up to local `CheckoutModal` state** (a `useState`/`useRef`, memory only). The token is never dispatched to Redux and card fields are never persisted; `CheckoutModal` keeps the token across a `network`/timeout/`503` retry of Pagar (re-calling `payTransaction` with the same token argument) and discards it on acceptance, `invalidToken`, `409`, modal close or any final state.
- [ ] T022 [US1] Implement `CheckoutModal` in `front-end/src/features/checkout/CheckoutModal.tsx`: accessible `<dialog>` hosting `cardAndDelivery` → `summary` → `finalStatus`, focus trap, focus-to-heading per step, `Esc` closes, returns focus to the trigger; on load with a restored step of `summary` (the token is memory-only) restart at `cardAndDelivery` keeping the same idempotency key.
- [ ] T023 [US1] Wire the product page's "Iniciar compra" button to open `CheckoutModal` (step `cardAndDelivery`, generate the idempotency key once) in `front-end/src/features/product/ProductPage.tsx`.
- [ ] T042 [US1] Delivery-validation tests in `front-end/src/features/checkout/delivery.validation.spec.ts`: reuse the constants from `front-end/src/shared/constants.ts` (T001) — `FULL_NAME_MAX_LENGTH = 120`, `NOTES_MAX_LENGTH = 500`, `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`, `PHONE_PATTERN = /^[0-9+ ]{7,20}$/`, exact copies of the back-end rules in `back-end/src/infrastructure/http/create-transaction.dto.ts` — and assert full name required and ≤ 120 chars; email matches `EMAIL_PATTERN`; the phone behaves **exactly like the back-end `PHONE_PATTERN`** (`"abc1234"` invalid — letters not allowed; `"+57 300 000 0000"` valid; too short/long invalid); address/city/region required; notes optional and ≤ 500 chars; and the mapper `toTransactionPayload(delivery)` flattens to the back-end shape `{ customer: { fullName, email, phone }, delivery: { address, city, region, notes? } }`.
- [ ] T043 [US1] Implement `front-end/src/features/checkout/delivery.validation.ts`: the pure validators used by T042, importing `FULL_NAME_MAX_LENGTH`, `NOTES_MAX_LENGTH`, `EMAIL_PATTERN` and `PHONE_PATTERN` from `shared/constants.ts` (T001) rather than re-declaring them, and the flat-form → nested `toTransactionPayload(delivery)` mapper invoked by `createTransaction` (T019).

**Checkpoint**: US1 is a functional MVP — a purchase can be started without card data ever reaching our systems.

---

## Phase 4: User Story 2 - Confirm the payment and survive a refresh mid-payment (Priority: P2)

**Goal**: Handle the asynchronous `PENDING` result, poll the back-end status to a final state, and recover
after a refresh without charging again.

**Independent Test**: Pay, refresh before the provider settles, and confirm the purchase is restored, the
status is re-read from the back-end and no second payment is started.

### Tests for User Story 2 ⚠️ (write first; ensure they FAIL)

- [ ] T024 [P] [US2] Polling tests in `front-end/src/features/checkout/usePaymentPolling.spec.ts`: starts while `pending`, reads on a fixed `STATUS_POLL_INTERVAL_MS` (2000 ms) with no backoff, stops on a final status, stops at `STATUS_POLL_CEILING_MS` (40000 ms) leaving the pending state plus the manual re-check, and cancels on unmount.
- [ ] T025 [US2] `readTransactionStatus` and recovery tests in `front-end/src/features/checkout/checkout.thunks.spec.ts`: GET `/transactions/:id` updates the view; startup with a persisted `transactionId` reads status and dispatches **no** `createTransaction`/`payTransaction`; unknown id → `notFound`.
- [ ] T026 [US2] `PaymentStatus` component tests in `front-end/src/features/checkout/PaymentStatus.spec.tsx`: pending spinner + manual "re-check", and the approved/declined/voided/error renders with the right result and messages.

### Implementation for User Story 2

- [ ] T027 [US2] Implement the `readTransactionStatus` thunk (GET `/transactions/:id`) in `front-end/src/features/checkout/checkout.thunks.ts`, updating `paymentStatus`/`paymentError` and the transaction view.
- [ ] T028 [US2] Implement `front-end/src/features/checkout/usePaymentPolling.ts` (fixed 2 s interval up to the 40 s ceiling, cancel on unmount) driven by the current `transactionId` and `paymentStatus`.
- [ ] T029 [US2] Implement `front-end/src/features/checkout/PaymentStatus.tsx`: pending state with a manual re-check, and final states (approved → delivery assigned; declined/voided/error → reserved stock released).
- [ ] T030 [US2] Wire refresh recovery in `front-end/src/app/store.ts` + `checkout.thunks.ts`: on startup, if the restored state has a `transactionId`, open the payment step in a "verifying" state and dispatch `readTransactionStatus` instead of any create/pay.
- [ ] T044 [P] [US2] Refresh-recovery UI tests in `front-end/src/features/checkout/usePaymentPolling.spec.ts` and `front-end/src/features/checkout/CheckoutModal.spec.tsx`: with a restored `transactionId` the payment step shows "verificando" and never an approved/failed result until `GET /transactions/:id` responds; responses arriving **out of order** are ignored — only the latest `requestId` result is applied.
- [ ] T045 [US2] Implement the "verifying" initial state and the request-id ordering guard in `front-end/src/features/checkout/usePaymentPolling.ts` (+ the `store.ts` recovery path): track the latest `requestId` and drop any stale response so an older read cannot overwrite a newer final status.

**Checkpoint**: US1 and US2 both work — a payment can be confirmed and survives a mid-payment refresh.

---

## Phase 5: User Story 3 - Recover cleanly from every payment edge case (Priority: P3)

**Goal**: Define the behavior for sold out, double click, declined, invalid/expired token, provider
unavailable, timeout/`PENDING`, retried idempotency key, and amount tampering.

**Independent Test**: Force each condition and confirm a clear, non-technical message, no double charge, and
that client-supplied amounts never change what is charged.

### Tests for User Story 3 ⚠️ (write first; ensure they FAIL)

- [ ] T031 [P] [US3] Error-kind → message/next-action tests in `front-end/src/features/checkout/CheckoutModal.spec.tsx` (and/or `checkout.slice.spec.ts`): `soldOut`, `declined` final, `invalidToken` (highlight card), `providerUnavailable` (retry), `idempotencyConflict`, `notPayable`, `contractsNotAccepted`.
- [ ] T032 [US3] Back-end verification tests — assert each enumerated case, using the existing spec when it exists or adding one when it does not:
  - amount tampering rejected with `400` → `back-end/src/infrastructure/http/create-transaction.dto.spec.ts` (existing).
  - `409 IDEMPOTENCY_KEY_REUSED` for a changed payload, and replay (same key + payload returns the same id/reference) → `back-end/src/application/use-cases/create-transaction.use-case.spec.ts` (existing).
  - `409 TRANSACTION_NOT_PAYABLE` and `422 INVALID_PAYMENT_TOKEN` → `back-end/src/application/use-cases/pay-transaction.use-case.spec.ts` (existing).
  - `409 INSUFFICIENT_STOCK` and atomic stock that never drops below zero → create-transaction use-case spec + product repository spec (existing; add the atomic assertion if missing).
  - unpaid `PENDING` older than the reservation window is voided as `VOIDED`/`RESERVATION_EXPIRED` on read → transaction-status use-case spec (add if missing).
- [ ] T033 [US3] End-to-end edge-case integration tests in `front-end/src/features/checkout/CheckoutModal.spec.tsx`: double-click on Continuar/Pagar → one request; declined → `transactionId` cleared and a **new** idempotency key for the retry with a new card; retry after a network/503 failure at **Pagar** reuses the **same** token and the **same** key and issues **no** new `POST /transactions` (only the same `POST /transactions/:id/payment`); an `invalidToken` at Pagar discards the token and re-enters the card with the **same** key while the purchase is `PENDING`; sold out → no charge; closing after Continuar leaves a `PENDING` purchase that is read back as `VOIDED`/`RESERVATION_EXPIRED`.

### Implementation for User Story 3

- [ ] T034 [US3] Map every error kind to a clear message and next action in `front-end/src/features/checkout/CheckoutModal.tsx` and `PaymentStatus.tsx` (`invalidToken`/declined → re-enter card; `soldOut` → adjust/block; `providerUnavailable`/`providerRejected` → retry; `notPayable` → show current status; `idempotencyConflict` → start fresh).
- [ ] T035 [US3] Implement the idempotency-key lifecycle in `front-end/src/features/checkout/checkout.thunks.ts`: generate the key once when the modal opens (matching `IDEMPOTENCY_KEY_PATTERN`) and persist it (v2); reuse it on every retry **while the purchase is `PENDING`** (network failure, 503, `invalidToken`, replay); on any final `DECLINED`/`VOIDED`/`ERROR` (incl. `RESERVATION_EXPIRED`) clear `transactionId` and generate a **new** key. The key is required only when `currentStep !== 'product'` or a `transactionId` exists.
- [ ] T036 [US3] Announce errors and stock changes through `LiveRegion` and associate field errors with inputs via `aria-describedby` in `front-end/src/features/checkout/CardAndDeliveryForm.tsx`; keep the 375 px modal free of horizontal overflow.
- [ ] T046 [US3] SC-005 privacy test: after tokenizing and paying with `4242424242424242` / CVC `123`, assert that `JSON.stringify(store.getState())`, `localStorage`, and the bodies of every `fetch` to **our** API contain neither the card number nor the CVC; also assert that `Object.keys(store.getState())` and `Object.keys(JSON.parse(localStorage.getItem('checkout-progress')!))` contain no card-like keys (`card`, `cvc`, `cvv`, `pan`, `expiry`, `expiration`, `securityCode`), the only documented exceptions being `cardBrand` and `cardLastFour` (non-sensitive, in-memory only — and never present in the persisted document).
- [ ] T047 [US3] Front-end tests for the remaining edge cases in `front-end/src/features/checkout/CheckoutModal.spec.tsx`: reopening an already-final (completed/voided) transaction shows its status and starts no new payment (`notPayable`); a price change between the summary and the charge is warned about and the displayed total equals the server-recomputed total.

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, verification and final quality gates.

- [ ] T037 [P] Correct `front-end/README.md`: replace "lives only in the payment provider's hosted flow" with "tokenized in the browser with the public key, never stored" (hosted widget is not used, D5); fix the lint note to say **both** `src/shared/api/http.ts` **and** `src/shared/api/payment-provider.ts` may call `fetch`; correct the "read-only product API" description so it also covers the checkout-config, transaction-create, payment and status endpoints; and reference the version-2 persistence contract and the idempotency key.
- [ ] T039 Run `front-end` gates: `npm run lint && npm run build && npm run test:cov`; ensure coverage ≥ 80 % and fix gaps.
- [ ] T040 Run `back-end` gates: `npm run lint && npm run build && npm run test:cov`; ensure coverage ≥ 80 % for touched code.
- [ ] T041 Validate `quickstart.md` scenarios 1–18 (sandbox manual runs for the happy path and declined/error cards only); confirm no provider company name and no secret was committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **User Stories (Phases 3–5)**: each depends on Foundational; US2 and US3 build on US1's modal but remain
  independently testable.
- **Polish (Phase 6)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational — no dependency on other stories.
- **US2 (P2)**: after Foundational — reuses US1's modal; independently testable via status/polling/refresh.
- **US3 (P3)**: after Foundational — reuses US1/US2; independently testable by forcing each failure.

### Within Each User Story

- Tests first and failing, then models/validators, then thunks/services, then components, then wiring.
- T005 depends on T004; T006 depends on T005; T010 depends on T007; T011 depends on T010.
- T042 before T043; T043 before T019 (the mapper feeds `createTransaction`); T019 before T021/T020; T022 before T023.
- T035 (key lifecycle) before T033/T045; T030/T045 before T044's assertions pass.

### Parallel Opportunities

- Phase 1: T001, T002, T003 in parallel.
- Phase 2: T008 and T009 in parallel; T006 after T005; T011 after T010.
- US1: T013, T014, T042 in parallel; T017 and T020 in parallel; T042 before T043; T018/T043 before T021; T019 before T020/T021; T021 before T022; T022 before T023.
- US2: T024 and T044 in parallel with T025/T026; T027 before T028/T029/T045; T030/T045 after T027.
- US3: T031, T032 and T046 in parallel; T035 before T033.

---

## Parallel Example: User Story 1

```bash
# Write the first tests together:
Task: "Card-validator tests in front-end/src/features/checkout/card.validation.spec.ts"
Task: "Delivery-validator tests in front-end/src/features/checkout/delivery.validation.spec.ts"
Task: "Tokenization-seam tests in front-end/src/shared/api/payment-provider.spec.ts"

# Implement independent modules together:
Task: "Implement front-end/src/features/checkout/card.validation.ts"
Task: "Implement front-end/src/features/checkout/delivery.validation.ts"
Task: "Implement front-end/src/features/checkout/OrderSummary.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational) — required by all stories.
2. Complete Phase 3 (US1) → validate: a purchase can be started with **Continuar**, reviewed on the **summary**
   and paid with **Pagar**, and neither card data nor the token is stored.
3. STOP and DEMO.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → independently testable MVP (Continuar → summary → Pagar).
3. US2 → asynchronous confirmation and refresh recovery (verifying state, fixed-interval polling).
4. US3 → all payment edge cases handled.
5. Polish → docs, coverage and quickstart validation.

---

## Notes

- [P] = different files, no dependencies.
- Every task lists an exact file path; no card number/CVC field is ever introduced, and the single-use card token
  lives only in non-persisted memory (the persisted document holds no card data and no token).
- Task numbering is non-sequential on purpose: T001–T041 keep their original IDs and T042–T047 are the tasks added
  for delivery validation, refresh "verifying"/ordering, the SC-005 privacy test and the reopened/price-change
  edge cases.
- Commit after each task or logical group using Conventional Commits.
- Stop at any checkpoint to validate the story independently.
