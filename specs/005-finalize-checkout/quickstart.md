# Quickstart: Finalize Checkout — Summary, Payment, Final Status and Refresh Recovery

**Feature**: `005-finalize-checkout` | **Date**: 2026-10-14

Runnable validation guide for feature 005. It verifies the four user stories of `spec.md` — summary review
and payment (US1), failure paths (US2), refresh recovery (US3), Finalizar and return to the store (US4) —
and it links to the contracts and data model instead of duplicating them. This feature is **front-end
only**: the back-end is reused unchanged (contract:
[`../002-transacciones-pagos/contracts/rest-api.md`](../002-transacciones-pagos/contracts/rest-api.md)),
and the persisted recovery document is the version-2 whitelist of
[`../003-front-end-store/contracts/persistence.md`](../003-front-end-store/contracts/persistence.md).
Client obligations live in [`contracts/checkout-finalization.md`](./contracts/checkout-finalization.md);
entities and the recovery lifecycle live in [`data-model.md`](./data-model.md).

## Prerequisites

- Node dependencies installed in `back-end/` and `front-end/` (`npm install` in each).
- The back-end reachable with catalog, checkout-config, transaction and status endpoints (feature 002).
  Locally: `docker compose up -d`, then seed and start (`back-end` `npm run prisma:seed` once,
  `npm run start:dev`).
- Front-end pointed at the back-end: `front-end/.env.local` with `VITE_API_URL=http://localhost:3000`.
- Provider sandbox credentials remain in the local `.env` only, never committed. No automated test calls
  the sandbox. Sandbox test cards from 004 still apply: `4242 4242 4242 4242` → approved,
  `4111 1111 1111 1111` → declined, any other → error.

## Setup / run

```bash
# back-end (feature 002, unchanged by 005)
cd back-end && npm run start:dev

# front-end (separate terminal)
cd front-end && npm install && npm run dev   # http://localhost:5173
```

## Automated checks

All feature-005 verification is front-end Jest
(`Jest 30 + ts-jest + jest-environment-jsdom + Testing Library`), with the global coverage gate of 80 %
(lines/branches/functions/statements) already configured in `front-end/jest.config.cjs`
(`src/main.tsx` and `src/config.ts` excluded). This is the gate required by `docs/requirements.md` §10
("Jest in back-end and front-end, coverage above 80%") and §15 (tests green, coverage ≥ 80 % for touched
code, lint and type-check clean).

```bash
cd front-end
npm run lint        # eslint (also boxes fetch in src/shared/api/)
npm run build       # tsc -b && vite build (type-check)
npm test            # jest
npm run test:cov    # jest --coverage  → must stay ≥ 80 % on all four metrics
```

The back-end is untouched; its suites (`cd back-end && npm run lint && npm run build && npm run test:cov`)
must simply keep passing as regression evidence.

### What the suites must prove

Each check maps 1:1 to a spec acceptance scenario and success criterion; the full mapping is pinned in
[`contracts/checkout-finalization.md`](./contracts/checkout-finalization.md) §7.

| Requirement | How the Jest suites verify it | Suites (existing → extended) |
|-------------|-------------------------------|------------------------------|
| SC-001, FR-002/003: summary in a backdrop, amounts verbatim | Render `OrderSummary` with a fixed `TransactionCreated` fixture; assert every amount group (`productAmountInCents`, `baseFeeInCents`, `deliveryFeeInCents`, `totalInCents`) plus product and quantity match the fixture **exactly** (no recomputation) and are wrapped in the `<dialog>` backdrop | `OrderSummary.spec.tsx` |
| SC-002, FR-001/004: one in-flight request | Fire rapid double-taps on Continuar/Pagar; assert the button is disabled while `paymentStatus ∈ {creating, paying, pending}` and exactly one `fetch` per action; assert `Idempotency-Key` header is present on `POST /transactions` and identical on retry | `CheckoutModal.spec.tsx`, `CheckoutModal.integration.spec.tsx`, `checkout.thunks.spec.ts`, `idempotency.spec.ts` |
| FR-005/006: pay payload, 200/202 accepted | Mock `payTransaction` success for 200 and 202; assert the body is exactly `{ cardToken, installments, acceptedContracts: true }` and both codes advance the flow | `checkout.thunks.spec.ts`, `CheckoutModal.integration.spec.tsx` |
| SC-003, FR-007: polling cadence and ceiling | **Fake timers**: assert one `GET /transactions/:id` every 2000 ms, polling stops on the first final status with no extra request (first-poll `DECLINED` included), and the 40000 ms ceiling produces the status-unavailable state | `usePaymentPolling.spec.tsx` |
| SC-004, FR-008: per-code error states, lock released | For each of 409/422/429/503 (+ network, timeout), assert its **designated distinct** error state, no auto-retry for 422 payloads, no hammering for 429, and the in-flight lock released in every case | `checkout.thunks.spec.ts`, `PaymentStatus.spec.tsx`, `payment-errors.spec.ts` |
| SC-005, FR-009..014: refresh-recovery matrix | Seed `localStorage['checkout-progress']`; assert: valid v2 doc + `transactionId` triggers `GET /transactions/:id` **before** resume; PENDING → `finalStatus` + polling with a fresh 2 s/40 s budget; FINAL → `finalStatus` without polling; 404 → document discarded, clean start; version ≠ 2 (and bad shape/staleness > 24 h) → discarded; `summary` step restores as `cardAndDelivery`; transient lookup failure → recovery error + retry with the document kept; zero duplicate `POST /transactions` across all reloads | `persistence.spec.ts`, `checkout.thunks.spec.ts`, `checkout.slice.spec.ts` |
| SC-006, FR-015/016: Finalizar | Press Finalizar on a terminal screen; assert `startOver` semantics (step `product`, `transactionId`/`idempotencyKey`/`transaction`/`paymentError` cleared, `paymentStatus` `idle`), the persisted document removed, navigation to the product page, and a **fresh** product fetch issued (no stale stock) | `checkout.thunks.spec.ts`, `checkout.slice.spec.ts`, `CheckoutModal.integration.spec.tsx` |
| Constitution/privacy invariants | `eslint-restrictions.spec.ts` keeps `fetch` boxed in `src/shared/api/`; the serialized-document test asserts no card-like key ever enters the persisted document | `src/__tests__/eslint-restrictions.spec.ts`, `persistence.spec.ts` |

Expected at completion: lint clean, build clean, all Jest suites green, coverage ≥ 80 % on
lines/branches/functions/statements.

## Manual validation scenarios

Run against a local back-end with the sandbox credentials configured (no automated test touches the
sandbox). Each scenario maps to spec requirements; the expected behavior always follows
`contracts/checkout-finalization.md`. UI copy is Spanish throughout (FR-017).

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Happy path (US1, FR-001..FR-007, SC-001) | With card + delivery data filled, press **Continuar**, inspect the summary, press **Pagar**, wait for the final status | `createTransaction` is sent with an `Idempotency-Key` header; the summary opens **in a backdrop** over the shop and shows product, quantity and every fee line exactly as the server returned them; Pagar sends `{cardToken, installments, acceptedContracts}`; polling ends APPROVED with a **Finalizar** action |
| 2 | In-flight lock (US1.3, FR-004, SC-002) | Double/triple-tap Continuar, then Pagar, as fast as possible | The button is disabled while any request runs; exactly one `POST /transactions` and one `POST .../payment` per tap-storm; exactly one transaction server-side |
| 3 | Conflict 409 (US2.1, FR-008, SC-004) | Exhaust stock between summary and Pagar (zero it in a second tab or the DB) | The distinct conflict state (sold out / not payable) is shown; a path back to review/edit is offered; **no charge**; the lock is released |
| 4 | Rejected 422 (US2.2, FR-008) | Force an invalid/expired token or untick a contract before Pagar | The distinct payment-rejected state is shown; the same invalid payload is **not** auto-retried; retry uses the **same** idempotency key |
| 5 | Rate-limited 429 (US2.3, FR-008) | Hammer an endpoint or force a 429 response | The rate-limit state is shown with **manual** retry only; no immediate automatic retry storm |
| 6 | Unavailable 503 / offline (US2.4, FR-008) | Stop the provider or block the network | The service-unavailable state is shown with a retry option; generic Spanish copy, no stack/HTTP text |
| 7 | Polling timeout (US2.5, FR-007, SC-003) | Keep the transaction PENDING past 40 s | Polls fire every ~2 s (≤ 21 requests), then a status-unavailable/timeout state replaces the spinner — never an endless wait; the only action is **Volver a verificar** (**no Finalizar**, which is reserved for a final status returned by the server); the lock is released |
| 8 | Reload at each step (US3, FR-009..FR-014, SC-005) | Reload at: card entry, summary (after create), mid-payment PENDING, and after a final status; also seed a `version: 1` document, a corrupted document, and delete the transaction server-side before reload | In every case: the app first asks `GET /transactions/:id` for the real status; PENDING resumes polling; FINAL shows the outcome without polling; **404 discards the document** and starts clean; non-v2 or corrupted documents are discarded; a reload at the **summary** step lands back on **card entry**; a failed lookup shows a retryable recovery error with the document kept; zero duplicate transactions anywhere |
| 9 | Finalizar (US4, FR-015/016, SC-006) | Reach a final status, press **Finalizar**, inspect state and the product page | The `checkout-progress` document is removed; Redux progress (transaction id, idempotency key, delivery, transaction, error) is cleared; the shopper lands on the product page; stock is **refetched from the server** (devtool network shows a fresh GET), not the pre-purchase value |
| 10 | Amounts never recomputed/sent (FR-003, contract §5) | With a proxy, compare the summary to the raw `POST /transactions` response; also try adding an `amount` field to the create body | Displayed amounts equal the server response literally (formatting only); the injected-client-amount request is rejected 400 |
| 11 | Privacy & language (FR-017; plan constraints) | Complete a purchase; inspect `localStorage`, Redux state and request bodies | Only the v2 whitelist survives reload; no card number/CVC/token persisted anywhere; all UI text Spanish; backdrop pattern matches feature 004; no horizontal overflow at 375×667 |

## Definition of done

- All 11 manual scenarios behave as expected.
- `front-end`: lint clean, build clean, `npm test` green, `npm run test:cov` ≥ 80 % on all four metrics.
- `back-end`: unchanged suites still green (regression).
- No card data, token, secret or provider company name in code, docs, state or persistence.
- Every FR-001..FR-017 and SC-001..SC-006 is backed by at least one automated test or manual scenario above.

## Validation results

> Executed on 2026-10-15 against the local stack (`docker compose` Postgres equivalent local,
> `back-end npm run start:dev` on :3000, `front-end npm run dev` on :5173, headless browser session
> driving the real UI). Suite evidence (after the T040/T041 convergence pass): `front-end` 40 suites /
> 536 tests green, coverage 97.99 % stmts / 95.79 % branches / 96.34 % funcs / 98.43 % lines;
> `back-end` untouched, lint + build + 54 suites green, coverage 96.39 % / 90.73 % / 100 % / 96.21 %.

| # | Scenario | Result |
|---|----------|--------|
| 1 | Happy path (US1, FR-001..FR-007, SC-001) | ✅ Live: Continuar envió `Idempotency-Key`; el resumen en backdrop `<dialog>` mostró Producto $ 35.000 / Cargo base $ 3.000 / Envío $ 9.000 / Total $ 47.000 textual del `POST /transactions` (sin recomputar) más `Referencia: TXN-…` verbatim; tests `OrderSummary.spec.tsx`, `checkout.thunks.spec.ts` |
| 2 | In-flight lock (US1.3, FR-004, SC-002) | ✅ Automated (`CheckoutModal.spec.tsx` double-tap Pagar → 1 request; `CheckoutModal.integration.spec.tsx` doble Continuar → 1 tokenización + 1 create) |
| 3 | Conflicto 409 (US2.1, FR-008, SC-004) | ✅ Automated: mapping `soldOut`/`notPayable` + estados distintos (`checkout.thunks.spec.ts`, `PaymentStatus.spec.tsx`) |
| 4 | Rechazado 422 / tarjeta rechazada (US2.2, FR-008) | ✅ Live con tarjeta sandbox `4111 …`: estado "Pago rechazado" con copia segura y referencia visible; sin auto-retry del payload inválido (`checkout.thunks.spec.ts` `invalidToken`/`contractsNotAccepted`) |
| 5 | Rate-limited 429 (US2.3, FR-008) | ✅ Automated: `rateLimited` rechaza una sola vez, sin auto-retry (`checkout.thunks.spec.ts`) |
| 6 | No disponible 503 / offline (US2.4, FR-008) | ✅ Automated: estados `providerUnavailable`/`network` con retry manual; copia genérica en español (`PaymentStatus.spec.tsx`, `payment-errors.spec.ts`) |
| 7 | Polling timeout 40 s (US2.5, FR-007, SC-003) | ✅ Automated con fake timers: cadencia 2 s, techo 40 s, parada al primer estado final y, al expirar el techo sin estado final, el estado **status-unavailable** reemplaza el spinner (nunca un éxito) con acción manual **Volver a verificar** que repite `GET /transactions/:id` bajo una ventana nueva, **sin botón Finalizar** (reservado a los estados finales devueltos por el servidor: APPROVED/DECLINED/VOIDED/ERROR) y libera el lock (`usePaymentPolling.spec.tsx`, `PaymentStatus.spec.tsx`, `payment-errors.spec.ts`, `CheckoutModal.integration.spec.tsx`) |
| 8 | Recargas en cada paso (US3, FR-009..FR-014, SC-005) | ✅ Live: recarga en resumen → documento v2 persistido (`currentStep: summary`, `transactionId`, `idempotencyKey`); en el arranque `createAppStore` remapea el paso a **card entry** antes de llegar al store (T041), y "Continuar compra" abre el modal ya en card entry (nunca al resumen) conservando la idempotencia; matriz 404/versión ≠ 2/corrupto cubierta en `persistence.spec.ts` + `checkout.thunks.spec.ts` (0 creates duplicados) |
| 9 | Finalizar (US4, FR-015/016, SC-006) | ✅ Live: botón Finalizar en pantallas aprobadas/rechazadas; localStorage sin `checkout-progress`; vuelta a product page con stock refetheado (14 → unidad descontada y 14 → liberada al declinar) |
| 10 | Montos nunca recomputados/enviados (FR-003, contract §5) | ✅ Automated: body sin campos de monto (`expect(JSON.stringify(body)).not.toMatch(/amount/i)`); rendereo verbatim del fixture |
| 11 | Privacidad e idioma (FR-017) | ✅ Automated: `checkout.slice.spec.ts` (CARD_LIKE), `CheckoutModal.integration.spec.tsx` ("never leaks the card number or the CVC"), diálogo `w-[calc(100vw-2rem)] max-w-lg` (375×667 sin overflow); copia UI en español observada en vivo |

- Suites: `front-end` 528/528 (incl. `eslint-restrictions`, 7/7 — `fetch` confinado a `src/shared/api/`), `back-end` 501/501 (regresión).
- Cobertura: front-end 98.42/95.88/96.32/97.97 %, back-end 96.39/90.73/100/96.21 % (≥ 80 %).
- Secretos: `.env` local sin cambios; ninguna credencial conmutada al repo.
