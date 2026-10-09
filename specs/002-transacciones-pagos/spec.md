# Feature Specification: Transactions and Card Payment Processing

**Feature Branch**: `002-transacciones-pagos`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Transactions and card payment processing for the checkout store (back-end). Source of truth: docs/requirements.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay for a product by card and get an approved result (Priority: P1)

A shopper picks one product and a quantity on the store, provides their customer and delivery details, accepts the two contracts, and pays with a card that is tokenized in the browser. The store records a pending purchase, charges the card through the payment provider's sandbox, and once the provider approves, marks the purchase as approved, assigns the product to the customer's delivery, and leaves the stock reduced by the purchased quantity.

**Why this priority**: It is the core value of the feature: a real, end-to-end approved purchase is the minimum viable outcome.

**Independent Test**: Run the whole path with the approved test card and a product that has enough stock; the purchase must end approved, a delivery must be assigned, and the stock must decrease by the quantity.

**Acceptance Scenarios**:

1. **Given** a product with enough stock and valid customer, delivery, card and contract-acceptance data, **When** the shopper pays with the approved test card, **Then** the purchase ends approved, a delivery is assigned, and the stock decreases by the purchased quantity.
2. **Given** a purchase that is still being decided by the provider, **When** its status is requested, **Then** it is reported as pending and no delivery is assigned yet.

---

### User Story 2 - A declined or failed payment releases the reserved stock (Priority: P2)

A shopper pays with a card that the provider declines (or that ends in error). The store records the outcome, assigns no delivery, and returns the reserved units to stock so other shoppers can buy them.

**Why this priority**: Correct stock is a core business rule; a failed payment must never consume inventory.

**Independent Test**: Pay with the declined test card and then with an error card; in both cases the purchase must end without a delivery and the stock must return to its original value.

**Acceptance Scenarios**:

1. **Given** a product with enough stock, **When** the shopper pays with the declined test card, **Then** the purchase ends declined, no delivery is assigned, and the stock returns to its previous value.
2. **Given** a product with enough stock, **When** the shopper pays with a card that ends in error, **Then** the purchase ends in error, no delivery is assigned, and the stock returns to its previous value.
3. **Given** a purchase whose payment was never started and that is older than the reservation time, **When** the purchase is next read (or a new purchase needs its stock), **Then** it is voided with reason `RESERVATION_EXPIRED` and its reserved stock returns.

---

### User Story 3 - Safe retries and no overselling (Priority: P3)

A shopper who double-clicks or retries, or two shoppers competing for the last unit, must never produce duplicate purchases or charges, and must never oversell the product.

**Why this priority**: Protects the business from duplicate charges and negative stock under real-world concurrency.

**Independent Test**: Repeat the same creation request with the same idempotency key, and race two buyers for the last unit; only one purchase should ever be charged.

**Acceptance Scenarios**:

1. **Given** the same idempotency key, **When** the shopper creates the purchase twice, **Then** exactly one purchase exists and the same reference and identifier are returned.
2. **Given** exactly one unit left, **When** two buyers pay at the same time, **Then** exactly one purchase is accepted and the stock never becomes negative.
3. **Given** a purchase that already reached a final status, **When** a payment is attempted again, **Then** the attempt is rejected as not payable and no second charge occurs.

---

### User Story 4 - Payment events reconcile the status idempotently (Priority: P4)

The provider can notify the store about payment events. The store verifies each event is authentic, reconciles the purchase status, and ignores events it has already processed.

**Why this priority**: Optional and lower priority; it improves robustness but the flow is already correct through status polling.

**Independent Test**: Send a valid event, a duplicate, and a tampered event; only the valid first event should change state.

**Acceptance Scenarios**:

1. **Given** a pending purchase, **When** an authentic event reports a final status, **Then** the purchase is reconciled to that status following the same finalization rules.
2. **Given** an event already processed, **When** it arrives again, **Then** it is ignored and the state does not change.
3. **Given** an event with an invalid checksum, **When** it arrives, **Then** it is rejected and no state changes.

---

### Edge Cases

- The product is out of stock at payment time, or the requested quantity exceeds the available stock.
- The quantity is zero or negative (rejected with 400), or the product does not exist (404).
- The card token is missing, invalid or already used.
- The shopper has not accepted both contracts.
- The client sends amounts that differ from the server-computed amounts (tampering).
- The provider times out, is unavailable, or keeps the purchase pending.
- The page is refreshed while the payment is in progress (status must be recoverable from the provider).
- The number of installments is omitted (defaults to one).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before paying, the store MUST expose the non-secret configuration the browser needs to tokenize a card (the public key and the API base URL) together with the links of the two contracts to accept. No secret may be exposed.
- **FR-002**: The store MUST create a pending purchase from a product, a quantity, customer data and delivery data, computing all amounts on the server (product amount, base fee, delivery fee) and returning the breakdown. It MUST never trust amounts sent by the client.
- **FR-003**: Creating a pending purchase MUST honor an `Idempotency-Key` header of 16 to 64 characters from letters, digits, dash or underscore, so that retries and double-clicks never create duplicate purchases. Reusing the same key with a different product, quantity or customer email MUST be rejected with 409 `IDEMPOTENCY_KEY_REUSED`; the same key with the same payload MUST replay the existing purchase.
- **FR-004**: Creating a pending purchase MUST reserve stock atomically and conditionally, so the stock never becomes negative and two buyers never both receive the last unit.
- **FR-005**: The store MUST start the payment of a pending purchase using a single-use card token, the number of installments and the acceptance of both contracts, and MUST build the provider request with a server-computed integrity signature. The card number and CVC MUST never reach the store.
- **FR-006**: The store MUST persist only non-sensitive card details (brand, last four digits, installments) and MUST never persist the card number or CVC.
- **FR-007**: The store MUST expose the current status of a purchase as a transaction view: `id`, `reference`, `status` (pending, approved, declined, voided or error), `quantity`, `amounts` (`productAmountInCents`, `baseFeeInCents`, `deliveryFeeInCents`, `totalInCents`), `card` (`brand`, `lastFour`, `installments`, or `null`), a `product` summary (`id`, `name`, `quantity`), a `delivery` summary (`status`, `address`, `city`, `region`, or `null`) and `failureReason` (or `null`), with no card number, CVC or secrets.
- **FR-008**: While a purchase is pending, requesting its status MUST consult the provider and finalize the purchase idempotently once the provider's status is final (approved, declined, voided or error): store the result, assign the delivery when approved, and release the reserved stock when declined, voided or in error.
- **FR-009**: A purchase that is not pending MUST NOT be payable again, so the same purchase is never charged twice.
- **FR-010**: A purchase MUST have a unique reference and an idempotency key, and a status among pending, approved, declined, voided and error.
- **FR-011**: Customer and delivery data MUST be validated and persisted.
- **FR-012**: Errors MUST use safe messages and a consistent shape, and secrets MUST never appear in responses or logs.
- **FR-013** *(optional, lower priority)*: The store SHOULD ingest provider payment events, verify their checksum with the events secret, and ignore duplicate events.
- **FR-014**: A purchase whose payment was never started and that is older than a configurable reservation time (default 15 minutes) MUST be voided with reason `RESERVATION_EXPIRED` and its reserved stock MUST be returned. This release is lazy: it runs before reserving stock for a new purchase and when the status of a purchase is read.

### Key Entities *(include if feature involves data)*

- **Purchase (Transaction)**: the purchase of a product; holds a unique reference, an idempotency key, a status, the amount breakdown (product amount, base fee, delivery fee, total), the provider transaction identifier, the card brand, the last four digits, the installments and timestamps. Note: `Purchase` and `Transaction` are the same concept; the API, database and code use `Transaction`.
- **Product**: the item being bought; has a price and available stock that is reserved and released by purchases.
- **Customer**: the person buying; holds contact data (name, email, phone).
- **Delivery**: the destination of the product; holds address, city, region and optional notes; it is associated to a purchase and assigned only when the payment is approved.
- **Payment event**: a notification from the provider; carries a checksum and identifiers used to reconcile a purchase status, processed at most once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The full purchase path succeeds against the provider sandbox for both the approved and the declined test cards (approved leads to an assigned delivery and reduced stock; declined leads to no delivery and restored stock). This is a manual validation through `quickstart.md`; automated tests never call the sandbox.
- **SC-002**: Repeating the creation request with the same idempotency key produces exactly one purchase and never a duplicate charge.
- **SC-003**: Concurrent attempts to buy the last unit result in at most one confirmed purchase, and the stock never becomes negative.
- **SC-004**: After a refresh while a payment is in progress, the reported status matches the provider's final status.
- **SC-005**: No secret and no full card number appears in any API response or log.
- **SC-006**: Automated back-end test coverage stays at or above 80% for the touched code.

## Assumptions

- Sandbox credentials are provided through environment variables only, and only the local environment holds their values.
- Money is handled as integers in COP cents; store prices are already expressed in cents.
- The base fee is 3,000 COP and the delivery fee is 9,000 COP, both configurable.
- Checkout is guest-only; there is no customer authentication.
- One product with a quantity is bought per purchase (no multi-product cart).
- The provider never answers synchronously; the final status is obtained by polling the provider while the purchase is pending.
- The card is tokenized in the browser; the store only ever receives a token, never the card number or CVC.
- The public key is used for tokenization and to obtain the acceptance tokens; the private (server-side) key authorizes creating the transaction.
- A purchase whose payment already started and that stays pending keeps its reserved stock (known limitation); only reservations whose payment never started are reclaimed by the reservation expiry (FR-014).
- Front-end and deployment are out of scope for this feature.
