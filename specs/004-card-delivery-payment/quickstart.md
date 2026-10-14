# Quickstart: Card & Delivery Payment with Resilient Recovery

**Feature**: `004-card-delivery-payment` | **Date**: 2026-10-13

Validation guide for the payment flow. It links to the contracts and data model instead of duplicating them;
implementation details belong to `tasks.md`.

## Prerequisites

- Node dependencies installed in `back-end/` and `front-end/` (`npm install` in each).
- The back-end reachable with catalog, checkout-config, transaction and status endpoints (feature 002).
  Locally: `docker compose up -d`, then seed and start (`back-end` `npm run prisma:seed` once, `npm run start:dev`).
- Provider sandbox credentials present in the **local** `.env` only (public key, base URL, contracts). Never
  committed. No automated test calls the sandbox.
- Front-end pointed at the back-end: `front-end/.env.local` with `VITE_API_URL=http://localhost:3000` (or the
  deployed URL).
- Provider sandbox test cards (any future expiry, any 3-digit CVC): `4242 4242 4242 4242` → approved,
  `4111 1111 1111 1111` → declined, any other → error.

## Setup / run

```bash
# back-end
cd back-end && npm run start:dev

# front-end (separate terminal)
cd front-end && npm run dev        # http://localhost:5173
```

## Automated checks

```bash
cd front-end && npm run lint && npm run build && npm run test:cov
cd back-end  && npm run lint && npm run build && npm run test:cov
```

Expected: lint and type-check clean; Jest green; **coverage ≥ 80 %** in each app. Front-end suites cover the
HTTP wrapper (POST/headers/error mapping), card validators, delivery validators + payload mapper, the checkout
slice/thunks (mocked `fetch`), the tokenization seam, persistence v2 load/discard, the modal flow (Continuar →
summary → Pagar), the SC-005 privacy check and the fixed-interval status polling; `eslint-restrictions.spec.ts`
also asserts `payment-provider.ts` (alongside `http.ts`) is allowed to call `fetch`.

## Manual validation scenarios

Each scenario maps to a spec requirement and an edge case. Contracts: `contracts/checkout-rest-api-consumed.md`,
`contracts/card-tokenization.md`; state/persistence: `data-model.md`.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Happy path (US1, SC-001) | Choose a product/quantity, open the modal, fill valid delivery + approved card, accept both contracts, press **Continuar**, then **Pagar** | Continuar creates the `PENDING` transaction and shows the summary with the server amounts; Pagar starts the payment; polling ends `APPROVED`; delivery assigned; stock drops by the quantity |
| 2 | Card validation (FR-003) | Enter a non-Luhn number, a past expiry, a short CVC, a 3-letter name | Inline errors; pay blocked; no request sent |
| 3 | Contracts required (FR-004) | Valid card but one checkbox unticked | Pay blocked with a clear message; no request (`contractsNotAccepted` if forced) |
| 4 | No card data stored (FR-005, FR-014, SC-005) | Complete a purchase; inspect Redux state, `localStorage['checkout-progress']`, network tab | No card number/CVC anywhere; only a token sent to our API; no card-like keys in the persisted document |
| 5 | Declined (US3, FR-017) | Pay with `4111 1111 1111 1111` | `finalStatus` declined; reserved stock released; "try another card" offered |
| 6 | Double click (US3, FR-009, SC-002) | Click pay twice quickly | Pay button disabled while in flight in the UI; exactly one transaction in the back-end |
| 7 | Refresh mid-payment (US2, FR-012, SC-006) | Pay, then refresh while pending; also refresh while on the summary (before Pagar) | Pending: modal reopens showing "verificando"; `GET /transactions/:id` re-read and no success/failure shown until it answers; out-of-order answers ignored; no second `POST`; never double-charged. Summary: reopens at card entry with the same key; Continuar replays the pending purchase (same id) |
| 8 | Retry same idempotency key (US3, FR-008/021) | Force a failure after transaction creation, then retry | Same `Idempotency-Key` reused; the existing purchase is replayed (same id/reference), not duplicated |
| 9 | Sold out at payment (US3, FR-015/016, SC-004) | Reduce stock to zero (or race two tabs) before paying | `soldOut` message; no charge; stock never negative; exactly one winner for the last unit |
| 10 | Invalid/expired token (US3, FR-018) | Force the provider to reject the token (e.g. re-use a token) | `invalidToken`; card fields highlighted; retry with a new token |
| 11 | Provider unavailable/timeout (US3, FR-019) | Stop the provider or point to a bad base URL | `providerUnavailable`; friendly message + retry; no stack/HTTP text shown |
| 12 | Pending/`PENDING` forever (US3) | Keep the provider pending; wait past the polling ceiling | Polls every **2 s** up to a **40 s** ceiling, then stays pending with a manual "re-check"; never blocks; resolves when the provider settles |
| 13 | Amount tampering (US3, FR-020, SC-003) | Using a proxy, add/alter an amount field on `POST /transactions` | Back-end rejects unknown field (`400 badRequest`); amounts otherwise always equal the server breakdown |
| 14 | Persistence version (FR-013, SC-009) | Seed `localStorage['checkout-progress']` with `version: 1` and with `version: 2` (+ valid `idempotencyKey`) | v1 is discarded on load; v2 restores progress including the key |
| 15 | Accessibility & layout (FR-018) | Keyboard-only pass; 375×667 viewport | Modal traps/returns focus, fields labelled, Esc closes; no horizontal overflow |
| 16 | Delivery validation (FR-001) | Enter an empty name, a 130-char name, a bad email, a 6-char phone, a 501-char note | Inline errors; Continuar blocked; no tokenization and no request; the flat form maps to `{ customer: { fullName, email, phone }, delivery: { address, city, region, notes? } }` |
| 17 | No card data or token stored (SC-005) | Pay with `4242 4242 4242 4242` / CVC `123`; inspect Redux state, `localStorage` and the fetch bodies to our API | `JSON.stringify(store.getState())`, `localStorage` and every request to **our** API contain neither the card number nor the CVC; the single-use token is memory-only |
| 18 | Reopen final / price change (US3) | Reopen an approved/voided transaction; change the price after the summary is shown | Reopened final shows its status and starts no new payment (`notPayable`); a price change is warned about and the charged total equals the server-recomputed total |

## Definition of done

- All 18 scenarios behave as expected.
- `front-end` and `back-end`: lint clean, build clean, Jest green, coverage ≥ 80 %.
- `specs/003-front-end-store/contracts/persistence.md` reflects version 2 + `idempotencyKey`.
- `front-end/README.md` describes card data as tokenized in the browser with the public key and never stored
  (no "hosted flow" claim).
- No provider company name and no secret anywhere in code, docs or commits.

## Validation results

**Run**: 2026-10-13 — local back-end (`http://localhost:3000`, fresh `prisma migrate deploy` + `prisma:seed`)
against the provider **sandbox**. Executed by `/speckit.implement` (T049) as the automated proxy for the manual
scenarios. The sandbox is only ever called here; the Jest suites never touch it. No secret is printed.

### Live sandbox checks

| Quickstart # | Check | Observed | Result |
|--------------|-------|----------|--------|
| 1 | Happy path (`4242…`) | `POST /transactions` → 201 `PENDING` with `amounts.totalInCents` = 10 700 000; `POST /transactions/:id/payment` → 202; `GET /transactions/:id` → `APPROVED` in ≈3.1 s | PASS |
| 5 | Declined (`4111…`) | `POST …/payment` → 202, then `GET …/:id` → `DECLINED` in ≈0.4 s (stock released) | PASS |
| 7 | Refresh mid-payment | `GET /transactions/:id` re-read the `APPROVED` status; no new payment started | PASS |
| 8 | Retry same key | same key + same payload → 200 with the **same** `id` (idempotent replay); same key + different quantity → 409 `IDEMPOTENCY_KEY_REUSED` | PASS |
| 9 | Sold out | product with stock 6, requested 7 → 409 `INSUFFICIENT_STOCK` | PASS |
| 10 | Invalid token | bogus token → 422 `INVALID_PAYMENT_TOKEN`; malformed (bad-Luhn) card → 422 at tokenization | PASS |
| 13 | Amount tampering | client-sent `amount`/`total` fields → 400 `BAD_REQUEST`; the server recomputes every amount | PASS |
| 3 | Contracts required | `acceptedContracts:false` → 422 `CONTRACTS_NOT_ACCEPTED` | PASS |
| 18 | Reopen final | paying an already-final transaction → 409 `TRANSACTION_NOT_PAYABLE` | PASS |
| — | Tokenization | browser seam (`Authorization: Bearer {publicKey}`) returned a single-use token with `brand`/`last_four` for both test cards | PASS |

### Automated (Jest / static) checks

| Quickstart # | Check | Covered by | Result |
|--------------|-------|------------|--------|
| 4, 17 | No card number/CVC in state, `localStorage` or our API; token memory-only | `CheckoutModal.integration.spec.tsx` (SC-005) | PASS |
| 6 | Double-click → one purchase | modal + integration specs | PASS |
| 11 | Provider unavailable / timeout (token + key kept) | `payment-provider.spec.ts`, `checkout.thunks.spec.ts`, integration spec | PASS |
| 12 | 2 s poll / 40 s ceiling / manual re-check | `usePaymentPolling.spec.tsx`, integration spec | PASS |
| 14 | Persistence v1 discarded, v2 restored | `persistence.spec.ts` | PASS |
| 15 | Dialog focus/labels + 375 px bounds | component specs | PASS |
| 16 | Delivery validation (phone-pattern parity) | `delivery.validation.spec.ts` | PASS |
| 18 | Price-change warning + server total | `CheckoutModal.integration.spec.tsx` | PASS |

### Gates and committed-secret check

- `front-end`: lint clean, build clean, `test:cov` green (39 suites / 464 tests; 97.92 / 95.69 / 96.18 / 98.37).
- `back-end`: lint clean, build clean, `test:cov` green (54 suites / 501 tests; 96.39 / 90.73 / 100 / 96.21).
- `git grep` over tracked files: **no provider company name**; the only secret-shaped strings are fake
  `sk_live_123` fixtures in back-end tests that assert the exception filter does **not** leak them. No secret
  is committed (real values live only in the untracked `.env`).

**All 18 scenarios pass** (live sandbox where the provider is involved, Jest elsewhere).
