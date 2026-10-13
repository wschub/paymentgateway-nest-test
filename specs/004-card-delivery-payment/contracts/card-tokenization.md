# Contract: Browser card tokenization (provider, public key)

**Feature**: `004-card-delivery-payment` | **Date**: 2026-10-13

The card is tokenized **in the browser** with the provider's **public key**. The hosted widget and hosted
checkout page are **not** used (decision D5). The card number and CVC never reach our back-end, Redux, logs or
`localStorage`; only the single-use token leaves the browser (to our back-end) plus the brand/last-four kept for
display.

## Seam and legality

- Single implementation file: `front-end/src/shared/api/payment-provider.ts`.
- It is the only place besides `src/shared/api/http.ts` allowed to call `fetch`; `eslint.config.js` adds it to
  the `no-restricted-globals` allow list and `src/__tests__/eslint-restrictions.spec.ts` asserts both the
  allowance and that other files are still flagged.
- Inputs come from `GET /payments/checkout-config` (`baseUrl`, `publicKey`); no secret is used client-side.

## Request

`POST {baseUrl}/tokens/cards`

Headers:

```
Authorization: Bearer {publicKey}
Content-Type: application/json
```

Body:

```json
{
  "number": "4242424242424242",
  "cvc": "123",
  "exp_month": "12",
  "exp_year": "29",
  "card_holder": "Test Buyer"
}
```

`exp_month`/`exp_year` are two-digit strings. `card_holder` is at least five characters. These values are read
from the card form's **local** state and are discarded as soon as the request settles.

## Response (success)

```json
{ "status": "CREATED", "data": { "id": "tok_test_...", "brand": "VISA", "last_four": "4242", "name": "VISA" } }
```

- `data.id` is the **single-use** token passed to `POST /transactions/:id/payment` as `cardToken`. It is held
  **only in local `CheckoutModal` component state** (memory, never dispatched to Redux) between **Continuar**
  (which tokenizes) and **Pagar** (which uses it) and is passed as an argument to the `payTransaction` thunk; it
  is never written to `localStorage`. Lifecycle: it is **kept** across a `network`/timeout/`503` at Pagar
  (the retry re-sends the same token with the same key; the back-end reconciles the pending claim by reference)
  and **discarded** on payment `202`/`200`, on `422 invalidToken` (re-enter the card), on any `409`, when the
  modal closes and on any final state.
- `data.brand` (normalized to a display string) and `data.last_four` are kept in memory for the summary/status
  UI only and are never persisted.

## Failure mapping

| Provider outcome | Result |
|------------------|--------|
| network / timeout | `network` → "revisa tu conexión e inténtalo de nuevo" |
| 4xx validation (bad number/expiry/cvc) | `invalidToken` → highlight the card fields and ask to re-enter |
| 5xx / unexpected | `providerUnavailable` → temporary-failure message + retry |

Provider error text, HTTP status lines and stack traces are never surfaced; the tokenization seam returns the
same `ApiError`-shaped plain object used by the rest of the app.

## Avoided behaviours

- Never tokenize when the form is invalid or a tokenization is already in flight (double-click guard).
- Never store the card fields (number/expiry/CVC/cardholder) anywhere but the component's local state.
- Never send the card number/CVC to our own API.
- Never reuse a token across purchases (tokens are single-use).
