# Back-end — Payment Gateway API

NestJS + Prisma + PostgreSQL API for the mobile-first checkout: product catalog, transactions and card
payment.

See the root [`README.md`](../README.md) for the full overview, architecture, data model, environment
variables and how to run the whole project.

## Layout

- `src/domain` — entities (`Product`, `Transaction`, `Customer`, `Delivery`), value objects (`FeesConfig`),
  ports (`ProductRepository`, `TransactionRepository`, `PaymentGateway`, `Clock`, `ReferenceGenerator`) and
  errors. No framework imports.
- `src/application` — use cases returning a typed `Result` (Railway Oriented Programming): `GetProducts`,
  `GetProductById`, `CreateTransaction`, `PayTransaction`, `GetTransaction`, `GetCheckoutConfig`.
- `src/infrastructure` — Prisma repositories, the HTTP payment-gateway adapter, the HTTP layer
  (controllers, DTOs, error filter/mapper, Swagger, `configureApp`) and config validation.
- `src/testing` — in-memory fakes and the fake gateway used by the unit and e2e suites (excluded from
  coverage).

## Run

```bash
cp ../.env.example ../.env   # then fill in the values
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```

Swagger UI is served at `http://localhost:3000/docs` (openAPI JSON at `/docs-json`).

Endpoints: `GET /products`, `GET /products/:id`, `GET /payments/checkout-config`, `POST /transactions`,
`POST /transactions/:id/payment`, `GET /transactions/:id`. An optional `POST /webhooks/payment-events` is not
enabled.

## Environment variables

All values live in the root `.env` (loaded by the Prisma scripts via `dotenv-cli -e ../.env`); names only:

| Variable | Used by |
| -------- | ------- |
| `DATABASE_URL` | App / Prisma |
| `PORT` | App (HTTP port) |
| `NODE_ENV` | App (`development`, `test`, `production`) |
| `CORS_ORIGINS` | App (comma-separated allowed origins) |
| `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX` | App (throttler) |
| `UAT_SANDBOX_URL` | Payment provider adapter (sandbox base URL) |
| `pub_stagtest` | Public key returned by the checkout config |
| `prv_stagtest`, `stagtest_events`, `stagtest_integrity` | Provider secrets (adapter only, server-side) |
| `BASE_FEE_IN_CENTS`, `DELIVERY_FEE_IN_CENTS` *(optional)* | Fees config (defaults 300000 / 900000) |
| `PAYMENT_TIMEOUT_MS`, `RESERVATION_TTL_SECONDS`, `PAYMENT_CLAIM_LEASE_SECONDS` *(optional)* | Timers (defaults 10000 / 900 / 120) |
| `TEST_DATABASE_URL` | Integration suite only (DB name must end with `_test`) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker Compose only |

Startup fails fast if a required variable is missing or invalid. Secrets never leave the gateway adapter and
are never committed.

## Payment provider flow

1. `GET /payments/checkout-config` returns the public key, currency and contract links for the browser.
2. The browser tokenizes the card with the provider (card data never reaches this service).
3. `POST /transactions` creates a `PENDING` purchase and reserves stock (idempotent via `Idempotency-Key`).
4. `POST /transactions/:id/payment` starts the charge; the provider transaction is created **at most once**
   (a re-claimable lease plus reconcile-by-reference), and the current view is returned.
5. `GET /transactions/:id` reads the source of truth and finalizes the purchase idempotently.

Provider timeouts/5xx keep the claim (`503`); a definitive token rejection clears it (`422`) so the shopper
can retry with a new token. Approved assigns the delivery; declined/voided/error releases the reserved stock.

### Manual sandbox spike

```bash
./scripts/sandbox-spike.sh ../.env approved
./scripts/sandbox-spike.sh ../.env declined
```

Confirms the base URL, that the private key authorizes the provider call and the approved/declined outcomes.
It prints no keys or tokens. Full walkthrough:
[`../specs/002-transacciones-pagos/quickstart.md`](../specs/002-transacciones-pagos/quickstart.md). Test cards:
`4242 4242 4242 4242` (approved), `4111 1111 1111 1111` (declined). Automated tests never call the sandbox.

## Tests

```bash
npm run lint
npm run build
npm run test:cov      # unit + coverage (in-memory fakes, mocked fetch)
npm run test:e2e      # e2e (fake gateway)
npm run test:int      # integration vs. real PostgreSQL (TEST_DATABASE_URL, DB name must end _test)
```

Latest real results: unit/coverage **54 suites, 495 tests** (Statements 96.38 %, Branches 90.73 %,
Functions 100 %, Lines 96.19 %); e2e **12 suites, 49 tests**; integration **1 suite, 21 tests**.
