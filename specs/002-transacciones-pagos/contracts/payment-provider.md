# Contract: Payment Provider Integration (sandbox) and the `PaymentGateway` Port

**Feature**: `002-transacciones-pagos` | **Date**: 2026-10-09

The adapter (`infrastructure/payments/http-payment-gateway.adapter.ts`) implements the domain port below and
talks to the provider sandbox with the built-in `fetch` and an `AbortController` timeout. It owns all secrets.

## Domain port

```ts
// domain/ports/payment-gateway.port.ts
export interface MerchantInfo {
  acceptanceToken: string;        // presigned_acceptance.acceptance_token
  termsPermalink: string;         // presigned_acceptance.permalink
  personalDataAuthToken: string;  // presigned_personal_data_auth.acceptance_token
  personalDataPermalink: string;  // presigned_personal_data_auth.permalink
  installments: { default: number; max: number };
}

export interface ProviderTransaction {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';
  statusMessage: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  installments: number | null;
}

export interface CreateCardTransactionInput {
  acceptanceToken: string;
  acceptPersonalAuth: string;
  amountInCents: number;
  currency: string;
  reference: string;
  customerEmail: string;
  cardToken: string;
  installments: number;
}

export interface PaymentGateway {
  getMerchantInfo(): Promise<MerchantInfo>;
  createCardTransaction(input: CreateCardTransactionInput): Promise<ProviderTransaction>;
  getTransaction(providerTransactionId: string): Promise<ProviderTransaction>;
  findByReference(reference: string): Promise<ProviderTransaction | null>;
}
```

The adapter throws `PaymentProviderUnavailableError` (timeout/network/5xx) or
`PaymentProviderRejectedError` (4xx/business rejection); use cases catch them and return `Result` errors.

## Provider calls (verified in the spike)

Base URL: `UAT_SANDBOX_URL`. Public key: `pub_stagtest`. Private key: `prv_stagtest`.
Integrity secret: `stagtest_integrity` (signature only). Events secret: `stagtest_events` (webhook only).

### 1. Merchant / acceptance tokens

```http
GET {base}/merchants/{publicKey}
```

No `Authorization` header. Fields used: `data.presigned_acceptance.{acceptance_token,permalink}`,
`data.presigned_personal_data_auth.{acceptance_token,permalink}`, `data.installments_config.{default_installments,max_installments}`.

### 2. Tokenize card (browser only — NOT called by the back-end)

```http
POST {base}/tokens/cards        Authorization: Bearer {publicKey}
{ "number", "cvc", "exp_month", "exp_year", "card_holder" }
```

The back-end never performs this call and never sees the number/CVC; it only receives the resulting token.

### 3. Create the provider transaction

```http
POST {base}/transactions        Authorization: Bearer {privateKey}
```

```json
{
  "acceptance_token": "<fresh>",
  "accept_personal_auth": "<fresh>",
  "amount_in_cents": 2700000,
  "currency": "COP",
  "signature": "<SHA256 hex>",
  "customer_email": "buyer@example.com",
  "reference": "TXN-1759999999-1234",
  "payment_method": { "type": "CARD", "token": "tok_...", "installments": 1 }
}
```

Response used: `data.id`, `data.status`. The provider never answers synchronously; a new transaction is
`PENDING`.

**Signature**: `SHA256hex(reference + amount_in_cents + currency + integritySecret)` (computed in the
adapter, `node:crypto`).

### 4. Read one provider transaction

```http
GET {base}/transactions/{providerId}        Authorization: Bearer {privateKey}
```

Fields used: `data.status`, `data.status_message`, `data.payment_method.extra.brand`,
`data.payment_method.extra.last_four`, `data.payment_method.installments`. Known statuses
(`APPROVED|DECLINED|VOIDED|ERROR`) map directly; `PENDING` and **any unknown value** map to the domain
`PENDING` (an unknown status logs a warning without secrets and **never finalizes** the purchase).

### 5. Reconcile by reference (used by every claimer before creating)

```http
GET {base}/transactions?reference={reference}   Authorization: Bearer {privateKey}
```

Verified: 200 with the private key (`{ "data": [...], "meta": {...} }`), 401 without it. Returns the first
match or `null`.

## Timeout & error behavior

- Every call is bounded by `PAYMENT_TIMEOUT_MS` (default 10 000) via `AbortController`.
- **Provider 4xx about the token** → the claim is cleared and the caller answers 422 `INVALID_PAYMENT_TOKEN`
  (the shopper retries with a new token).
- **Any other provider 4xx** → `PaymentProviderRejectedError` → HTTP 502 `PAYMENT_PROVIDER_REJECTED` with a
  generic message (no provider internals leaked).
- Timeout, network error or provider 5xx → `PaymentProviderUnavailableError` → HTTP 503; the claim is kept and
  the next claimer reconciles with `findByReference` (R6).
- Secrets and full responses are never logged; only status codes and safe messages. Unknown statuses log a
  warning without secrets.

## Sandbox test cards (manual spike only)

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | `APPROVED` |
| `4111 1111 1111 1111` | `DECLINED` |
| any other number | `ERROR` |

No automated test calls the real sandbox; unit tests mock `fetch` and e2e uses a fake gateway.
