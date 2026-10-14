export interface CheckoutConfig {
  publicKey: string
  baseUrl: string
  currency: string
  contracts: {
    terms: string
    personalData: string
  }
  installments: {
    default: number
    max: number
  }
}

export type TransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR'

export interface TransactionAmounts {
  productAmountInCents: number
  baseFeeInCents: number
  deliveryFeeInCents: number
  totalInCents: number
}

export interface TransactionCard {
  brand: string | null
  lastFour: string | null
  installments: number | null
}

export interface TransactionProduct {
  id: string
  name: string
  quantity: number
}

export interface TransactionDeliveryView {
  status: string
  address: string
  city: string
  region: string
}

/** The delivery location the summary and the status screens need. */
export type DeliveryLocation = Pick<
  TransactionDeliveryView,
  'address' | 'city' | 'region'
>

/**
 * The transaction view. `POST /transactions` only fills `id`, `reference`,
 * `status`, `quantity` and `amounts`; `GET /transactions/:id` and
 * `POST /transactions/:id/payment` also enrich it with `card`, `product`,
 * `delivery` and `failureReason`. Every read of the enrichment has to guard
 * for its absence (see `TransactionCreated`).
 */
export interface TransactionView {
  id: string
  reference: string
  status: TransactionStatus
  quantity: number
  amounts: TransactionAmounts
  card?: TransactionCard | null
  product?: TransactionProduct | null
  delivery?: TransactionDeliveryView | null
  failureReason?: string | null
}

/** `POST /transactions` (201 created / 200 replay) response: no enrichment. */
export type TransactionCreated = Omit<
  TransactionView,
  'card' | 'product' | 'delivery' | 'failureReason'
>
