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

export interface TransactionView {
  id: string
  reference: string
  status: TransactionStatus
  quantity: number
  amounts: TransactionAmounts
  card: TransactionCard | null
  product: TransactionProduct
  delivery: TransactionDeliveryView | null
  failureReason: string | null
}
