# Phase 0 Research: Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery

**Feature**: `005-finalize-checkout` | **Date**: 2026-10-14

No `NEEDS CLARIFICATION` markers remained after loading the spec and the existing specs 002/003/004, so the
items below consolidate the decisions the design relies on. Each follows Decision / Rationale / Alternatives.
Most plumbing already exists from feature 004; these decisions lock its behavior against this feature's spec
(FR-001..FR-017, SC-001..SC-006) and add the Finalizar flow plus the recovery termination rules.

## R1 — API contract: reuse `specs/002-transacciones-pagos/contracts/rest-api.md` as the source of truth

- **Decision**: The SPA consumes exactly the three endpoints already implemented in feature 002 —
  `POST /transactions` (with the `Idempotency-Key` header), `POST /transactions/:id/payment`, and
  `GET /transactions/:id`. No new endpoint, no back-end change, no amount ever sent by the client.
  201/200/202 are the only success codes; 404/409/422/429/503 (and network/timeout) are the handled
  failure modes, each mapped to a typed `ApiError { kind, message }` in `src/shared/api/http.ts`.
- **Rationale**: The 002 contract already encodes the server-side guarantees this feature leans on:
  idempotent replay (`200` with the same `id`/`reference`), `409 IDEMPOTENCY_KEY_REUSED`, conflict codes
  (`INSUFFICIENT_STOCK`, `TRANSACTION_NOT_PAYABLE`), 422 codes (`CONTRACTS_NOT_ACCEPTED`,
  `INVALID_PAYMENT_TOKEN`), and the `GET /transactions/:id` lazy finalization that makes polling and
  refresh recovery safe. Principle I keeps one source of truth; redefining the API here would drift.
- **Alternatives considered**: (a) define a new "finalization" endpoint or a server-push channel for status
  — rejected: violates D6 (`GET /transactions/:id` is the source of truth; the front-end polls our API
  only) and Principle VII; (b) let the summary recompute fees client-side and only "display-check" the
  server — rejected: FR-003/SC-001 require server-verbatim amounts, and the server rejects client-sent
  amounts with 400.
- **Consequence**: `contracts/checkout-finalization.md` restates only the *consumed* surface (success
  shapes, error mapping, polling and recovery rules); it changes nothing server-side.

## R2 — Recovery document: reuse the 003 persistence contract at version 2, unchanged

- **Decision**: The recovery document required by FR-009 **is** the persisted checkout document from
  `specs/003-front-end-store/contracts/persistence.md`: one versioned document under `checkout-progress`
  at `PERSISTENCE_VERSION = 2`, containing exactly the whitelist `version`, `savedAt`, `currentStep`,
  `selectedProductId`, `quantity`, `delivery`, `transactionId`, `idempotencyKey`. No version bump, no new
  field: the transaction id, the idempotency key and the journey step needed for recovery are already in
  the whitelist. `idempotencyKey` validation stays `null` or 16–64 chars of `[A-Za-z0-9_-]`
  (`IDEMPOTENCY_KEY_PATTERN`); `quantity` stays an integer in `1..10` (`MAX_QUANTITY_PER_PURCHASE`).
- **Rationale**: Persistence is written by the existing hand-written store subscriber
  (`features/checkout/persistence.ts`) — shallow-compared writes, `savedAt` refreshed per write, discard on
  version mismatch / invalid shape / staleness > 24 h. Reusing it verbatim satisfies FR-009 "version number
  2 (whitelist-persisted)" without touching any write path, and keeps the card-pattern non-sensitive
  invariant test meaningful (card fields can never appear in the document).
- **Alternatives considered**: (a) introduce a **second**, separate recovery document for 005 — rejected:
  two writers racing on reload, duplicated idempotency keys, and a new migration surface for zero gain;
  (b) bump the document to version 3 by adding a `paymentStatus` or `installments` field — rejected: FR-012
  requires version ≠ 2 documents to be **discarded**, and payment status is deliberately **not** trusted from
  disk (see R4), so nothing new deserves persistence; (c) switch to `redux-persist` — rejected again (003
  decision): no whitelist control, no validation hooks.
- **Consequence**: FR-012 (version ≠ 2 → discard) is already the loader's behavior; this feature only adds
  the discard/clear triggers (404 on the reload lookup, Finalizar) and the step-remap rule (R3).

## R3 — A reload never restores the `summary` step; it returns to `cardAndDelivery`

- **Decision**: When the restored `currentStep` is `summary` (or any step whose continuation needs the
  in-memory card state), the journey resumes at `cardAndDelivery`. The summary is never rendered directly
  from a reloaded state. The idempotency key is kept, so the shopper pressing Continuar again replays
  `POST /transactions` (same key, same payload) and gets the existing purchase back (`200`, same
  `id`/`reference`).
- **Rationale**: (FR-014, FR-017) The single-use card token and the card display state live only in
  `CheckoutModal` component memory; after a reload they are gone, so the card must be re-entered anyway
  before Pagar can work. Rendering the summary from disk would also risk showing amounts older than the
  server's; the summary binds to the **server answer** of the replayed `createTransaction`, keeping SC-001
  true after recovery. Landing one step back is the smallest safe rewind.
- **Alternatives considered**: (a) restore the summary directly from the persisted document — rejected: no
  card token, stale amounts, and it leaks a shop-committed screen without the interaction that produced it;
  (b) discard the whole purchase when the reload happens at summary — rejected: unnecessary data loss; the
  whitelisted delivery data is still valid and FR-008's spirit is "restore the progress".
- **Consequence**: `restoreProgress`/`restored` map `summary` → `cardAndDelivery` before applying the
  restored state; the `finalStatus` step is the only step beyond card entry that restores directly (via the
  server lookup in R4).

## R4 — Server reconciliation before any resume (`GET /transactions/:id` is authoritative)

- **Decision**: On reload with a persisted `transactionId`, the app calls `readTransactionStatus`
  (which invokes `GET /transactions/:id`) **before** deciding how to resume, and branches on the result:
  - `200` + `PENDING` → land on `finalStatus` and resume polling under the same 2 s/40 s budget (FR-013);
  - `200` + a final status (`APPROVED`/`DECLINED`/`VOIDED`/`ERROR`) → land on `finalStatus` showing that
    outcome (no polling);
  - `404` (or `400` mapped to not-found) → discard the persisted document and start the checkout cleanly
    (FR-011, via `startOver`);
  - transient failure (`network`/`429`/`503`, kinds `network`/`rateLimited`/`server`) → show the recovery
    error state with a retry action and **keep the document** until a definitive answer exists.
  The local `paymentStatus`/enrichment are never trusted from disk; only the server view is.
- **Rationale**: (FR-010, edge cases) The provider never answers synchronously, so the persisted document
  can say nothing reliable about the payment outcome. Asking the server is what makes recovery
  idempotent: the back-end's lazy finalization (feature 002) resolves `PENDING` against the provider and
  returns the real status, so the front-end can never show a wrong "approved" or poll a purchase that no
  longer exists.
- **Alternatives considered**: (a) trust the persisted step/status and skip the lookup — rejected: could
  double-poll a finalized purchase or resurrect an expired reservation as if alive; (b) discard the document
  on *any* lookup error — rejected: a flaky network would wipe recoverable purchases, losing sales;
  (c) keep the document forever on `404` — rejected: 404 is definitive (transaction unknown/discarded);
  infinite retries against a dead purchase serve no one.
- **Consequence**: `readTransactionStatus` keeps `map400ToNotFound: true`; the `lastReadRequestId` guard
  ensures a stale in-flight read cannot overwrite a newer state; `restoreProgress` gains the 404-discard
  and summary→card-entry branches this feature specifies.

## R5 — Polling: `setInterval` hook, exactly 2 s cadence, 40 s hard ceiling, stop on first final status

- **Decision**: Reuse `usePaymentPolling` as-is: `window.setInterval` at `STATUS_POLL_INTERVAL_MS = 2000`,
  an absolute ceiling of `STATUS_POLL_CEILING_MS = 40000` from hook activation, active only while
  `transactionId && paymentStatus === 'pending' && currentStep === 'finalStatus'`. Each tick dispatches
  `readTransactionStatus(transactionId)`; the interval is cleared on the first final status (the `pending`
  guard flips off) or at the ceiling. At the ceiling without a final answer, the app shows the
  status-unavailable/timeout state (US2.5) instead of hanging. The same rules apply to a polling session
  resumed after reload (R4): a fresh 40 s window starts from *that* resume, since the spec applies the
  budget "per payment attempt".
- **Rationale**: (FR-007, FR-006, SC-003) The provider answers asynchronously; 2 s keeps UI latency low
  without hammering the API (~20 requests max per window), and 40 s is the agreed provider window
  (Assumptions). An interval (not chained `setTimeout`) gives a jitter-independent cadence; the absolute
  ceiling survives slow last requests. `transactionReceived` maps every `TransactionView.status` through
  `paymentStatusFromTransaction`, so stopping on "first final status" falls out of the state machine.
- **Alternatives considered**: (a) WebSocket / SSE push — rejected: D6 says no long-held requests; adds
  server surface and a dependency for a 40 s problem; (b) exponential backoff — rejected: spec fixes the
  cadence; backoff would break SC-003's 2 s ±10 % check; (c) poll unbounded until final — rejected: a
  stuck provider would pin the tab forever (edge case: provider timeout or permanent `PENDING`).
- **Consequence**: Timing assertions in tests use Jest fake timers against the exported constants, so cadence
  and ceiling are verified against the spec values, not literals.

## R6 — In-flight lock: derive from the `paymentStatus` state machine, not a new flag

- **Decision**: Pagar/Continuar are disabled while `paymentStatus ∈ { 'creating', 'paying' }` and while a
  polling session is active (`'pending'` on `finalStatus`). The lock is released by the same reducers that
  terminate the attempt — `transactionReceived` (success), `paymentFailed` (error), and the timeout's
  terminal state — so **every** terminal outcome, including every error kind, unlocks (US2.6). No separate
  `isSubmitting` boolean is introduced.
- **Rationale**: (FR-004, SC-002) A derived lock cannot diverge from the request lifecycle: rapid double-taps
  collapse onto one request because the second tap is impossible once status leaves `idle`/`error`. Combined
  with the persisted idempotency key (004, R3), the worst case of a bypassed button (e.g., replayed action)
  replays the *same* server-side purchase instead of creating a second one.
- **Alternatives considered**: (a) a dedicated `inFlight` boolean toggled by each thunk — rejected: two
  sources of truth for the same fact, and a missed `finally` leaves the UI locked forever; (b) debouncing the
  buttons — rejected: cosmetic only; doesn't prevent retries after a refresh.
- **Consequence**: The in-flight lock is a selector over `paymentStatus`; tests assert the disabled attribute
  in the three in-flight statuses and its release in each error path.

## R7 — Failure modes: one explicit state per code family, generic Spanish copy, no raw errors thrown

- **Decision**: Keep the 004 error mapping and attach a distinct UI state + recovery action per family:
  `409` → conflict state (`soldOut` / `idempotencyConflict` / `notPayable`) with a path back to review/edit;
  `422` → payment-rejected state (`contractsNotAccepted` / `invalidToken`) with **no automatic retry** of the
  invalid payload (the shopper re-enters the card); `429` → rate-limit state, never auto-retried; `503` /
  network / request timeout → service-unavailable state with a retry option; polling-ceiling expiry →
  status-unavailable state. Errors stay serializable `{ kind, message }` values (`api.errors.ts`), never
  `Error` instances; shopper copy stays generic, Spanish, and free of provider details.
- **Rationale**: (FR-008, SC-004; Principle IV adapted) The back-end's `{ statusCode, code, message, ... }`
  lets `http.ts` discriminate `409`/`422` precisely; mapping others by status alone suffices. Safe messages
  align with Principle V (no provider internals leak into the UI).
- **Alternatives considered**: (a) show the raw server `message` — rejected: leaks internals, violates the
  safe-error-messages rule, and breaks the "Spanish UI" requirement; (b) auto-retry `429`/`503` with backoff —
  rejected: spec requires distinct states and explicit shopper action; uncontrolled retries defeat rate
  limiting; (c) one generic red banner for all failures — rejected: each spec scenario demands a *specific*
  error state and its own recovery path.
- **Consequence**: `payment-errors.ts` gains (at most) guidance copy for the timeout and service-unavailable
  states; the kind→state mapping is exhaustively tested per code.

## R8 — Finalizar: one terminal action that clears the document and all local progress

- **Decision**: **Finalizar** (only on a final status the server returned: approved/declined/voided/error —
  never on a client-side failure or the 40 s timeout) dispatches a
  `finalizeCheckout` thunk that: (1) removes the `checkout-progress` document, (2) resets the checkout slice
  (`startOver` semantics: step `product`, `transactionId`/`idempotencyKey`/`delivery` cleared, `paymentStatus`
  `idle`), (3) navigates to the product page, and (4) triggers a fresh product fetch from the server — never
  reusing pre-purchase cached stock. The subscriber is also updated so that the falling whitelist writes a
  removal, not a stale rewrite.
- **Rationale**: (FR-015, FR-016, SC-006; 003 "clear rules": the shopper leaving the final step removes the
  document.) Clearing *everything* prevents accidental reuse of an idempotency key or transaction id after a
  terminal purchase, and a server refetch is the only way to satisfy "stock refreshed from the server".
- **Alternatives considered**: (a) keep the delivery data for convenience — rejected: the 003 contract says
  delivery data is personal and is deleted with the document at the end of the purchase; (b) navigate first
  and rely on the route to unmount state — rejected: Redux state would survive navigation; only an explicit
  reset satisfies "no residual state"; (c) trust the product slice's cache — rejected: FR-016 demands a fresh
  fetch post-purchase.
- **Consequence**: `checkout.slice.ts` reuses the existing terminal reducers (`startOver`/`purchaseCompleted`);
  `finalizeCheckout` additionally dispatches the product refetch; `PaymentStatus` wires Finalizar only on
  the server-returned final statuses, `CheckoutModal` closes over it, and `ProductPage` is the landing target.

## R9 — No new runtime dependency; every concern reuses an existing seam

- **Decision**: The feature adds **zero** dependencies: polling stays a `setInterval` hook; the backdrop
  stays the native `<dialog>` (`backdrop:bg-black/40`) in `CheckoutModal`; the idempotency key stays
  generated in `features/checkout/idempotency.ts` (`crypto.randomUUID`-based); persistence stays the
  hand-written subscriber from 003. All HTTP stays behind `shared/api/http.ts` (and the 004 tokenization
  seam), enforced by `eslint.config.js` and the `eslint-restrictions` test.
- **Rationale**: Principle VII (YAGNI) and the poll model of D6. Every dependency here would duplicate an
  audited seam; the single `fetch` allow-list is what keeps "card data never leaves the two seams"
  reviewable (Principle V).
- **Alternatives considered**: (a) a polling library or `react-query`-style refresh interval — rejected:
  dependency + cache semantics we would immediately have to override (FR-016 forbids stale stock);
  (b) `redux-persist` for the two new clear triggers — rejected: the whitelist and validation rules are its
  replacement, and rewriting them costs more than two `removeItem` calls.

## R10 — Presenter strategy: server amounts verbatim, guarded enrichment everywhere

- **Decision**: `OrderSummary` renders `amounts` (product amount, base fee, delivery fee, total), product
  and quantity exactly as returned by `POST /transactions` / `GET /transactions/:id`, formatting only
  (`cents / 100`, locale). Because `TransactionCreated` omits the `card`/`product`/`delivery`/
  `failureReason` enrichment, every read of those fields goes through optional chaining with a fallback to
  the selected product (name) and the delivery form (`DeliveryLocation`). No fee math, no totals, nothing
  re-derived (SC-001).
- **Rationale**: The server recomputes and is authoritative (FR-003); any duplicated math on the client is
  a tamper surface and a drift risk (Constitution: API design + source of truth).
- **Alternatives considered**: (a) compute the breakdown client-side and "check" it against the server —
  rejected: two formula copies contradicting SC-001 on any mismatch; (b) block rendering until the enriched
  view arrives (`fix/summary-blank-screen` lesson) — rejected: the create response is sufficient by design;
  guarding is cheaper than a second fetch.
- **Consequence**: The merged `fix/summary-blank-screen` and guarded-enrichment behavior are re-verified by
  exact-amount component tests in this feature.
