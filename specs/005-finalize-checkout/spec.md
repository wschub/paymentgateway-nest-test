# Feature Specification: Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery

**Feature Branch**: `005-finalize-checkout`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Shopper completes the purchase from a summary shown in a backdrop component. The summary shows product, quantity, product amount, fee breakdown (product amount, base fee, delivery fee), base fee and total, rendered exactly as the server returns them. Pagar is disabled while a request is in-flight. The flow calls createTransaction with an Idempotency-Key header, then payTransaction with card token + installments + acceptedContracts, then polls GET /transactions/:id every 2 s for up to 40 s. It must handle 202/200, 409, 422, 429 and 503. The final status screen offers Finalizar, which clears local progress and returns to the product page with refreshed stock. Refresh recovery: persist the idempotency key in a whitelist persisted document at version 2; 404 discards the document; the document is versioned; on reload the app asks GET /transactions/:id for the real status; if PENDING it resumes polling; refreshing at the summary step returns the shopper to card entry."

## Clarifications

### Session 2026-10-14

- Q: If the reload lookup `GET /transactions/:id` returns a final status (approved or declined) instead of PENDING or 404, what should the app show? → A: Show the final status screen directly with the **Finalizar** action.
- Q: When resuming polling after a reload for a PENDING transaction, does the 40-second timeout window restart from the reload or continue from the original payment acceptance? → A: Restart a fresh 40 s window on each polling resume after reload (no start timestamp is persisted).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review the summary and pay (Priority: P1)

The shopper has entered card and delivery data (feature 004) and presses **Continuar**. The app creates the transaction (`createTransaction` with an `Idempotency-Key` header) and opens a **backdrop component** with the purchase summary: product, quantity, product amount, fee breakdown (product amount, base fee, delivery fee) and total — all rendered **exactly as the server returns them**, with no client-side recomputation. From the summary the shopper presses **Pagar**, which calls `payTransaction` with the card token, the chosen installments and the accepted contracts, then polls the transaction status until it reaches a final state.

**Why this priority**: This is the happy path that completes a purchase; without it no sale can happen.

**Independent Test**: From a state with card and delivery data filled, press Continuar, verify the summary renders server-provided amounts, press Pagar, and verify a successful payment reaches a final status screen.

**Acceptance Scenarios**:

1. **Given** the shopper has completed card and delivery data, **When** they press **Continuar**, **Then** the app calls `createTransaction` with an `Idempotency-Key` header and shows the summary in a backdrop component.
2. **Given** the summary is shown, **When** it renders, **Then** product, quantity, product amount, fee breakdown (product amount, base fee, delivery fee) and total match exactly the values returned by the server, with no client-side recalculation.
3. **Given** a request (create, pay or poll) is in-flight, **When** the summary is visible, **Then** the **Pagar** button is disabled and the shopper cannot trigger duplicate requests.
4. **Given** the shopper confirms with **Pagar**, **When** the app pays, **Then** it calls `payTransaction` with the card token, the selected installments and `acceptedContracts`.
5. **Given** the pay request accepted (202/200), **When** the transaction is not yet final, **Then** the app polls `GET /transactions/:id` every 2 seconds for up to 40 seconds, until a final status is reached.
6. **Given** the payment reaches a final status, **When** polling ends, **Then** the shopper sees the final status (approved or declined) with a **Finalizar** action.

---

### User Story 2 - Payment failure paths (Priority: P2)

When creation, payment or polling fails, the shopper sees a clear, specific error state for each failure mode and can retry or go back, without losing the data already entered.

**Why this priority**: Failures are common (declined cards, exhausted stock, rate limits) and a wrong message or a lost retryPath causes abandonment; still, the happy path must exist first.

**Independent Test**: For each simulated server error (409, 422, 429, 503, timeout), verify the shopper sees the corresponding error state and a way to retry or go back.

**Acceptance Scenarios**:

1. **Given** the shopper triggers an action, **When** the server responds `409` (e.g., insufficient stock or transaction not payable), **Then** the app shows the conflict error state and offers a path back to review/edit.
2. **Given** the shopper presses **Pagar**, **When** the server responds `422` (e.g., invalid token or unprocessable payload), **Then** the app shows the payment-rejected error state without retrying the same invalid payload automatically.
3. **Given** any request, **When** the server responds `429`, **Then** the app shows a rate-limit error state and does not hammer the server with immediate retries.
4. **Given** any request, **When** the server responds `503` or is unreachable, **Then** the app shows a service-unavailable error state with a retry option.
5. **Given** polling runs for the full 40 seconds without a final status, **When** the window expires, **Then** the app shows a status-unavailable/timeout state instead of hanging indefinitely.
6. **Given** any failure, **When** the error state is shown, **Then** the in-flight lock is released so the shopper can act again.

---

### User Story 3 - Refresh recovery (Priority: P2)

If the shopper reloads the page mid-checkout, the app restores the journey from a persisted, versioned document and reconciles with the server instead of duplicating the purchase or losing the transaction.

**Why this priority**: Mobile shoppers reload frequently; recovery prevents double charges and lost sales, but it only matters once the payment flow exists.

**Independent Test**: Start a purchase up to each step, reload the page at each step, and verify the app resumes correctly (or restarts cleanly) without creating duplicate transactions.

**Acceptance Scenarios**:

1. **Given** a checkout in progress, **When** the transaction is created, **Then** the app persists the transaction id, the idempotency key and the journey state in a **version 2** persisted document.
2. **Given** a persisted document exists, **When** the page reloads, **Then** the app calls `GET /transactions/:id` to ask the server for the real transaction status before deciding how to resume.
3. **Given** the reload lookup returns a **PENDING** transaction, **When** the journey resumes, **Then** the app resumes polling every 2 s under a **fresh 40 s window** measured from the resume (the window restarts; no start timestamp is persisted).
4. **Given** the reload lookup returns a **final status** (APPROVED, DECLINED, VOIDED or ERROR), **When** the journey resumes, **Then** the app shows the final status screen directly with the **Finalizar** action, without resuming polling.
5. **Given** the reload lookup returns **404** (transaction unknown/discarded), **When** the journey resumes, **Then** the app discards the persisted document and starts the checkout cleanly.
6. **Given** the persisted document has an older version (not version 2), **When** the page loads, **Then** the app discards it and starts cleanly (no migration of stale data).
7. **Given** the shopper reloads while at the **summary step**, **When** the journey resumes, **Then** the app returns the shopper to the card entry step (the summary is never restored directly).

---

### User Story 4 - Finalizar and return to the store (Priority: P3)

From the final status screen the shopper presses **Finalizar**, which clears all local checkout progress and returns to the product page, where the stock is shown refreshed from the server.

**Why this priority**: It closes the loop cleanly, but the purchase is already complete (or failed) before this step.

**Independent Test**: Reach a final status, press Finalizar, and verify local state is cleared and the product page shows stock freshly fetched from the server.

**Acceptance Scenarios**:

1. **Given** a final status screen (approved, declined or error terminal), **When** the shopper presses **Finalizar**, **Then** the app clears the persisted checkout document and all local progress.
2. **Given** progress has been cleared, **When** the app navigates back, **Then** the shopper lands on the product page.
3. **Given** the shopper returns to the product page, **When** the page renders, **Then** the stock is fetched fresh from the server (no stale cached stock from before the purchase).
4. **Given** a completed checkout, **When** the shopper has pressed Finalizar, **Then** no residual state (idempotency key, transaction id, card data) remains to be reused accidentally.

---

### Edge Cases

- What happens if the shopper double-taps **Pagar** or **Continuar**? The button is disabled while any request is in-flight, so only one request is ever active; the idempotency key additionally protects against duplicated transactions server-side.
- What happens if polling ends at 40 s exactly while the last response is in-flight? The timeout state is shown; the transaction may still resolve server-side and will be discovered on a later recovery via `GET /transactions/:id`.
- What happens if the server returns a final DECLINED status on the first poll? Polling stops immediately; no further poll requests are made.
- What happens if the reload lookup `GET /transactions/:id` itself fails (network/503)? The app shows a recovery error state with retry, keeping the persisted document intact until a definitive answer (real status or 404) is obtained.
- What happens if the shopper reloads during card tokenization (before `createTransaction`)? There is no persisted transaction document, so the app simply restarts the checkout flow.
- What happens if stock is exhausted between summary display and Pagar? The pay request fails with `409` and the shopper is routed to the conflict error path (US2).
- What happens if the persisted document exists but local storage is corrupted/unreadable? It is treated as absent and the checkout restarts cleanly.
- What happens if the persisted document is older than 24 hours? A stored document whose `savedAt` is older than 24 hours is discarded and the checkout restarts cleanly (staleness rule of the version-2 whitelist).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST create the transaction via `createTransaction` including an `Idempotency-Key` header before showing the summary.
- **FR-002**: The summary MUST be presented in a backdrop component displayed over the shop.
- **FR-003**: The summary MUST display product, quantity, product amount, fee breakdown (product amount, base fee, delivery fee) and total exactly as returned by the server, without client-side recomputation of amounts.
- **FR-004**: The **Pagar** action MUST be disabled while any request (create, pay, or poll) is in-flight.
- **FR-005**: On **Pagar**, the app MUST call `payTransaction` with the card token, the selected number of installments and `acceptedContracts`.
- **FR-006**: The app MUST treat 200 and 202 as successful/accepted responses and continue the flow accordingly.
- **FR-007**: After payment acceptance, the app MUST poll `GET /transactions/:id` every 2 seconds for up to 40 seconds, stopping as soon as a final status is received.
- **FR-008**: The app MUST handle 409, 422, 429, 502 and 503 responses with distinct, specific error states and recovery actions (retry or go back as appropriate); a `502 PAYMENT_PROVIDER_REJECTED` maps to a payment-rejected state with a generic Spanish message and a manual retry allowed (no automatic retry of the rejected payment).
- **FR-009**: The app MUST persist a checkout recovery document containing at least the transaction id, the idempotency key and the journey step, stored with version number 2 (whitelist-persisted).
- **FR-010**: On reload with a persisted document, the app MUST query `GET /transactions/:id` for the real status before resuming any journey step.
- **FR-011**: If the reload lookup returns 404, the app MUST discard the persisted document and restart checkout cleanly.
- **FR-012**: If the persisted document version is not 2, the app MUST discard it and restart cleanly.
- **FR-013**: If the reloaded transaction is PENDING, the app MUST resume polling under the same 2 s / 40 s rules, with **a fresh 40 s window measured from the resume** (the window restarts on each reload; the recovery document does not persist a start timestamp).
- **FR-013a**: If the reload lookup returns a final status (APPROVED, DECLINED, VOIDED or ERROR), the app MUST display the final status screen directly with the **Finalizar** action, without resuming polling.
- **FR-014**: A reload occurring at the summary step MUST return the shopper to the card entry step rather than restoring the summary.
- **FR-015**: The final status screen MUST offer a **Finalizar** action that clears all local checkout progress (persisted document, transaction id, idempotency key) and navigates to the product page.
- **FR-016**: After Finalizar, the product page MUST show stock freshly fetched from the server.
- **FR-017**: The interface MUST remain in Spanish and follow the established backdrops/modal patterns from feature 004, reusing that feature's card and delivery data rather than rebuilding it.

### Key Entities *(include if feature involves data)*

- **Transaction**: Server-owned purchase record; key attributes: id, status (PENDING, final approved/declined states), product, quantity if exposed, amounts and fee breakdown as returned by the server.
- **Checkout Summary**: Presentation of the transaction amounts — product, quantity, product amount, base fee, delivery fee, total — sourced verbatim from the server response in the backdrop component.
- **Recovery Document (v2)**: Client-persisted, whitelisted state for refresh recovery; attributes: version (2), transaction id, idempotency key, journey step; discarded on 404, on version mismatch or on Finalizar.
- **Payment Request**: Payload for `payTransaction`; attributes: card token, installments, acceptedContracts.
- **Idempotency-Key**: Client-generated unique key per purchase attempt, sent on `createTransaction` and persisted for recovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of displayed summary amounts (product amount, fees, total) match the server response values exactly, with zero client-side recalculation, in automated comparison tests.
- **SC-002**: Rapid repeated taps on Pagar or Continuar result in exactly one in-flight request and exactly one server-side transaction per purchase attempt (verified via idempotency).
- **SC-003**: Polling sends one status request every 2 s (±10%) and never exceeds 40 s per payment attempt; polling stops on the first final status with no extra requests.
- **SC-004**: Each of the error codes 409, 422, 429 and 503 produces its designated error state and a working retry/back path in 100% of tested cases.
- **SC-005**: After a reload at any step of an in-progress checkout, the shopper recovers correctly (resume polling, restart cleanly, or return to card entry per the rules) in 100% of tested reload scenarios, with zero duplicate transactions.
- **SC-006**: After Finalizar, no checkout data persists locally and the product page displays stock fetched after the purchase (not cached), verified in 100% of completion tests.

## Assumptions

- Feature 004 (card and delivery modal, card tokenization) exists and is reused as-is; this feature consumes its card token and delivery data without rebuilding them.
- The REST API contract in `specs/002-transacciones-pagos/contracts/rest-api.md` (createTransaction, payTransaction, GET /transactions/:id) is the source of truth and is already implemented server-side, including idempotency support and the documented status set.
- The server is the sole source of truth for amounts and fees; the client never needs to compute or validate totals.
- A 40-second polling window is sufficient for the payment provider to reach a final status in the normal case.
- Persisted state uses browser local storage via the existing persistence/whitelist mechanism; only the whitelisted recovery document survives a reload (sensitive card data is never persisted).
- The interface language is Spanish and the design is mobile-first, consistent with the rest of the SPA.
- Shoppers may lose connectivity or reload at any point; recovery must never charge twice and never lose a server-accepted transaction.
