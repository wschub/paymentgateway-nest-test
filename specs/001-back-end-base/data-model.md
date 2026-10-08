# Data Model: Back-end Base

All ids are UUIDs. Money is stored as integers in COP minor units (fields end in `InCents`).
This diagram is reused in the repository README.

```mermaid
erDiagram
    PRODUCT ||--o{ TRANSACTION : "is bought in"
    CUSTOMER ||--o{ TRANSACTION : "places"
    TRANSACTION ||--o| DELIVERY : "has"

    PRODUCT {
        uuid id PK
        string name
        string description
        int priceInCents
        int stock
        string imageUrl
        datetime createdAt
        datetime updatedAt
    }
    CUSTOMER {
        uuid id PK
        string fullName
        string email
        string phone
        datetime createdAt
    }
    TRANSACTION {
        uuid id PK
        string reference UK
        string idempotencyKey UK
        enum status
        int quantity
        int productAmountInCents
        int baseFeeInCents
        int deliveryFeeInCents
        int totalInCents
        string providerTransactionId
        string failureReason
        uuid productId FK
        uuid customerId FK
        datetime createdAt
        datetime updatedAt
    }
    DELIVERY {
        uuid id PK
        uuid transactionId FK
        enum status
        string address
        string city
        string region
        string postalCode
        string notes
        datetime assignedAt
        datetime createdAt
    }
```

## Enums

- `TransactionStatus`: `PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`
- `DeliveryStatus`: `PENDING`, `ASSIGNED`

## Constraints

| Entity | Constraint |
|--------|-----------|
| Product | `stock >= 0` (CHECK), `priceInCents > 0` (CHECK) |
| Customer | index on `email` (not unique: guest checkout may repeat) |
| Transaction | `reference` unique, `idempotencyKey` unique, `quantity > 0` (CHECK), all `*InCents >= 0` (CHECK), `totalInCents = productAmountInCents + baseFeeInCents + deliveryFeeInCents` (CHECK), FKs to Product and Customer, default status `PENDING` |
| Delivery | `transactionId` unique FK (one delivery per transaction), `assignedAt` only set when status is `ASSIGNED` |

The CHECK constraints are added by hand in a SQL migration created with
`prisma migrate dev --create-only`, since `schema.prisma` cannot express them.

## Scope in this feature

The schema defines all four entities. Domain entities, ports, repositories and use cases are implemented
for Product only. Customer, Transaction and Delivery logic arrives in feature 002.
