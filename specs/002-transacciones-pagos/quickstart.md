# Quickstart: Transactions and Card Payment Processing

**Feature**: `002-transacciones-pagos` | **Date**: 2026-10-09

Manual, end-to-end validation guide. Automated tests never call the real sandbox.

## Prerequisites

- PostgreSQL 14 or newer running locally; a database reachable through `DATABASE_URL`.
- `back-end/` dependencies installed (`npm ci`).
- Local `.env` (gitignored) with the provider sandbox variables and the app variables:

```dotenv
DATABASE_URL=...
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
UAT_SANDBOX_URL=https://<sandbox-host>/v1
pub_stagtest=...
prv_stagtest=...
stagtest_events=...
stagtest_integrity=...
# optional overrides (defaults shown)
BASE_FEE_IN_CENTS=300000
DELIVERY_FEE_IN_CENTS=900000
PAYMENT_TIMEOUT_MS=10000
RESERVATION_TTL_SECONDS=900
PAYMENT_CLAIM_LEASE_SECONDS=120
```

Values are never committed; `.env.example` lists the names with empty values.

## Setup

```bash
cd back-end
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy   # applies the new payment-fields migration
npm run prisma:seed             # products already in cents (15,000 COP -> 1500000)
npm run start:dev               # http://localhost:3000, Swagger at /docs
```

## Optional pre-check: provider spike (manual, no code)

```bash
cd back-end
./scripts/sandbox-spike.sh ../.env approved
./scripts/sandbox-spike.sh ../.env declined
```

Confirms the base URL, that the **private key** authorizes `POST /transactions`, and the approved/declined
outcomes. It prints no keys or tokens, so tokenization is done separately in step 3 below.

## Validate the feature with `curl`

Use a product id from `GET /products` (e.g. `77777777-7777-4777-8777-777777777777`, Cable Organizer,
`priceInCents` 1500000).

```bash
# 1) Checkout config (public, no secrets)
curl -s localhost:3000/payments/checkout-config

# 2) Create a pending purchase (note the idempotency key; 16-64 chars of letters/digits/dash/underscore)
curl -s -X POST localhost:3000/transactions \
  -H 'Idempotency-Key: demo-key-00000001' -H 'Content-Type: application/json' \
  -d '{"productId":"77777777-7777-4777-8777-777777777777","quantity":1,
       "customer":{"fullName":"Test Buyer","email":"buyer@example.com","phone":"+57 300 000 0000"},
       "delivery":{"address":"Calle 1 #2-3","city":"Bogotá","region":"Cundinamarca"}}'

# 2b) Repeat with the same key -> 200 replay, same id/reference, no new purchase, no extra stock reserved
#     Same key with a different product/quantity/email -> 409 IDEMPOTENCY_KEY_REUSED

# 3) Tokenize the card with the PUBLIC key and the approved test card. The spike does NOT print the token,
#    so create one here; copy data.id from the response.
set -a; source ../.env; set +a
curl -s -X POST "$UAT_SANDBOX_URL/tokens/cards" \
  -H "Authorization: Bearer $pub_stagtest" -H 'Content-Type: application/json' \
  -d '{"number":"4242424242424242","cvc":"123","exp_month":"12","exp_year":"29","card_holder":"Test Buyer"}'

# 3b) Start the payment with the token returned in data.id
curl -s -X POST localhost:3000/transactions/<id>/payment \
  -H 'Content-Type: application/json' \
  -d '{"cardToken":"<data.id>","installments":1,"acceptedContracts":true}'

# 4) Poll the source of truth until it leaves PENDING
curl -s localhost:3000/transactions/<id>
```

## Expected outcomes

| Scenario (card) | Final status | Delivery | Stock |
|-----------------|--------------|----------|-------|
| `4242 4242 4242 4242` (approved) | `APPROVED` | `ASSIGNED` | decremented by quantity (permanently) |
| `4111 1111 1111 1111` (declined) | `DECLINED` | none | restored to the previous value |
| other number (error) | `ERROR` | none | restored |

Additional checks:

- Creating a purchase with the same `Idempotency-Key` twice returns the same purchase (200) and never a
  duplicate; the same key with a different product, quantity or email returns 409 `IDEMPOTENCY_KEY_REUSED`.
- Two concurrent purchases of the last unit result in exactly one success; stock is never negative.
- A non-`PENDING` purchase cannot be paid again (409).
- `acceptedContracts: false` is rejected (422 `CONTRACTS_NOT_ACCEPTED`).
- A purchase left `PENDING` without payment past `RESERVATION_TTL_SECONDS` is released on read (`VOIDED` /
  `RESERVATION_EXPIRED`) and its stock returns.
- An invalid/used card token yields 422 `INVALID_PAYMENT_TOKEN` and the shopper can retry with a new token.
- A provider status that is not a known final value stays `PENDING` (a warning is logged) and never finalizes.
- No response or log contains a provider secret or a full card number.

## Automated tests (no sandbox)

```bash
cd back-end
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run test:cov      # unit: use cases with fakes, adapter with mocked fetch
npm run test:e2e      # e2e with the fake gateway (setup-env.ts provides placeholders)
```

Definition of done: lint clean, type-check clean, coverage ≥ 80 %, no secrets and no provider company name,
Swagger updated.
