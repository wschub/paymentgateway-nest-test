---

description: "Task list for Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery"
---

# Tasks: Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery

**Input**: Design documents from `/specs/005-finalize-checkout/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/checkout-finalization.md, quickstart.md

**Tests**: Test tasks are INCLUDED — the constitution (Principle III) requires Jest with ≥ 80 % global coverage and the spec pins every FR/SC to an automated suite (quickstart.md "What the suites must prove"). Follow red-green-refactor: write/fail tests before implementation changes.

**Organization**: Tasks are grouped by user story (US1..US4 from spec.md) so each story can be implemented and verified independently. This feature is **front-end only**; the back-end (feature 002) is reused unchanged.

**Constraints** (from plan.md / user input): all HTTP stays behind `front-end/src/shared/api/http.ts` (and the 004 tokenization seam `payment-provider.ts`) — components never call `fetch`, enforced by `eslint.config.js` and `src/__tests__/eslint-restrictions.spec.ts`. `import.meta` is read only in `front-end/src/config.ts`. No card number/CVC field or card token ever enters Redux state (locked by the CARD_LIKE test in `checkout.slice.spec.ts` and the no-leak integration test); only the display pair `cardBrand`/`cardLastFour` is kept in memory. Amounts are rendered verbatim from the server (never recomputed/sent). Server-mirrored validation rules: `reference` is `TXN-` + 16 characters, `Idempotency-Key` is 16–64 chars of `[A-Za-z0-9_-]`, quantity is 1–10 (`MAX_QUANTITY_PER_PURCHASE`). The recovery document stays at version 2 with the 003 whitelist — any version change must update `specs/003-front-end-store/contracts/persistence.md` in the same change. Errors in Redux are plain serializable `{ kind, message }` values. UI copy stays generic and Spanish; no provider company names.

## Path Conventions

- Monorepo: `front-end/`, `back-end/`, `specs/` at repository root — all work is under `front-end/`
- Feature code: `front-end/src/features/checkout/` (plus `front-end/src/features/product/ProductPage.tsx`)
- Shared seams (do NOT extend `fetch` usage beyond them): `front-end/src/shared/api/http.ts`, `front-end/src/shared/api/payment-provider.ts`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification — confirm the 004 plumbing this feature builds on is present and green

- [X] T001 Confirm branch `005-finalize-checkout` checked out and install dependencies in `front-end/` (`npm install`)
- [X] T002 [P] Run the existing front-end gate (`cd front-end && npm run lint && npm run build && npm test`) to establish a green baseline before any change
- [X] T003 [P] Verify the merged `fix/summary-blank-screen` fix and guarded transaction enrichment are present in `front-end/src/features/checkout/OrderSummary.tsx` and `front-end/src/features/checkout/checkout.types.ts` (R10: `TransactionCreated` enrichment reads go through optional chaining with fallbacks)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lock the shared seams and constants every story depends on — no user story work starts until these pass

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Verify `front-end/src/shared/api/http.ts` accepts 200/202 as success and maps 404/409/422/429/503/network/timeout to the typed `ApiError { kind, message }` kinds of `front-end/src/shared/api/api.errors.ts` (contracts/checkout-finalization.md §1, §3); no edit expected
- [X] T005 [P] Verify polling constants `STATUS_POLL_INTERVAL_MS = 2000` and `STATUS_POLL_CEILING_MS = 40000` in `front-end/src/shared/constants.ts` (R5); no edit expected
- [X] T006 [P] Verify `front-end/src/features/checkout/persistence.ts` writes the version-2 whitelist document (`version`, `savedAt`, `currentStep`, `selectedProductId`, `quantity`, `delivery`, `transactionId`, `idempotencyKey`) and discards on version ≠ 2 / invalid shape / staleness > 24 h (FR-009, FR-012; research R2); no edit expected
- [X] T007 [P] Verify `front-end/src/features/checkout/usePaymentPolling.ts` polls only while `transactionId && paymentStatus === 'pending' && currentStep === 'finalStatus'`, every 2 s, capped at 40 s, stopping on the first final status (FR-007, SC-003); no edit expected
- [X] T008 [P] Confirm `src/__tests__/eslint-restrictions.spec.ts` keeps `fetch` boxed in `front-end/src/shared/api/` and passes (constitution invariant)

**Checkpoint**: Foundation verified — all 004 seams behave per contract; user story work can now begin

---

## Phase 3: User Story 1 - Review the summary and pay (Priority: P1) 🎯 MVP

**Goal**: Continuar creates the transaction with the Idempotency-Key header and shows the server-verbatim summary in a backdrop; Pagar (disabled in-flight) sends card token + installments + acceptedContracts, accepts 200/202, and polls to a final status

**Independent Test**: From filled card + delivery data, press Continuar → summary shows server amounts exactly in the `<dialog>` backdrop → press Pagar → polling reaches a final status screen

### Tests for User Story 1 ⚠️

> **NOTE: Write/extend these tests FIRST, ensure they FAIL (or document that the existing assertion already locks the behavior) before any implementation change**

- [X] T009 [P] [US1] Extend exact-amount rendering tests in `front-end/src/features/checkout/OrderSummary.spec.tsx`: render with a fixed `TransactionCreated` fixture and assert `productAmountInCents`, `baseFeeInCents`, `deliveryFeeInCents`, `totalInCents`, product and quantity match the fixture verbatim (formatting only, zero recomputation) inside the `<dialog>` backdrop, and that `reference` (format `TXN-` + 16 characters, per `specs/002-transacciones-pagos/contracts/rest-api.md`) is displayed verbatim as returned (SC-001, FR-002, FR-003)
- [X] T010 [P] [US1] Extend in-flight lock tests in `front-end/src/features/checkout/CheckoutModal.spec.tsx`: rapid double-taps on Continuar/Pagar leave the button disabled while `paymentStatus ∈ {creating, paying, pending}` and produce exactly one `fetch` per action (SC-002, FR-004)
- [X] T011 [P] [US1] Assert in `front-end/src/features/checkout/checkout.thunks.spec.ts` that `createTransaction` sends the `Idempotency-Key` header (identical on retry), `payTransaction` sends exactly `{ cardToken, installments, acceptedContracts: true }`, and both 200 and 202 advance the flow (FR-001, FR-005, FR-006)
- [X] T012 [P] [US1] Extend polling tests with fake timers in `front-end/src/features/checkout/usePaymentPolling.spec.tsx` asserting cadence and ceiling against the exported constants: one `GET /transactions/:id` every 2000 ms (±10 %), stop on the first final status with no extra request (first-poll DECLINED included), 40000 ms ceiling (SC-003, FR-007)
- [X] T013 [P] [US1] Assert the idempotency-key persistence/reuse rules in `front-end/src/features/checkout/idempotency.spec.ts` (16–64 chars of `[A-Za-z0-9_-]`, one key per purchase attempt, reused by every retry)

### Implementation for User Story 1

- [X] T014 [US1] Fix any gap exposed by T009 in `front-end/src/features/checkout/OrderSummary.tsx` so the summary renders the server `amounts` block verbatim with guarded enrichment reads (research R10)
- [X] T015 [US1] Fix any gap exposed by T010/T011 in `front-end/src/features/checkout/checkout.thunks.ts` and `front-end/src/features/checkout/CheckoutModal.tsx` (in-flight lock derived from `paymentStatus`; header/payload exactness; 200/202 handling) — keep all HTTP in `shared/api/`
- [X] T016 [US1] Fix any gap exposed by T012 in `front-end/src/features/checkout/usePaymentPolling.ts` (cadence/ceiling/stop conditions only; constants stay in `front-end/src/shared/constants.ts`)

**Checkpoint**: User Story 1 fully functional and testable independently — happy-path purchase completes

---

## Phase 4: User Story 2 - Payment failure paths (Priority: P2)

**Goal**: Each failure mode (409, 422, 429, 503/network, polling timeout) shows its own distinct Spanish error state with a retry/back path, and the in-flight lock is always released

**Independent Test**: Simulate each server error (409, 422, 429, 503, timeout) and verify the designated distinct error state, no auto-retry of invalid payloads, and a working retry/back action

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] Extend per-code error-mapping tests in `front-end/src/features/checkout/checkout.thunks.spec.ts`: 409 (`soldOut`/`idempotencyConflict`/`notPayable`), 422 (`contractsNotAccepted`/`invalidToken` — no automatic retry of the same invalid payload), 429 (`rateLimited` — no immediate auto-retry), 502 `PAYMENT_PROVIDER_REJECTED` (`providerRejected` — payment-rejected state, generic Spanish copy, manual retry allowed), 503/network (`providerUnavailable`/`network` — retryable), and lock release in every case (FR-008, SC-004, US2.6)
- [X] T018 [P] [US2] Extend error-state rendering tests in `front-end/src/features/checkout/PaymentStatus.spec.tsx`: each error kind renders its distinct state with its specific retry/back action and generic Spanish copy — including the 502 `providerRejected` payment-rejected state with its manual-retry action (US2.1–US2.4, FR-008)
- [X] T019 [P] [US2] Extend copy/mapping tests in `front-end/src/features/checkout/payment-errors.spec.ts`: add guidance copy for the status-unavailable (polling timeout) and service-unavailable states, keeping errors serializable `{ kind, message }` (never `Error` instances) (US2.5; research R7)

### Implementation for User Story 2

- [X] T020 [US2] Implement any missing kind→state mapping or lock-release branch in `front-end/src/features/checkout/checkout.thunks.ts` and `front-end/src/features/checkout/checkout.slice.ts` (depends on T017)
- [X] T021 [US2] Implement any missing error-state UI in `front-end/src/features/checkout/PaymentStatus.tsx` and guidance copy for timeout/service-unavailable in `front-end/src/features/checkout/payment-errors.ts` (depends on T018, T019)

**Checkpoint**: User Stories 1 AND 2 work independently — every failure mode has a distinct state and a recovery action

---

## Phase 5: User Story 3 - Refresh recovery (Priority: P2)

**Goal**: On reload, the version-2 document is validated, the server is asked for the real status before resuming (PENDING → resume polling; FINAL → show outcome; 404 → discard), version ≠ 2 is discarded, and a reload at the summary step returns to card entry

**Independent Test**: Reload at each step (card entry, summary, PENDING payment, final status) plus seeded corrupted/version-1 documents; verify the recovery matrix with zero duplicate `POST /transactions`

### Tests for User Story 3 ⚠️

- [X] T022 [P] [US3] Extend persistence tests in `front-end/src/features/checkout/persistence.spec.ts`: version-2 whitelist retained; version ≠ 2, bad shape, bad `idempotencyKey`, staleness > 24 h and corrupted storage discarded; no card-like key ever serialized (FR-009, FR-012; data-model "Discard / clear triggers")
- [X] T023 [P] [US3] Extend recovery tests in `front-end/src/features/checkout/checkout.thunks.spec.ts`: valid doc + `transactionId` triggers `readTransactionStatus` (GET /transactions/:id) **before** resume (FR-010); 200 PENDING → `finalStatus` + polling under a **fresh** 2 s/40 s window measured from the resume (FR-013, clarified 2026-10-14); 200 FINAL → `finalStatus` showing that outcome without polling (FR-013a, clarified 2026-10-14); 404 → document discarded + `startOver` (FR-011); transient lookup failure → recovery error with retry and the document KEPT; zero duplicate creates across reloads (SC-005)
- [X] T024 [P] [US3] Extend step-remap tests in `front-end/src/features/checkout/checkout.slice.spec.ts`: a restored `summary` step becomes `cardAndDelivery` — the summary is never restored directly (FR-014; research R3)

### Implementation for User Story 3

- [X] T025 [US3] Implement the 404-on-lookup → discard document + `startOver` branch and the transient-failure → recovery-error-keeps-document branch in `restoreProgress`/`readTransactionStatus` handling in `front-end/src/features/checkout/checkout.thunks.ts` (depends on T023)
- [X] T026 [US3] Implement the `summary` → `cardAndDelivery` restore remap in `front-end/src/features/checkout/checkout.slice.ts`/`checkout.thunks.ts` and keep the summary-never-restored guard in `front-end/src/features/checkout/CheckoutModal.tsx` (depends on T024)
- [X] T027 [US3] Add a selector for terminal step / has-progress in `front-end/src/features/checkout/checkout.selectors.ts` only if the recovery branches above need it (research: minimal)

**Checkpoint**: The full reload-recovery matrix passes — zero duplicate transactions in every reload scenario

---

## Phase 6: User Story 4 - Finalizar and return to the store (Priority: P3)

**Goal**: Finalizar removes the persisted document, clears all checkout progress (`startOver` semantics), navigates to the product page, and refetches stock from the server

**Independent Test**: Reach a terminal status screen, press Finalizar, verify the document is removed, state is cleared, and the product page shows freshly fetched stock

### Tests for User Story 4 ⚠️

- [X] T028 [P] [US4] Add Finalizar tests in `front-end/src/features/checkout/checkout.thunks.spec.ts`: `finalizeCheckout` removes the `checkout-progress` document, resets the slice (`step product`, `transactionId`/`idempotencyKey`/`delivery`/`transaction`/`paymentError` cleared, `paymentStatus idle`), navigates to the product page and issues a fresh product fetch (FR-015, FR-016, SC-006, US4.4)
- [X] T029 [P] [US4] Add finalize-reducer tests in `front-end/src/features/checkout/checkout.slice.spec.ts` (clear-on-Finalizar wiring, `startOver` semantics, subscriber never rewrites a stale document after the clear — contract §6)
- [X] T030 [P] [US4] Extend `front-end/src/features/checkout/CheckoutModal.integration.spec.tsx`: press Finalizar on approved/declined/terminal-error screens → modal closes, shopper lands on the product page, stock refetched (no pre-purchase cached value)

### Implementation for User Story 4

- [X] T031 [US4] Implement the finalize reducer (clear all checkout progress on Finalizar) in `front-end/src/features/checkout/checkout.slice.ts` (depends on T029)
- [X] T032 [US4] Implement the `finalizeCheckout` thunk (remove document + reset + navigate + fresh product fetch) in `front-end/src/features/checkout/checkout.thunks.ts` (depends on T028, T031)
- [X] T033 [US4] Wire the Finalizar action on all terminal states in `front-end/src/features/checkout/PaymentStatus.tsx` and the Finalizar handler (close, finalize, return to product page) in `front-end/src/features/checkout/CheckoutModal.tsx` (depends on T032)
- [X] T034 [US4] Ensure `front-end/src/features/product/ProductPage.tsx` lands the shopper after Finalizar with stock refetched from the server (depends on T032)

**Checkpoint**: All user stories independently functional — the purchase loop closes cleanly with no residual state

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Feature-wide verification and definition-of-done checks

- [X] T035 [P] Run the ESLint restriction test (`front-end/src/__tests__/eslint-restrictions.spec.ts`) and `npm run lint` — `fetch` remains boxed in `front-end/src/shared/api/` only
- [X] T036 [P] Run `cd back-end && npm run lint && npm run build && npm run test:cov` as regression evidence (back-end untouched)
- [X] T037 Run the full front-end gate: `cd front-end && npm run lint && npm run build && npm test && npm run test:cov` — green with ≥ 80 % on lines/branches/functions/statements
- [X] T038 Verify the privacy/language invariants: no card number/CVC field or card token in Redux state (dedicated tests: CARD_LIKE regex in `front-end/src/features/checkout/checkout.slice.spec.ts`, no-leak test in `front-end/src/features/checkout/CheckoutModal.integration.spec.tsx`), persistence or requests; Spanish UI copy throughout; backdrop matches the 004 `<dialog>` pattern; no horizontal overflow at 375×667 (FR-017, quickstart scenario 11)
- [X] T039 Run the quickstart.md manual validation scenarios 1–11 against a local back-end and fill in the "Validation results" section of `specs/005-finalize-checkout/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phases 3–6)**: All depend on Foundational phase completion
  - US2 (T017–T021) builds on US1's lock and thunks but its tests are independently definable
  - US3 (T022–T027) builds on the persistence seams verified in Phase 2; tests are independently definable
  - US4 (T028–T034) is the smallest increment and depends only on US1's final status screen existing
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational — no dependencies on other stories (MVP)
- **US2 (P2)**: Starts after Foundational — integrates with US1's `checkout.thunks.ts`/`checkout.slice.ts` but error paths are testable without US1's happy path
- **US3 (P2)**: Starts after Foundational — touches restore/persistence branches; keep summary-remap edits isolated from US1's modal edits to avoid file conflicts, or sequence after US1
- **US4 (P3)**: Should follow US1 (needs a terminal status screen to hang Finalizar on)

### Within Each User Story

- Tests (T009–T013, T017–T019, T022–T024, T028–T030) MUST be written and FAIL (or be confirmed to already lock the behavior) before implementation tasks
- Reducers/thunks before component wiring (US4: T031 → T032 → T033/T034)
- Story complete and checkpoint-validated before moving to the next priority

### Parallel Opportunities

Phase 2 (all [P]), and within each story all test tasks marked [P] can run in parallel:

```bash
# Phase 2 — all five verification tasks in parallel (different files)
T004 http.ts / T005 constants.ts / T006 persistence.ts / T007 usePaymentPolling.ts / T008 eslint-restrictions

# US1 tests in parallel:
T009 OrderSummary.spec.tsx / T010 CheckoutModal.spec.tsx / T011 checkout.thunks.spec.ts / T012 usePaymentPolling.spec.tsx / T013 idempotency.spec.ts

# US3 tests in parallel:
T022 persistence.spec.ts / T023 checkout.thunks.spec.ts / T024 checkout.slice.spec.ts

# US4 tests in parallel:
T028 checkout.thunks.spec.ts / T029 checkout.slice.spec.ts / T030 CheckoutModal.integration.spec.tsx
```

Note: T011/T017/T023/T028 all extend `checkout.thunks.spec.ts` — sequence those file edits across stories (US1 → US2 → US3 → US4) to avoid same-file conflicts.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline green)
2. Complete Phase 2: Foundational verification (seams and constants locked)
3. Complete Phase 3: User Story 1 (summary + pay + poll)
4. **STOP and VALIDATE**: quickstart scenarios 1–2 (happy path, in-flight lock)
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation verified
2. US1 → test independently → happy-path purchase (MVP!)
3. US2 → test independently → every error code has a distinct state and recovery path
4. US3 → test independently → reload at any step recovers correctly with zero duplicates
5. US4 → test independently → Finalizar closes the loop with fresh stock
6. Each story adds value without breaking previous stories (back-end untouched throughout)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to the spec.md user story for traceability
- Most tasks are **verification + targeted edits**: the plan reuses feature 004 plumbing; only the Finalizar flow (slice/thunk/components) and the recovery termination rules (404-discard, summary→card-entry) are new code
- Never extend `fetch` usage beyond `front-end/src/shared/api/http.ts` and the tokenization seam
- Amounts come from the server verbatim; card data, tokens and secrets are never persisted
- Verify tests fail before implementing; commit after each task or logical group
- Stop at any checkpoint to validate a story independently

---

## Phase 8: Convergence

**Purpose**: Close the two gaps found by `/speckit.converge` between the spec/plan/tasks and the implemented code (all other FR/SC/US items verified against the codebase; lint, 528 tests and coverage ≥ 80 % confirmed green)

- [ ] T040 HIGH Implement the status-unavailable/timeout state when the 40 s polling ceiling expires: on ceiling expiry `front-end/src/features/checkout/usePaymentPolling.ts` must dispatch a terminal client-timeout outcome (it currently only clears the interval, leaving the UI in the `pending` spinner indefinitely); add the timeout/status-unavailable kind and generic Spanish guidance copy in `front-end/src/shared/api/api.errors.ts` and `front-end/src/features/checkout/payment-errors.ts` (per T019); render the distinct timeout state with a recovery action (re-check status / Finalizar) in `front-end/src/features/checkout/PaymentStatus.tsx`; release the in-flight lock on that terminal outcome; update `front-end/src/features/checkout/usePaymentPolling.spec.tsx` (which currently locks the opposite behavior — "stops at the ceiling and leaves the pending state for a manual re-check") and the quickstart scenario 7 validation result to assert the timeout state replaces the spinner (US2/AC5, FR-007, SC-003; plan R5/R6; contract §3 — partial)
- [ ] T041 LOW Wire the `summary` → `cardAndDelivery` restore remap into the production restore path so a reloaded `summary` step is remapped before it reaches the store (dispatch `restored` or remap in `toCheckoutState`/`createAppStore` in `front-end/src/app/store.ts` / `front-end/src/features/checkout/checkout.thunks.ts`), keeping the `CheckoutModal.tsx` summary-never-restored guard as defense in depth; the `restored` reducer's remap currently never runs in production and the modal effect alone briefly renders the form under the "Resumen de la compra" title (plan R3 consequence, FR-014, T024/T026 — partial)
