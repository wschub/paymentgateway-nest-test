# Phase 0 Research: Card & Delivery Payment with Resilient Recovery

**Feature**: `004-card-delivery-payment` | **Date**: 2026-10-13

No `NEEDS CLARIFICATION` markers remained after loading the spec and the existing specs 002/003, so the items
below consolidate the decisions the design relies on. Each follows Decision / Rationale / Alternatives.

## R1 — Card tokenization seam (never the hosted widget)

- **Decision**: Tokenize the card in the browser by calling the provider's `POST /tokens/cards` directly,
  authorized with the **public key** returned by our `GET /payments/checkout-config`. Put this single outbound
  call in a new `src/shared/api/payment-provider.ts`, and add that file to the `no-restricted-globals` allow
  list in `eslint.config.js` next to `http.ts`. Request body: `number`, `cvc`, `exp_month`, `exp_year` (two
  digits each, strings) and `card_holder` (≥ 5 chars). Response: `id` (single-use token) and brand.
- **Rationale**: Requirement D5 forbids the hosted widget/checkout page; the card must be collected in our own
  modal. The existing lint rule allows `fetch` only in `http.ts`, so a second narrowly-scoped, allow-listed seam
  keeps the rule meaningful and keeps provider concerns out of the API wrapper.
- **Alternatives considered**: (a) Put tokenization inside `http.ts` — rejected: mixes our API contract with a
  third-party, dynamic-base-URL call; (b) disable the lint rule for the whole checkout feature — rejected:
  loses the guardrail; (c) call the provider through our back-end — rejected: violates "the card never reaches
  our systems" (Principle V).
- **Consequence**: `src/__tests__/eslint-restrictions.spec.ts` gains a case asserting `fetch` is allowed in
  `payment-provider.ts` (and still flagged elsewhere).

## R2 — Extending the shared HTTP wrapper

- **Decision**: Generalize `httpRequest<T>` to accept `method`, `body` (JSON) and `headers`, defaulting
  to the current GET behavior. Send/receive JSON (`Content-Type`/`Accept`). Map failures by **HTTP status plus
  the back-end `code`** into a `kind`: `404`→`notFound`; `409 INSUFFICIENT_STOCK`→`soldOut`;
  `409 IDEMPOTENCY_KEY_REUSED`→`idempotencyConflict`; `409 TRANSACTION_NOT_PAYABLE`→`notPayable`;
  `422 CONTRACTS_NOT_ACCEPTED`→`contractsNotAccepted`; `422 INVALID_PAYMENT_TOKEN`→`invalidToken`;
  `502 PAYMENT_PROVIDER_REJECTED`→`providerRejected`; `503 PAYMENT_PROVIDER_UNAVAILABLE`→`providerUnavailable`;
  `429`→`rateLimited`; other `5xx`/network/timeout→`server`/`network`; malformed `400`→`badRequest`.
- **Rationale**: The current wrapper maps by status only and always GETs; the payment endpoints need POST
  bodies, an `Idempotency-Key` header, and finer failure kinds so the UI can show the right next action
  (re-enter card, retry, sold out). The back-end already returns a consistent `{statusCode, code, message, path,
  timestamp}` body, so `code` is a reliable discriminator.
- **Alternatives considered**: (a) Per-endpoint ad-hoc `fetch` — rejected: breaks the single-seam rule and
  duplicates timeout/error handling; (b) keep status-only mapping — rejected: `409`/`422` carry several distinct
  meanings the UI must distinguish.

## R3 — Idempotency key and the double-click guard

- **Decision**: Generate one idempotency key per purchase when the shopper opens the pay flow (a
  `crypto.randomUUID()`-based or random token matching `[A-Za-z0-9_-]{16,64}`), store it in checkout state and
  in the persisted document, and send it as `Idempotency-Key` on `POST /transactions`. Reuse it for every retry
  **while the purchase stays `PENDING`** (network failure, 503, `invalidToken`, idempotent replay). Once the
  purchase reaches a final `DECLINED`, `VOIDED` or `ERROR` state (including `RESERVATION_EXPIRED`), clear
  `transactionId` and generate a **new** key before retrying. Disable the continue/pay button and ignore
  re-entrant submits while a request is in flight.
- **Rationale**: The back-end replays the same key with the same payload (returns the existing purchase) and
  rejects a different payload with `IDEMPOTENCY_KEY_REUSED` (409). Persisting the key is what makes a
  refresh-mid-payment replay instead of double-charge. A final non-approved purchase must not be retried under
  the old key (the back-end answers `notPayable`), so a fresh key starts a clean purchase. The in-flight guard
  stops the obvious double-click before it even reaches the server.
- **Alternatives considered**: (a) Client-only debounce — rejected: a refresh or a retried network request
  bypasses it; (b) regenerate the key per attempt — rejected: that would create duplicate purchases; (c) keep
  the key after a final decline — rejected: the purchase is no longer payable.

## R4 — Asynchronous status and polling

- **Decision**: `POST /transactions/:id/payment` returns the transaction view, usually `PENDING`; the UI then
  reads `GET /transactions/:id` on a **fixed 2 s interval** (`STATUS_POLL_INTERVAL_MS = 2000`) up to a ceiling
  of **40 s** (`STATUS_POLL_CEILING_MS = 40000`), stopping as soon as the status is final
  (`APPROVED`/`DECLINED`/`VOIDED`/`ERROR`). On reaching the ceiling the UI stays in the pending state and offers
  a manual "re-check" control. Polling is cancelled on unmount and never started for a final transaction. When a
  `transactionId` is restored on load (refresh), the payment step opens in a "verifying" state and shows neither
  success nor failure until the first read responds; out-of-order responses are dropped so only the latest
  `requestId` is applied.
- **Rationale**: The provider never answers synchronously (D6); the back-end is the source of truth and
  finalizes idempotently on read. A fixed interval is simpler than backoff and bounded by a ceiling, which
  satisfies the "pending/`PENDING`" and "refresh mid-payment" edge cases. Dropping stale responses prevents an
  older read from overwriting a newer final status. The front-end polls only our API, never the provider.
- **Alternatives considered**: (a) Long-lived request — rejected: D6 forbids holding requests open; (b)
  exponential backoff — rejected: unnecessary complexity for a 40 s window; (c) tight interval with no ceiling —
  rejected: wasteful and never resolves a stuck purchase; the manual re-check covers the ceiling case.

## R5 — Card validation (own form)

- **Decision**: Hand-write `card.validation.ts`: Luhn check and length (13–19 digits) for the number; brand by
  IIN prefix (VISA `4`, MasterCard `51–55`/`2221–2720`), computed only for display; expiry `MM/YY` parsed as end
  of month and rejected if in the past; CVC 3–4 digits (4 for some brands); cardholder name ≥ 5 chars;
  installments default 1 and ≥ 1. Errors are inline, next to the field, and announced through the existing live
  region.
- **Rationale**: The requirements (FR-3) specify exactly these rules; a small pure module is easy to unit-test
  and keeps validation out of components. Luhn/brand need no library.
- **Alternatives considered**: A validation library — rejected by Principle VII (YAGNI) and to avoid a new
  dependency for a handful of rules.

## R6 — Persistence version bump (1 → 2) and discard-on-mismatch

- **Decision**: In `persistence.ts`, raise `PERSISTENCE_VERSION` to `2`, add `idempotencyKey: string | null` to
  the stored whitelist, and validate it on load (string matching the key pattern, or `null`). Keep the rule that
  any document whose `version !== PERSISTENCE_VERSION` is **discarded** (stored document removed, empty
  preloaded state). Update `specs/003-front-end-store/contracts/persistence.md` (shape, field table, version) to
  match.
- **Rationale**: Adding a field changes the document shape, so an old version-1 document must not be trusted;
  discarding is the safe, already-tested behavior. The idempotency key is non-sensitive and must survive a
  refresh to prevent a double charge.
- **Alternatives considered**: (a) Migrate v1 → v2 (keep old progress, synthesize a key on load) — rejected:
  more code and a synthesized key is not the one the back-end may already know; discarding is simpler and safe;
  (b) keep version 1 — rejected: violates the documented "version must equal current; otherwise discard"
  contract.

## R7 — Amount tampering defense

- **Decision**: The client never sends amounts. It displays the breakdown returned by `POST /transactions`
  (product amount = unit price × quantity, plus configured base and delivery fees, plus total). Any deviation
  is impossible because the back-end rejects unknown fields (`forbidNonWhitelisted`) and recomputes everything;
  the summary always shows the server-returned values.
- **Rationale**: Matches FR-020 and the constitution's money-integrity rule; the front-end cannot influence the
  charged amount.
- **Alternatives considered**: Recompute the amount in the browser to cross-check — rejected as unnecessary:
  the display already comes from the server response.

## R8 — Refresh recovery during payment

- **Decision**: On store creation, the persisted v2 document preloads the checkout state including
  `transactionId` and `idempotencyKey`, but **never** the single-use token (it is memory-only). If a
  `transactionId` is present, the app opens the payment step in a "verifying" state and immediately reads
  `GET /transactions/:id` (no new `POST /transactions`, no new payment) until it is final, ignoring out-of-order
  responses. If the restored step was `summary` (pending purchase exists, token gone), the app returns to
  `cardAndDelivery`; pressing Continuar replays the pending purchase with the stored key. If only a
  product/quantity + key exist (payment not started), the modal can resume and start the purchase with the
  stored key.
- **Rationale**: Satisfies FR-012/SC-006 and reuses the same idempotency key, so a half-finished payment is
  reconciled rather than duplicated. Because the token cannot survive a refresh, a summary-step refresh must
  re-collect the card; the pending purchase is replayed, not recreated.
- **Alternatives considered**: Discard progress on payment steps — rejected: loses the purchase and could leave
  a reserved stock reservation unseen.

## R9 — Modal UX and accessibility

- **Decision**: Render the flow in a native `<dialog>` opened from the product page's "Iniciar compra"; trap
  focus, return focus to the trigger on close, support `Esc`, and move focus to the step heading. Delivery and
  card fields use labelled inputs; errors are associated via `aria-describedby` and announced with the existing
  `LiveRegion`. Cards render inside the modal; mobile-first from 375 px with no horizontal overflow.
- **Rationale**: Reuses existing `LiveRegion`/`Image` patterns and satisfies the accessibility constraints and
  the spec's "modal" wording while keeping the product route unchanged.
- **Alternatives considered**: A dedicated `/checkout` route — rejected: the spec/business decision is a modal
  over the product page; a route would also change the address contract from feature 003.

## R10 — Error kinds and safe messages (final set)

- **Decision**: Extend `api.errors.ts` kinds to: `network`, `rateLimited`, `server`, `notFound`, `soldOut`,
  `idempotencyConflict`, `notPayable`, `contractsNotAccepted`, `invalidToken`, `providerRejected`,
  `providerUnavailable`, `badRequest`. Each maps to a fixed, non-technical Spanish message; response `code`,
  `message`, `path` and any provider text are never surfaced.
- **Rationale**: The UI must present a clear next action per edge case (FR-015..FR-021, SC-007) without leaking
  internals (Principle V, spec FR-019).
- **Alternatives considered**: A generic `server` for all 4xx/5xx — rejected: the shopper could not tell
  "declined, use another card" from "sold out" or "try again later".

## R11 — Two-step flow (Continuar then Pagar) and the in-memory token

- **Decision**: Split the modal into `cardAndDelivery` → `summary` → `finalStatus`. **Continuar** validates the
  delivery + card data and the contracts, tokenizes the card (R1) and creates the pending purchase
  (`POST /transactions`); the modal then shows the **summary** with the server-computed amounts and a **Pagar**
  button that calls `POST /transactions/:id/payment` with the token. The single-use token lives only in
  non-persisted Redux memory (`cardToken`) between the two steps and is discarded after use. A refresh on the
  summary step (token gone) returns to `cardAndDelivery` with the same key, which replays the pending purchase.
- **Rationale**: Creating the purchase at Continuar means the shopper reviews the real server amounts before
  paying, and a modal closed before Pagar leaves a pending purchase that expires safely (D9) rather than an
  orphan. Keeping the token out of the persisted document preserves Principle V while still allowing a two-step
  UI.
- **Alternatives considered**: (a) Create the purchase only at Pagar (single combined action) — rejected: the
  shopper could not review verified server amounts before the purchase existed, and tokenization+create are one
  logical step; (b) persist the token — rejected: violates "the token is never persisted".

## R12 — Delivery validation and payload mapping

- **Decision**: Hand-write `delivery.validation.ts` with the field rules (full name required and ≤ 120 chars,
  email shape, phone 7–20 chars, address/city/region required, notes optional and ≤ 500 chars) and a
  `toTransactionPayload(delivery)` mapper that turns the flat form into the back-end shape
  `{ customer: { fullName, email, phone }, delivery: { address, city, region, notes? } }`. Pure and unit-tested.
- **Rationale**: FR-001 requires validating delivery before payment; the back-end expects the nested shape, so
  the mapping belongs next to the validators. Pure functions keep the component thin and testable.
- **Alternatives considered**: Validate inline in the component — rejected: harder to test and reuse; send the
  flat shape and let the back-end nest it — rejected: the documented contract is nested.

## Back-end reuse note

Feature 002 already implements `GET /payments/checkout-config`, `POST /transactions` (idempotency,
server-recomputed amounts, atomic conditional stock, out-of-stock 409), `POST /transactions/:id/payment`
(single-use token, contracts, not-payable 409, invalid-token 422, provider 502/503) and `GET /transactions/:id`
(pending finalization with stock release). This feature **consumes** those contracts; no back-end change is
planned. The plan/tasks will re-run the back-end suite and add tests only if a spec edge case is uncovered.
