# Contract: Checkout Finalization — Consumed Endpoints, Polling and Recovery Rules

**Feature**: `005-finalize-checkout` | **Date**: 2026-10-14

This contract pins the **client-side obligations** of the finalization flow. It consumes the **existing**
back-end surface of [`specs/002-transacciones-pagos/contracts/rest-api.md`](../002-transacciones-pagos/contracts/rest-api.md)
unchanged (no new endpoint, no back-end change) and the versioned persistence document of
[`specs/003-front-end-store/contracts/persistence.md`](../003-front-end-store/contracts/persistence.md)
unchanged (still version 2). All HTTP goes through `src/shared/api/http.ts`; all errors are serializable
`ApiError { kind, message }` values; shopper-facing copy stays generic and Spanish. No card number, CVC,
token or secret appears in any request, response handling, state or persistence.

## 1. Consumed endpoints

### POST /transactions — create the PENDING purchase (Continuar)

- **Headers**: `Idempotency-Key: <16–64 chars of [A-Za-z0-9_-]>` (required; one per purchase attempt).
- **Request**: `{ productId, quantity, customer: { fullName, email, phone }, delivery: { address, city,
  region, notes? } }`. No amount field is ever sent; the server rejects unknown/extra fields with 400.
- **Success `201 Created`** (first time) / **`200 OK`** (idempotent replay with the same key and payload):
  `TransactionCreated` — `id`, `reference` (`TXN-` + 16 characters, server-generated; displayed verbatim,
  never client-constructed), `status: PENDING`, `quantity` (1–10), `amounts`. The summary binds to
  these values **verbatim**; the client never recomputes.
- **Errors** → kinds: `400` → `badRequest`; `404 PRODUCT_NOT_FOUND` → `notFound`;
  `409 INSUFFICIENT_STOCK` → `soldOut`; `409 IDEMPOTENCY_KEY_REUSED` → `idempotencyConflict`;
  `429` → `rateLimited`; `503` → `providerUnavailable`; network/timeout → `network`.

**Client obligations**: send the persisted `idempotencyKey` (never a new one) for retries and replay after
reload; on success, store `transactionId`, show the summary in the backdrop, keep the in-flight lock
released.

### POST /transactions/:id/payment — start the payment (Pagar)

- **Request**: `{ cardToken, installments, acceptedContracts: true }`. `cardToken` is the single-use token
  held in `CheckoutModal` memory; `installments` ≥ 1 (default 1).
- **Success `202 Accepted`**: payment in progress (or already started — no second charge); `TransactionView`
  (usually `PENDING`). **Success `200 OK`**: only when the provider answered a final status at creation time.
  Both are treated as accepted (FR-006); the app proceeds to the final step and polls if the view is `PENDING`.
- **Errors** → kinds: `400` → `badRequest`; `404 TRANSACTION_NOT_FOUND` → `notFound`;
  `409 TRANSACTION_NOT_PAYABLE` → `notPayable`; `422 CONTRACTS_NOT_ACCEPTED` → `contractsNotAccepted`;
  `422 INVALID_PAYMENT_TOKEN` → `invalidToken` (re-enter the card, retry with the **same** key);
  `502 PAYMENT_PROVIDER_REJECTED` → `providerRejected`; `503 PAYMENT_PROVIDER_UNAVAILABLE` →
  `providerUnavailable` (retry re-sends the **same** token with the **same** key; server reconciles by
  reference); `429` → `rateLimited`; network/timeout → `network` (behaves like 503).

**Client obligations**: disabled Pagar while in-flight (FR-004); on `422` variants never auto-retry the
invalid payload (FR-008); every error outcome releases the in-flight lock.

### GET /transactions/:id — source of truth (polling + reload recovery)

- **Success `200 OK`**: `TransactionView`; while `PENDING` the back-end reads the provider and finalizes
  idempotently (assigning the delivery when approved, releasing reserved stock otherwise). A PENDING purchase
  whose payment never started and that outlived the reservation TTL is reported `VOIDED` with
  `failureReason: "RESERVATION_EXPIRED"`. With `map400ToNotFound: true`, a treated-as-400 at this route maps
  to `notFound` as well.
- **Errors** → kinds: `404 TRANSACTION_NOT_FOUND` → `notFound` (definitive: the transaction is
  unknown/discarded); `429` → `rateLimited`; `503` → `providerUnavailable`; network/timeout → `network`
  (transient in this flow).

**Client obligations**: trust this view over any persisted or in-memory state; stop polling on the first
final status; treat 404 as discard-of-progress (FR-011), and transient failures as retryable without
discarding the document.

## 2. Status lifecycle and polling contract

```text
PENDING ──poll every 2 s──▶ PENDING | APPROVED | DECLINED | VOIDED | ERROR
                                  └───────── terminal ─────────┘
```

- `PENDING` is the only pollable status; `APPROVED`, `DECLINED`, `VOIDED`, `ERROR` are final. A shopper
  may also encounter `VOIDED` / `RESERVATION_EXPIRED` when an abandoned reservation was released lazily on
  read — shown as a terminal "no se pudo completar" outcome with a retry/start-over path.
- **Cadence**: one `GET /transactions/:id` every `2000 ms` (±10 %), active only while
  `transactionId && paymentStatus === 'pending' && currentStep === 'finalStatus'`
  (`usePaymentPolling`), for at most `40000 ms` per payment attempt.
- **Stop conditions**: the first final status (no further requests, SC-003 — a first-poll `DECLINED` ends
  polling immediately), the 40 s ceiling (→ status-unavailable state, never an endless wait), or a terminal
  error of the read itself.
- **Concurrency guard**: `lastReadRequestId` ensures a stale in-flight read (from an aborted poll cycle or
  a racing recovery) cannot overwrite a newer state; no duplicate status request may outlive the last read.
- **Timeout semantics**: at ceiling expiry the transaction may still resolve server-side; nothing is assumed
  — a later recovery (`GET /transactions/:id`) discovers the real outcome.
- **Cancels**: leaving the flow (modal close before final status) cancels no request server-side; the
  purchase continues server-side and the recovery path is the resumption mechanism. There is no
  client-triggered cancel endpoint in this feature.

## 3. Error → kind → UI state (finalization flow)

| HTTP outcome | `code` | `kind` | UI state / recovery |
|--------------|--------|--------|---------------------|
| 409 | `INSUFFICIENT_STOCK` | `soldOut` | conflict state; path back to product review/edit |
| 409 | `IDEMPOTENCY_KEY_REUSED` | `idempotencyConflict` | conflict state; start a new purchase |
| 409 | `TRANSACTION_NOT_PAYABLE` | `notPayable` | conflict state; back to review |
| 422 | `CONTRACTS_NOT_ACCEPTED` | `contractsNotAccepted` | payment-rejected state; shopper re-accepts; no auto-retry |
| 422 | `INVALID_PAYMENT_TOKEN` | `invalidToken` | payment-rejected state; re-enter card; same key; no auto-retry |
| 502 | `PAYMENT_PROVIDER_REJECTED` | `providerRejected` | payment-rejected state with retry |
| 503 | `PAYMENT_PROVIDER_UNAVAILABLE` | `providerUnavailable` | service-unavailable state; explicit retry; do not hammer |
| 429 | any | `rateLimited` | rate-limit state; manual retry only; never an immediate auto-retry |
| 400 | any | `badRequest` | data-review state |
| 404 (lookup) | `TRANSACTION_NOT_FOUND` | `notFound` | **discard recovery document; clean restart** |
| other 5xx | any | `server` | service-unavailable state; retry option |
| offline / request timeout | — | `network` | service-unavailable state; retry option |
| polling ceiling (40 s) | — | (client-side timeout) | status-unavailable state; status may resolve later via recovery |

Each state releases the in-flight lock, shows generic Spanish copy and offers a retry/back action matching
US2 and FR-008; per-code distinctness and lock release are asserted in tests (SC-004).

## 4. Refresh-recovery contract (fetch-in of steps)

On every app start with a valid persisted document (`checkout-progress`, version 2):

```text
1. loadPersistedProgress  → invalid JSON/shape, version ≠ 2, stale > 24 h → discard, clean start
2. restoreProgress        → fetchProduct(selectedProductId)
                            ├─ notFound            → discard document (startOver)
                            └─ network/429/503     → keep progress, validate on page open
3. If transactionId exists (a purchase was created):
   readTransactionStatus(transactionId)          // GET /transactions/:id — the ONLY source of truth
   ├─ 200 PENDING   → land on finalStatus, resume polling (fresh 2 s / 40 s window)
   ├─ 200 FINAL     → land on finalStatus showing that outcome (no polling)
   ├─ 404 notFound  → discard document, clean start (FR-011)
   └─ network/429/503 → recovery error state + retry; document KEPT until a definitive answer
4. Step remap: a restored `summary` step becomes `cardAndDelivery` (the summary is never restored
   directly; FR-014). `finalStatus` restores only through step 3. Steps before the transaction
   (product / cardAndDelivery with no transactionId) restore as-is.
```

Guarantees the flow must keep (SC-005): zero duplicate transactions after any reload (idempotency key +
server lookup), and no resumed journey that skips the server status check (FR-010).

## 5. Summary rendering contract

- The summary (backdrop component) displays **exactly** the server `amounts` block —
  `productAmountInCents`, `baseFeeInCents`, `deliveryFeeInCents`, `totalInCents` — plus the product and
  quantity from the same response. Formatting only (`cents / 100`, locale); **zero** client-side
  recomputation, ordering, or rounding of amounts (FR-003, SC-001).
- The client never sends amounts (the server recomputes and rejects client-supplied amounts with 400).
- The backdrop reuses the 004 `<dialog>` + `backdrop:bg-black/40` pattern (FR-002, FR-017); it opens only
  after a successful create, and Pagar stays disabled while any request is in-flight.

## 6. Finalizar contract (to clear)

| Obligation | Implementation |
|------------|----------------|
| Trigger | Finalizar button on any terminal final-status screen (approved / declined / voided / error) |
| Clear persisted document | remove the `checkout-progress` document (FR-015) |
| Clear in-memory progress | `startOver` semantics: step `product`; `transactionId`, `idempotencyKey`, `delivery`, `transaction`, `paymentError` cleared; `paymentStatus` back to `idle`; card display state already memory-only |
| Navigate | land on the product page |
| Fresh stock | trigger a new product fetch from the server; never reuse pre-purchase cached stock (FR-016, SC-006) |
| No residue | after Finalizar no idempotency key, transaction id, token or card field remains reusable (US4.4) |

The subscriber never re-writes a stale document after the clear: the falling whitelist (purchase no longer
started) is treated as removal, matching the 003 clear rules.

## 7. Test pinning (contract → evidence)

Every rule above maps 1:1 to an acceptance scenario: exact-amount rendering (SC-001), one-in-flight + one
server purchase (SC-002), polling cadence/ceiling with fake timers (SC-003), per-code error states
(SC-004), the full reload matrix — PENDING resume, FINAL resume, 404 discard, version ≠ 2 discard,
summary→card-entry (SC-005) — and Finalizar clears + refetches (SC-006).
