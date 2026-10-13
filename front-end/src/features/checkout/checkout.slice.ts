import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { INSTALLMENTS_DEFAULT, MAX_QUANTITY_PER_PURCHASE } from '@/shared/constants'
import { clampQuantity } from '@/shared/product'
import type { ApiError, ApiErrorKind } from '@/shared/api/api.errors'
import type { TransactionStatus, TransactionView } from '@/features/checkout/checkout.types'

export type CheckoutStep = 'product' | 'cardAndDelivery' | 'summary' | 'finalStatus'

export type PaymentStatus =
  | 'idle'
  | 'creating'
  | 'paying'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'voided'
  | 'error'

export interface DeliveryData {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  region: string
  notes?: string
}

export interface CheckoutState {
  currentStep: CheckoutStep
  selectedProductId: string | null
  quantity: number
  delivery: DeliveryData | null
  transactionId: string | null
  idempotencyKey: string | null
  cardBrand: string | null
  cardLastFour: string | null
  installments: number
  contractsAccepted: boolean
  paymentStatus: PaymentStatus
  paymentError: ApiError | null
  transaction?: TransactionView | null
  lastReadRequestId?: string | null
}

export const paymentStatusFromTransaction = (
  status: TransactionStatus,
): PaymentStatus => {
  switch (status) {
    case 'APPROVED':
      return 'approved'
    case 'DECLINED':
      return 'declined'
    case 'VOIDED':
      return 'voided'
    case 'ERROR':
      return 'error'
    case 'PENDING':
    default:
      return 'pending'
  }
}

const TRANSIENT_READ_KINDS: readonly ApiErrorKind[] = [
  'network',
  'rateLimited',
  'server',
]

export interface PurchaseStartedPayload {
  productId: string
  quantity: number
}

export interface RestoredPayload {
  currentStep: CheckoutStep
  selectedProductId: string | null
  quantity: number
  delivery: DeliveryData | null
  transactionId: string | null
  idempotencyKey?: string | null
}

export interface CardDisplayPayload {
  brand: string | null
  lastFour: string | null
}

const initialState: CheckoutState = {
  currentStep: 'product',
  selectedProductId: null,
  quantity: 1,
  delivery: null,
  transactionId: null,
  idempotencyKey: null,
  cardBrand: null,
  cardLastFour: null,
  installments: INSTALLMENTS_DEFAULT,
  contractsAccepted: false,
  paymentStatus: 'idle',
  paymentError: null,
  transaction: null,
  lastReadRequestId: null,
}

const clampInstallments = (value: number): number => {
  if (!Number.isFinite(value)) {
    return INSTALLMENTS_DEFAULT
  }
  const truncated = Math.trunc(value)
  return truncated < 1 ? 1 : truncated
}

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    purchaseStarted(state, action: PayloadAction<PurchaseStartedPayload>) {
      state.currentStep = 'product'
      state.selectedProductId = action.payload.productId
      state.quantity = clampQuantity(
        action.payload.quantity,
        MAX_QUANTITY_PER_PURCHASE,
      )
    },
    quantityChanged(state, action: PayloadAction<number>) {
      state.quantity = clampQuantity(
        action.payload,
        MAX_QUANTITY_PER_PURCHASE,
      )
    },
    deliveryChanged(state, action: PayloadAction<DeliveryData>) {
      state.delivery = action.payload
    },
    checkoutStepChanged(state, action: PayloadAction<CheckoutStep>) {
      state.currentStep = action.payload
    },
    idempotencyKeySet(state, action: PayloadAction<string | null>) {
      state.idempotencyKey = action.payload
    },
    cardDisplaySet(state, action: PayloadAction<CardDisplayPayload>) {
      state.cardBrand = action.payload.brand
      state.cardLastFour = action.payload.lastFour
    },
    installmentsChanged(state, action: PayloadAction<number>) {
      state.installments = clampInstallments(action.payload)
    },
    contractsAcceptanceChanged(state, action: PayloadAction<boolean>) {
      state.contractsAccepted = action.payload
    },
    paymentStatusChanged(state, action: PayloadAction<PaymentStatus>) {
      state.paymentStatus = action.payload
      if (action.payload !== 'error') {
        state.paymentError = null
      }
    },
    paymentFailed(state, action: PayloadAction<ApiError>) {
      state.paymentStatus = 'error'
      state.paymentError = action.payload
    },
    paymentErrorCleared(state) {
      state.paymentError = null
      if (state.paymentStatus === 'error') {
        state.paymentStatus = 'idle'
      }
    },
    transactionReadStarted(state, action: PayloadAction<string>) {
      state.lastReadRequestId = action.payload
    },
    transactionReceived(state, action: PayloadAction<TransactionView>) {
      state.transaction = action.payload
      state.paymentStatus = paymentStatusFromTransaction(action.payload.status)
      state.paymentError = null
    },
    transactionReadFailed(state, action: PayloadAction<ApiError>) {
      state.paymentError = action.payload
      if (!TRANSIENT_READ_KINDS.includes(action.payload.kind)) {
        state.paymentStatus = 'error'
      }
    },
    startOver: () => initialState,
    purchaseCompleted: () => initialState,
    retryAfterFinal(state) {
      state.currentStep = 'cardAndDelivery'
      state.transactionId = null
      state.transaction = null
      state.lastReadRequestId = null
      state.paymentStatus = 'idle'
      state.paymentError = null
      state.cardBrand = null
      state.cardLastFour = null
      state.installments = INSTALLMENTS_DEFAULT
    },
    restored(state, action: PayloadAction<RestoredPayload>) {
      state.currentStep = action.payload.currentStep
      state.selectedProductId = action.payload.selectedProductId
      state.quantity = action.payload.quantity
      state.delivery = action.payload.delivery
      state.transactionId = action.payload.transactionId
      state.idempotencyKey = action.payload.idempotencyKey ?? null
      state.cardBrand = null
      state.cardLastFour = null
      state.installments = INSTALLMENTS_DEFAULT
      state.contractsAccepted = false
      state.paymentStatus = 'idle'
      state.paymentError = null
      state.transaction = null
      state.lastReadRequestId = null
    },
  },
})

export const {
  purchaseStarted,
  quantityChanged,
  deliveryChanged,
  checkoutStepChanged,
  idempotencyKeySet,
  cardDisplaySet,
  installmentsChanged,
  contractsAcceptanceChanged,
  paymentStatusChanged,
  paymentFailed,
  paymentErrorCleared,
  transactionReadStarted,
  transactionReceived,
  transactionReadFailed,
  startOver,
  purchaseCompleted,
  retryAfterFinal,
  restored,
} = checkoutSlice.actions

export default checkoutSlice.reducer
