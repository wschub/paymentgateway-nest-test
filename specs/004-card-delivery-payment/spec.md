# Feature Specification: Card & Delivery Payment with Resilient Recovery

**Feature Branch**: `004-card-delivery-payment`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Out of stock at payment time; two buyers for the last unit; double click on pay; refresh in the middle of payment; provider timeout or `PENDING`; declined card; invalid or expired token; provider unavailable; retry with the same idempotency key; amount tampering (always recompute the amount on the server). Persistence: adding the idempotency key to the whitelist in persistence.ts requires bumping the document version (1 to 2) and keeping the discard-on-mismatch rule; update specs/003-front-end-store/contracts/persistence.md accordingly. Docs: front-end/README.md currently says card data lives \"in the payment provider's hosted flow\"; correct it to \"tokenized in the browser with the public key, never stored\" (hosted widget is not used, D5)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter the card and delivery details and pay (Priority: P1)

A shopper who has already chosen a product and quantity opens the card and delivery modal. The shopper fills in
the delivery details and the card form (number, expiry, CVC, cardholder name and installments), accepts the two
contracts, and presses **Continuar**. Continuing validates the form, tokenizes the card in the browser with the
provider's public key and creates the pending purchase; our systems only ever see a single-use token and the
card brand, never the number or CVC. The app then shows a summary with the server-computed amounts and a
**Pagar** button; paying sends the single-use token to start the payment. The token lives only in non-persisted
memory and is never part of the persisted progress document.

**Why this priority**: This is the interaction that actually turns a chosen product into a payment. Without it
no purchase can complete, so it is the minimum viable slice.

**Independent Test**: Open the modal for a chosen product, enter valid delivery and card data, accept both
contracts and press Continuar; confirm a pending purchase is started and the summary shows the server amounts;
then press Pagar and confirm the card number and CVC never appear in application state or persisted storage.

**Acceptance Scenarios**:

1. **Given** a product and quantity are chosen, **When** the shopper opens the modal, **Then** the delivery
   fields, the card fields (number, expiry, CVC, cardholder name, installments) and the two contract checkboxes
   are shown, and one idempotency key is generated for the purchase.
2. **Given** the shopper enters an invalid card number, an expiry in the past, a CVC of the wrong length or a
   cardholder name shorter than five characters, **When** the field loses focus or Continuar is pressed,
   **Then** a clear inline error is shown and no purchase is created.
3. **Given** valid delivery and card data and both contracts accepted, **When** the shopper presses Continuar,
   **Then** the card is tokenized in the browser using the public key only, a pending purchase is created, and a
   summary shows the server-computed amounts with a Pagar button.
4. **Given** the shopper has not accepted both contracts, **When** the shopper presses Continuar, **Then** the
   purchase is blocked and the shopper is told that both contracts must be accepted.
5. **Given** the shopper is on the summary, **When** the shopper presses Pagar, **Then** the single-use token
   is sent to start the payment and is discarded from memory once it has been used.
6. **Given** the card data has been entered, **When** any part of the application state or persisted storage is
   inspected, **Then** the card number and CVC are absent everywhere, and the single-use token is absent from
   the persisted document (it is held in memory only).

---

### User Story 2 - Confirm the payment and survive a refresh mid-payment (Priority: P2)

After paying, the shopper sees the payment being confirmed while the provider answers asynchronously. If the
shopper refreshes the page in the middle of the payment, the app restores the in-progress purchase (including
the idempotency key) and asks the back-end for the real transaction status instead of charging again. If the
shopper refreshes while on the summary step — after the pending purchase exists but before paying — the
single-use token (memory only) is gone, so the app returns to card entry with the same idempotency key and
replays the existing pending purchase rather than creating a new one. The shopper sees the final result once the
provider settles the transaction.

**Why this priority**: The provider never answers synchronously, so confirmation and refresh recovery are what
make the payment trustworthy; they build on the modal from Story 1.

**Independent Test**: Pay, refresh the page before the provider settles, and confirm the app restores the
purchase, re-reads the real status from the back-end and never starts a second payment for the same purchase.

**Acceptance Scenarios**:

1. **Given** a payment has just started, **When** the provider has not settled yet, **Then** the app shows a
   pending confirmation state and keeps checking the transaction status until it is final.
2. **Given** a payment is pending, **When** the shopper refreshes the page, **Then** the app restores the
   in-progress purchase, re-reads the real transaction status from the back-end and resumes confirmation.
3. **Given** the provider eventually approves, declines, voids or errors the transaction, **When** the status
   settles, **Then** the shopper is shown the corresponding final result.
4. **Given** a completed purchase, **When** the shopper later reloads, **Then** the transaction is not charged
   again.
5. **Given** the shopper is on the summary step (a pending purchase exists but payment has not started),
   **When** the shopper refreshes the page, **Then** the app returns to card entry with the same idempotency
   key and pressing Continuar replays the existing pending purchase instead of creating a new one.
6. **Given** a transaction id has been restored, **When** the payment step opens, **Then** the app shows a
   "verifying" state and never an approved or failed result until `GET /transactions/:id` responds; responses
   that arrive out of order are ignored so only the latest answer is shown.

---

### User Story 3 - Recover cleanly from every payment edge case (Priority: P3)

At payment time the app handles the awkward cases without losing the shopper's money or confusing them: the
product sells out before payment, two shoppers compete for the last unit, the shopper double-clicks pay, the
card is declined, the token is invalid or expired, the provider is unavailable or times out, a retry reuses the
same idempotency key, and any attempt to tamper with the amount is rejected because the server always recomputes
the total.

**Why this priority**: These are the failure paths that protect money and trust; they refine Stories 1 and 2 but
must each have a defined, safe behavior.

**Independent Test**: Force each condition (sold out at payment, duplicate pay click, declined card, expired
token, provider unavailable, tampered amount, retried idempotency key) and confirm the app surfaces a clear
message, never double-charges and never trusts a client-supplied amount.

**Acceptance Scenarios**:

1. **Given** the product runs out of stock before the shopper pays, **When** the purchase is attempted,
   **Then** the shopper is told the product is no longer available and is not charged.
2. **Given** two shoppers try to buy the last unit at the same time, **When** both attempt to pay,
   **Then** only one purchase reserves the unit and the other is told it is sold out, with no overselling.
3. **Given** the shopper double-clicks (or taps twice on) pay, **When** both requests are sent,
   **Then** only one purchase is created and the shopper is never charged twice.
4. **Given** the card is declined, **When** the provider settles the transaction, **Then** the shopper is shown
   a declined result, the reserved stock is released and the shopper may correct the card and retry.
5. **Given** the card token is invalid or has expired, **When** the payment is attempted, **Then** the shopper
   is asked to re-enter the card and no purchase is charged.
6. **Given** the provider is unavailable or does not answer in time, **When** the payment is attempted,
   **Then** the shopper sees a friendly temporary-failure message and can retry once the provider is reachable.
7. **Given** a payment attempt failed after the transaction was created and the purchase is still pending,
   **When** the shopper retries, **Then** the retry reuses the same idempotency key so the existing purchase is
   replayed instead of a new one being created; once the purchase is final (declined, voided or errored) the
   transaction id is cleared and a new key is generated for the retry.
8. **Given** a client sends a tampered or altered amount, **When** the purchase is processed, **Then** the
   server recomputes the amount from the catalog, fees and quantity and the tampered amount is ignored.

---

### Edge Cases

- Out of stock at payment time: the shopper is told and is not charged.
- Two buyers for the last unit: exactly one succeeds; the other is told it is sold out; stock never goes below
  zero.
- Double click (or double tap) on pay: a single purchase results, never a duplicate charge.
- Refresh in the middle of payment: the purchase, including the idempotency key, is restored and the real
  transaction status is re-read; no second charge.
- Provider timeout or a transaction that stays `PENDING`: the app keeps a pending-forever state with a
  re-check action until the provider settles, without blocking the shopper.
- Declined card: a declined result is shown, reserved stock is released, and the shopper can retry with another
  card.
- Invalid or expired card token: the shopper is asked to re-enter the card; the single-use token is never
  reused.
- Provider unavailable: a friendly temporary-failure message is shown and the payment can be retried.
- Retry with the same idempotency key: while the purchase is pending (network failure, provider unavailable,
  invalid token or an idempotent replay) the same key is reused and the existing purchase is replayed; the same
  key with a different product, quantity or customer email is rejected as a conflict. Once the purchase is
  finally declined, voided or errored (including `RESERVATION_EXPIRED`), the transaction id is cleared and a new
  key is generated for the retry.
- Amount tampering: any client-supplied amount is ignored; the server recomputes the total from the catalog
  price, fees and quantity.
- Amount shown in the summary must match the amount the server charges; the shopper is told if the price
  changed.
- The shopper presses Continuar but closes the modal before Pagar: a pending purchase already exists, so no
  payment is started; the pending purchase and its reserved stock expire on their own under the reservation-
  expiry rule (D9) and are released when the status is next read.
- The browser is refreshed while on the summary step: the single-use token (memory only) is gone, so the shopper
  re-enters the card; the same idempotency key replays the pending purchase and no second purchase is created.
- An already-completed or voided transaction is opened again: the app shows its final status and starts no new
  payment (a payment attempt returns `notPayable`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST collect the delivery details (full name up to 120 characters, email, phone matching
  the back-end `PHONE_PATTERN` `/^[0-9+ ]{7,20}$/` — 7–20 characters of digits, `+` and space only — address,
  city, region and optional notes up to 500 characters) and validate them (required fields, email shape and phone
  pattern) before continuing.
- **FR-002**: The system MUST collect the card details (number, expiry, CVC, cardholder name and installments)
  in the application's own form and MUST NOT use a provider-hosted widget or hosted checkout page.
- **FR-003**: The system MUST validate the card number (Luhn and length), a not-expired expiry, a valid CVC, a
  cardholder name of at least five characters, and a default of one installment, showing inline errors.
- **FR-004**: The system MUST require the shopper to accept both contracts (terms and conditions and personal
  data authorization) with links to each before continuing.
- **FR-005**: The system MUST tokenize the card in the browser using only the provider's public key; the card
  number and CVC MUST never reach or be stored in our systems, and the token is single-use and lives only in
  non-persisted memory until it is used.
- **FR-006**: The system MUST show, on a summary step reached after continuing, the amount breakdown (product
  amount, base fee and delivery fee) with the total, always obtained from the server, and a Pagar action that
  starts the payment.
- **FR-007**: The system MUST create the purchase transaction as pending and reserve stock atomically when the
  shopper continues (before payment is started).
- **FR-008**: The system MUST send a single idempotency key per purchase, generated when the modal opens, and
  MUST reuse the same key only while the purchase remains pending (network failure, provider unavailable,
  invalid token or an idempotent replay); once the purchase reaches a final declined, voided or error state, the
  system MUST clear the transaction id and generate a new key before a retry, so a retried purchase is never
  duplicated.
- **FR-009**: The system MUST never start a second purchase for a purchase that already exists, including when
  continue or pay is double-clicked or double-tapped.
- **FR-010**: The system MUST treat the back-end transaction record as the source of truth for payment status
  and MUST re-read it while the transaction is pending until it becomes final (approved, declined, voided or
  error).
- **FR-011**: The system MUST show a pending confirmation state after paying and MUST surface the final result
  once the transaction settles.
- **FR-012**: When the page is refreshed during payment, the system MUST restore the in-progress purchase,
  including its idempotency key, and re-read the real transaction status from the back-end without starting a
  new payment.
- **FR-013**: The system MUST persist the idempotency key as part of the non-sensitive purchase progress,
  required only once the flow has moved past the product step or a transaction id exists; the persisted
  progress document's schema version MUST be raised from 1 to 2 to reflect the added field, and a document whose
  version does not match MUST be discarded (the discard-on-mismatch rule is kept).
- **FR-014**: The system MUST NOT persist or store the card number, CVC or expiry at any time, and persisted
  progress MUST exclude any card data.
- **FR-015**: When the product is out of stock at payment time, the system MUST inform the shopper and MUST NOT
  charge.
- **FR-016**: When two shoppers compete for the last unit, the system MUST reserve the unit for at most one of
  them and MUST tell the other it is sold out, never allowing stock below zero.
- **FR-017**: When the card is declined, the system MUST show a declined result, release the reserved stock and
  allow the shopper to retry with another card.
- **FR-018**: When the card token is invalid or expired, the system MUST ask the shopper to re-enter the card
  and MUST NOT reuse a single-use token.
- **FR-019**: When the provider is unavailable or times out, the system MUST show a friendly temporary-failure
  message and allow a retry, without exposing internal error details.
- **FR-020**: The system MUST ignore any amount supplied by the client and MUST recompute the purchase amount
  from the catalog price, configured fees and quantity on the server; a mismatched client amount MUST NOT
  change what is charged.
- **FR-021**: The system MUST reject reusing an idempotency key with a different product, quantity or customer
  email as a conflict, and MUST replay the existing purchase when the key and payload match.
- **FR-022**: The system MUST return and display final results of approved, declined, voided and error, and
  MUST release reserved stock for every final state that is not approved.
- **FR-023**: The front-end documentation that describes the payment integration MUST state that card data is
  tokenized in the browser with the public key and is never stored, and MUST NOT claim that card data lives in
  a provider-hosted flow.
- **FR-024**: Front-end and back-end automated tests (Jest) MUST cover the payment edge cases above, keeping
  overall coverage above 80% in each app.
- **FR-025**: The system MUST present the payment as two steps: **Continuar** validates the delivery and card
  data and the contracts, tokenizes the card and creates the pending purchase; then a **summary** shows the
  server amounts and a **Pagar** action that starts the payment for the created purchase.
- **FR-026**: The single-use card token MUST exist only in non-persisted memory between Continuar and Pagar and
  MUST NOT be written to the persisted progress document or any other storage.

### Key Entities *(include if feature involves data)*

- **Transaction**: A purchase attempt; attributes include an identifier, a unique reference, an idempotency key,
  the status (`PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`), the computed amount breakdown, the provider
  transaction id, the card brand, the last four digits and the installments. It never holds the card number or
  CVC.
- **Card token**: A single-use reference produced in the browser with the public key; it stands in for the card
  number during payment, lives only in non-persisted memory between Continuar and Pagar, and is never persisted.
- **Delivery data**: The shopper's delivery details, kept only for the purchase and not outliving it.
- **Checkout progress (persisted)**: The non-sensitive in-flight purchase; attributes include the current step,
  the selected product, the quantity, the delivery data, the transaction id/reference/status and the
  idempotency key, written as a versioned document (version 2). It never contains the card token or any card
  data.
- **Amount breakdown**: Product amount, base fee and delivery fee, always recomputed by the server and shown as
  the total.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can complete a purchase from the card-and-delivery modal in a single sitting, with the
  final result shown once the provider settles.
- **SC-002**: 100% of attempts to charge the same purchase twice — double-click, refresh mid-payment or a
  retried idempotency key — result in exactly one transaction.
- **SC-003**: 100% of amount-tampering attempts leave the charged amount equal to the server-recomputed total.
- **SC-004**: When the last unit is contested by two shoppers, exactly one purchase succeeds and the stored
  stock never drops below zero.
- **SC-005**: Card number and CVC appear in zero persisted documents and zero application state values before,
  during and after a purchase.
- **SC-006**: After a refresh during payment, the shopper's progress and the real transaction status are
  restored without a second charge.
- **SC-007**: Each defined edge case (sold out, double click, declined, invalid/expired token, provider
  unavailable, timeout/`PENDING`, retried idempotency key, tampered amount) shows a clear, non-technical message
  and leaves the shopper able to continue or retry.
- **SC-008**: Automated test coverage stays above 80% in both the front-end and the back-end.
- **SC-009**: The persisted purchase progress document is version 2, and a document with any other version is
  discarded on load.

## Assumptions

- The catalog, transaction-creation and transaction-status endpoints already exist in the back-end, and the
  checkout configuration (public key, API base URL and contract links) is available without secrets.
- Payments run against the provider's sandbox only, and the browser tokenizes cards with the public key while
  the back-end holds the private and integrity secrets.
- The payment provider never answers synchronously; the pending transaction is finalized when the provider
  settles, and the app re-reads the status rather than holding a request open.
- The flow is two steps: **Continuar** validates, tokenizes and creates the pending purchase; a **summary** shows
  the server amounts and **Pagar** starts the payment. The single-use token lives only in non-persisted memory,
  so a refresh on the summary step re-enters the card and replays the same pending purchase.
- The idempotency key is generated once when the modal opens and is reused only while the purchase is pending;
  after a final declined, voided or error state the transaction id is cleared and a new key is generated. The key
  is required only once the flow has moved past the product step or a transaction id exists.
- A pending purchase can be created at Continuar without being paid; if payment is never started, the pending
  purchase and its reserved stock expire under the reservation-expiry rule (D9).
- The provider event webhook is treated as optional and out of scope for this feature; the front-end reads the
  status from our API only.
- One product with a quantity per purchase (no multi-product cart), with the ten-unit maximum kept in sync with
  the back-end.
- Checkout is a guest flow with no customer authentication.
- Prices and fees are stored in integer minor units (COP multiplied by 100) and shown as Colombian pesos; base
  fee and delivery fee are configuration values.
- The persisted progress document changes from version 1 to version 2 solely to add the idempotency key to the
  non-sensitive whitelist; the discard-on-mismatch rule remains, so any older or unknown version is discarded.
- The persistence contract at `specs/003-front-end-store/contracts/persistence.md` and the front-end
  `README.md` payment description are updated as part of this feature to match the above.
- An idempotency key is a non-sensitive value generated per purchase and reused on retry; it is safe to persist.
